import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });

type Content = { title: string; body: string; letterhead_name: string; letterhead_details: string; logo: string };
function contentFrom(value: unknown): Content | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (['title','body','letterhead_name','letterhead_details','logo'].some(key => typeof input[key] !== 'string')) return null;
  const content = { title: input.title as string, body: input.body as string, letterhead_name: input.letterhead_name as string, letterhead_details: input.letterhead_details as string, logo: input.logo as string };
  if (!content.title.trim() || content.title.length>200 || !content.body.trim() || content.body.length>100000 || content.letterhead_name.length>200 || content.letterhead_details.length>2000 || content.logo.length>700000) return null;
  if (content.logo && !validImage(content.logo)) return null;
  return content;
}
function validImage(value: string): boolean {
  if (value.length>700000 || !/^data:image\/(png|jpeg);base64,[a-z0-9+/]+={0,2}$/i.test(value)) return false;
  try { const binary = atob(value.split(',')[1]); return value.startsWith('data:image/png;') ? binary.startsWith('\x89PNG\r\n\x1a\n') : binary.startsWith('\xff\xd8\xff'); } catch { return false; }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers:cors});
  if (req.method !== 'POST') return reply({error:'Method not allowed.'},405);
  try {
    const raw = await req.text(); if (raw.length>2000000) return reply({error:'Document request is too large.'},413);
    let body: Record<string,unknown>; try { body=JSON.parse(raw); } catch { return reply({error:'Invalid request.'},400); }
    const token = String(body.token || '');
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(token)) return reply({error:'This signing link is invalid.'},404);
    const client = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth:{persistSession:false}});
    const {data:link,error:linkError} = await client.from('janus_document_signing_links').select('document_id,status,expires_at').eq('token',token).maybeSingle();
    if (linkError) throw linkError;
    if (!link || link.status==='cancelled') return reply({error:'This signing link is unavailable or was cancelled.'},404);
    if (new Date(link.expires_at).getTime()<=Date.now()) return reply({error:'This signing link has expired. Ask the sender for a new link.'},410);
    const {data:doc,error:docError} = await client.from('janus_signing_documents').select('*').eq('id',link.document_id).single();
    if (docError) throw docError;
    if (body.action==='get') return reply({document:{ id:doc.id, content:doc.content, signer_name:doc.signer_name, signer_email:doc.signer_email, allow_recipient_edits:doc.allow_recipient_edits, status:doc.status, signed_content:doc.signed_content, signature:doc.signature, signed_name:doc.signed_name, signed_at:doc.signed_at, signed_hash:doc.signed_hash },expiresAt:link.expires_at});
    if (body.action!=='sign') return reply({error:'Unknown action.'},400);
    if (link.status!=='pending' || doc.status!=='pending') return reply({error:'This document has already been signed or is no longer available.'},409);
    if (body.agreed!==true) return reply({error:'Review the document and consent to signing electronically.'},400);
    const content=contentFrom(body.content); const signature=String(body.signature || ''); const name=String(body.name || '').trim();
    if (!content || !validImage(signature) || name.length<2 || name.length>200) return reply({error:'Enter your full name and provide a valid signature and document.'},400);
    // Recheck edit permission under the transaction lock in the completion RPC.
    const hashBytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(content)));
    const hash=Array.from(new Uint8Array(hashBytes),value=>value.toString(16).padStart(2,'0')).join('');
    const {data:result,error:completionError}=await client.rpc('orbis_complete_document_signing',{p_token:token,p_content:content,p_signature:signature,p_name:name,p_hash:hash,p_user_agent:req.headers.get('user-agent')||''});
    if (completionError) throw completionError;
    if (result?.status!=='signed') return reply({error: result?.status==='edits_disallowed' ? 'The sender has not allowed document edits.' : 'This link expired, was cancelled, or was already signed. Refresh the page.'},409);
    return reply({status:'signed'});
  } catch (error) {
    console.error('[document-signature] Request failed:',error instanceof Error ? error.message : 'Unknown error');
    return reply({error:'Could not process the document. Please try again.'},500);
  }
});
