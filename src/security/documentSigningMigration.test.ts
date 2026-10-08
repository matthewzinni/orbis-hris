import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

let db: PGlite;
const account='00000000-0000-0000-0000-000000000001';
const content={title:'Publisher agreement',body:'Original terms',letterhead_name:'Publisher',letterhead_details:'Address',logo:''};
const signature='data:image/png;base64,iVBORw0KGgo=';
async function save(allow=true) {
 const result=await db.query<{id:string}>('select public.orbis_save_signing_document($1,$2,$3,$4,$5) as id',[account,JSON.stringify(content),'Test Publisher','publisher@example.com',allow]);return result.rows[0].id;
}
async function issue(id:string){const r=await db.query<{link:{token:string}}> ('select public.orbis_issue_document_signing_link($1) as link',[id]);return r.rows[0].link.token;}
async function complete(token:string,body=content){const r=await db.query<{result:{status:string}}> ('select public.orbis_complete_document_signing($1,$2,$3,$4,$5,$6) as result',[token,JSON.stringify(body),signature,'Test Publisher','a'.repeat(64),'test']);return r.rows[0].result.status;}

beforeAll(async()=>{
 const windowStub=globalThis.window;
 Reflect.deleteProperty(globalThis,'window');
 try { db=await PGlite.create(); } finally { globalThis.window=windowStub; }
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth;
 create function auth.jwt() returns jsonb language sql as $$ select '{"email":"test@example.com"}'::jsonb $$;
 grant usage on schema auth to authenticated;
 grant execute on function auth.jwt() to authenticated;
 create function public.orbis_can_read_janus() returns boolean language sql as $$ select coalesce(current_setting('app.access',true),'write') in ('read','write') $$;
 create function public.orbis_can_write_janus() returns boolean language sql as $$ select coalesce(current_setting('app.access',true),'write')='write' $$;
 create table public.janus_accounts(id uuid primary key);
 insert into public.janus_accounts values ('${account}');`);
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261008160000_janus_document_signing.sql',import.meta.url),'utf8'));
},20000);
afterAll(async()=>{await db?.close();});
describe('publisher signing database workflow',()=>{
 it('saves the final edited snapshot once and locks the signed document',async()=>{
  const id=await save();const token=await issue(id);
  expect(await issue(id)).toBe(token);
  const edited={...content,body:'Approved edited terms',letterhead_name:'Final publisher'};
  expect(await complete(token,edited)).toBe('signed');
  expect(await complete(token)).toBe('unavailable');
  const r=await db.query<{content:typeof content;signed_content:typeof content}>('select content,signed_content from public.janus_signing_documents where id=$1',[id]);
  expect(r.rows[0].content).toEqual(content);expect(r.rows[0].signed_content).toEqual(edited);
  await expect(db.query('select public.orbis_cancel_document_signing_link($1)',[id])).rejects.toThrow('Signed documents');
  await expect(db.query('select public.orbis_save_signing_document($1,$2,$3,$4,$5,$6)',[account,JSON.stringify(content),'Test','test@example.com',true,id])).rejects.toThrow('Only draft');
 });
 it('rejects publisher changes when the sender disallows edits',async()=>{
  const id=await save(false);const token=await issue(id);
  expect(await complete(token,{...content,body:'Changed terms'})).toBe('edits_disallowed');
  expect(await complete(token)).toBe('signed');
 });
 it('revokes cancelled links and rotates the token when reissued',async()=>{
  const id=await save();const token=await issue(id);
  await db.query('select public.orbis_cancel_document_signing_link($1)',[id]);
  expect(await complete(token)).toBe('unavailable');
  const replacement=await issue(id);expect(replacement).not.toBe(token);
  expect(await complete(token)).toBe('unavailable');expect(await complete(replacement)).toBe('signed');
 });
 it('blocks expired links',async()=>{
  const id=await save();const token=await issue(id);
  await db.query("update public.janus_document_signing_links set expires_at=now()-interval '1 second' where token=$1",[token]);
  expect(await complete(token)).toBe('expired');
 });
 it('denies public table access, direct client writes and client signature completion',async()=>{
  await db.exec('set role anon');
  await expect(db.query('select * from public.janus_signing_documents')).rejects.toThrow('permission denied');
  await db.exec('reset role; set role authenticated');
  await expect(db.query("update public.janus_signing_documents set status='signed'")).rejects.toThrow('permission denied');
  await expect(complete('00000000-0000-0000-0000-000000000000')).rejects.toThrow('permission denied');
  await db.exec("set app.access='read'");await expect(save()).rejects.toThrow('Janus edit access');
  await db.exec("set app.access='none'");expect((await db.query('select * from public.janus_signing_documents')).rows).toEqual([]);
  await db.exec("reset role; set app.access='write'");
 });
});
