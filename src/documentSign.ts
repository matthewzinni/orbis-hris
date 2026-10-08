import { createTypedSignatureImage } from './ui/signaturePads';
import { documentPreview, mountDocumentEditor } from './ui/documentEditor';
import { validateDocumentContent, type SigningDocument } from './services/signingDocumentModel';
import { esc } from './utils/helpers';

const token=decodeURIComponent(window.location.hash.slice(1));
const body=document.getElementById('documentSignBody')!;
const endpoint=`${String(import.meta.env.VITE_SUPABASE_URL||'').replace(/\/$/,'')}/functions/v1/document-signature`;
async function call(action:string,values:Record<string,unknown>={}):Promise<{document?:SigningDocument;expiresAt?:string;error?:string}> {
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:String(import.meta.env.VITE_SUPABASE_ANON_KEY||'')},body:JSON.stringify({token,action,...values})});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not load the document.');return result;
}
async function load():Promise<void> {
  if(!token){body.innerHTML='<div class="sign-error">This document signing link is missing a token.</div>';return;}
  try {
    const payload=await call('get');const doc=payload.document!;
    document.getElementById('documentSignTitle')!.textContent=doc.content.title;
    if(doc.status==='signed') {
      body.innerHTML=`<div class="sign-success">Signed by ${esc(doc.signed_name)}. Your signature has been recorded.</div>${documentPreview(doc.signed_content!)}<div class="sign-actions"><button type="button" class="button primary" data-signed-download>Download signed PDF</button></div><div role="alert" data-download-error></div>`;
      body.querySelector('[data-signed-download]')!.addEventListener('click',async()=>{
        try {const {downloadSigningPdf}=await import('./services/signingDocumentPdf');await downloadSigningPdf(doc.signed_content!,doc);}catch{body.querySelector('[data-download-error]')!.textContent='Could not download the PDF. Please try again.';}
      });return;
    }
    body.innerHTML=`<p class="muted">Prepared for ${esc(doc.signer_name)} · ${esc(doc.signer_email)}. Link expires ${esc(new Date(payload.expiresAt!).toLocaleDateString())}.</p>
      ${doc.allow_recipient_edits?'<p>You may edit the document text and letterhead before signing. Your final version will be saved with your signature.</p>':''}
      <div data-document-review></div>
      <label for="publisherSignName">Your full name</label><input id="publisherSignName" type="text" maxlength="200" autocomplete="name" value="${esc(doc.signer_name)}">
      <div class="signature-typed-row"><button class="button soft" type="button" data-publisher-preview>Preview signature</button><button class="button soft" type="button" data-publisher-pdf>Preview PDF</button></div>
      <div class="sign-preview document-sign-preview" data-publisher-signature></div>
      <label class="document-consent"><input type="checkbox" data-publisher-consent><span>I have reviewed this final document, am authorized to sign it, and consent to signing electronically.</span></label>
      <div class="sign-actions"><button class="button primary" type="button" data-publisher-sign>Sign final document</button></div><div class="sign-error" role="alert" data-publisher-error hidden></div>`;
    const review=body.querySelector<HTMLElement>('[data-document-review]')!;
    const read=doc.allow_recipient_edits?mountDocumentEditor(review,doc.content,()=>{body.querySelector<HTMLInputElement>('[data-publisher-consent]')!.checked=false;}):()=>doc.content;
    if(!doc.allow_recipient_edits)review.innerHTML=documentPreview(doc.content);
    const name=body.querySelector<HTMLInputElement>('#publisherSignName')!;
    let signature='';
    const error=(text:string)=>{const target=body.querySelector<HTMLElement>('[data-publisher-error]')!;target.hidden=false;target.textContent=text;};
    name.addEventListener('input',()=>{body.querySelector<HTMLInputElement>('[data-publisher-consent]')!.checked=false;signature='';body.querySelector('[data-publisher-signature]')!.innerHTML='';});
    body.querySelector('[data-publisher-preview]')!.addEventListener('click',()=>{
      if(name.value.trim().length<2){error('Enter your full name.');return;}
      signature=createTypedSignatureImage(name.value.trim());
      body.querySelector('[data-publisher-signature]')!.innerHTML=`<img src="${signature}" alt="Your signature preview">`;
    });
    body.querySelector('[data-publisher-pdf]')!.addEventListener('click',async()=>{
      const invalid=validateDocumentContent(read());if(invalid){error(invalid);return;}
      try {const {downloadSigningPdf}=await import('./services/signingDocumentPdf');await downloadSigningPdf(read());}catch{error('Could not create the PDF preview. Please try again.');}
    });
    const sign=body.querySelector<HTMLButtonElement>('[data-publisher-sign]')!;
    sign.addEventListener('click',async()=>{
      const content=read();const invalid=validateDocumentContent(content);if(invalid){error(invalid);return;}
      if(!body.querySelector<HTMLInputElement>('[data-publisher-consent]')!.checked){error('Review the document and select the consent checkbox.');return;}
      if(!signature){error('Preview your signature before signing.');return;}
      const signerName=name.value.trim();
      const controls=Array.from(body.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>('input,textarea,button'));
      controls.forEach(control=>{control.disabled=true;});
      try {
        // Generate the exact reviewed document before recording an irreversible signature.
        const {buildSigningPdf}=await import('./services/signingDocumentPdf');await buildSigningPdf(content);
        await call('sign',{content,signature,name:signerName,agreed:true});await load();
      }catch(err){error(err instanceof Error?err.message:'Could not record your signature.');controls.forEach(control=>{control.disabled=false;});}
    });
  } catch(error){body.innerHTML=`<div class="sign-error">${esc(error instanceof Error?error.message:'Could not load the document.')}</div>`;}
}
void load();
