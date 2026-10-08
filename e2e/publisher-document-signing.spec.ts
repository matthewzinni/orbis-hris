import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { zipSync, strToU8 } from 'fflate';

const token='00000000-0000-0000-0000-000000000001';
const original={title:'Publisher agreement',body:'Original publisher terms\n\nPayment terms: agreed separately.',letterhead_name:'BTW Global',letterhead_details:'Original letterhead',logo:''};

test('external publisher edits letterhead and terms, signs once, and downloads the locked PDF',async({page})=>{
 let signed=false;
 let submitted: Record<string, unknown> | undefined;
 let content={...original};
 const errors: string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/functions/v1/document-signature',async route=>{
  const request=route.request().postDataJSON();
  expect(request.token).toBe(token);
  if(request.action==='sign') {submitted=request;content=request.content;signed=true;await route.fulfill({json:{status:'signed'}});return;}
  await route.fulfill({json:{document:{id:token,content:original,signer_name:'Test Publisher',signer_email:'publisher@example.com',allow_recipient_edits:true,status:signed?'signed':'pending',signed_content:signed?content:null,signature:signed?submitted?.signature:null,signed_name:signed?'Test Publisher':null,signed_at:signed?'2026-10-08T16:00:00Z':null,signed_hash:signed?'a'.repeat(64):null},expiresAt:'2030-01-01T00:00:00Z'}});
 });
 await page.goto(`/document-sign.html#${token}`);
 await expect(page.locator('[data-doc-field="body"]')).toHaveValue(original.body);
 await page.locator('[data-publisher-consent]').check();
 await page.locator('[data-doc-field="letterhead_name"]').fill('Publisher Letterhead');
 await expect(page.locator('[data-publisher-consent]')).not.toBeChecked();
 await page.locator('[data-doc-field="body"]').fill('Final edited terms\n\nJosé & Company <script>alert(1)</script>');
 await expect(page.locator('[data-doc-preview]')).toContainText('<script>alert(1)</script>');
 await page.getByRole('button',{name:'Sign final document',exact:true}).click();
 await expect(page.locator('[data-publisher-error]')).toContainText('consent');
 await page.getByRole('button',{name:'Preview signature',exact:true}).click();
 await expect(page.locator('[data-publisher-signature] img')).toBeVisible();
 await page.locator('[data-publisher-consent]').check();
 await page.getByRole('button',{name:'Sign final document',exact:true}).click();
 await expect(page.getByText('Your signature has been recorded.',{exact:false})).toBeVisible();
 expect(submitted?.agreed).toBe(true);expect(submitted?.content).toEqual({...original,letterhead_name:'Publisher Letterhead',body:'Final edited terms\n\nJosé & Company <script>alert(1)</script>'});
 await expect(page.locator('[data-doc-field="body"]')).toHaveCount(0);
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download signed PDF'}).click();
 const download=await downloadPromise;expect(download.suggestedFilename()).toBe('Publisher agreement-signed.pdf');
 const pdf=await PDFDocument.load(await readFile((await download.path())!));expect(pdf.getPageCount()).toBe(2);
 expect(errors).toEqual([]);
});

test('mobile Word import brings document text into the in-Orbis editor',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route('**/functions/v1/document-signature',route=>route.fulfill({json:{document:{id:token,content:original,signer_name:'Test Publisher',signer_email:'publisher@example.com',allow_recipient_edits:true,status:'pending'},expiresAt:'2030-01-01'}}));
 await page.goto(`/document-sign.html#${token}`);
 await page.locator('[data-doc-field="body"]').fill('');
 const docx=zipSync({
  '[Content_Types].xml':strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
  '_rels/.rels':strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
  'word/document.xml':strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Word publisher terms</w:t></w:r></w:p></w:body></w:document>'),
 });
 await page.locator('[data-doc-import]').setInputFiles({name:'publisher.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from(docx)});
 await expect(page.locator('[data-doc-field="body"]')).toHaveValue(/Word publisher terms/);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);expect(overflow).toBe(false);
 await page.screenshot({path:'../publisher-editor-mobile.png',fullPage:true});
});

test('recipient editing is absent when the sender locks the document',async({page})=>{
 await page.route('**/functions/v1/document-signature',route=>route.fulfill({json:{document:{id:token,content:original,signer_name:'Test Publisher',signer_email:'publisher@example.com',allow_recipient_edits:false,status:'pending'},expiresAt:'2030-01-01'}}));
 await page.goto(`/document-sign.html#${token}`);
 await expect(page.locator('[data-doc-field]')).toHaveCount(0);
 await expect(page.locator('.document-paper')).toContainText(original.body);
});

test('cancelled or expired signing links show the server error without revealing a document',async({page})=>{
 await page.route('**/functions/v1/document-signature',route=>route.fulfill({status:410,json:{error:'This signing link has expired. Ask the sender for a new link.'}}));
 await page.goto(`/document-sign.html#${token}`);
 await expect(page.locator('.sign-error')).toContainText('expired');await expect(page.locator('.document-paper')).toHaveCount(0);
});

test('Janus sender creates a draft and a publisher signing link',async({page})=>{
 const user={id:token,email:'sender@example.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01'};
 const jwt=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:token,exp:2000000000,role:'authenticated'})).toString('base64url')}.test`;
 const account={id:token,name:'Test Publisher Account',account_type:'publisher',status:'active'};
 let saved:Record<string,unknown>|undefined;
 let pending=false;
 await page.route('https://placeholder.supabase.co/**',async route=>{
  const url=new URL(route.request().url());
  let json:unknown=[];
  if(url.pathname.endsWith('/auth/v1/token')) json={access_token:jwt,refresh_token:'test-refresh-token',expires_in:3600,token_type:'bearer',user};
  else if(url.pathname.endsWith('/auth/v1/user'))json=user;
  else if(url.pathname.endsWith('/user_access'))json=[{email:user.email,role:'admin',approval_status:'approved',is_active:true}];
  else if(url.pathname.endsWith('/janus_accounts'))json=url.searchParams.has('id')?account:[account];
  else if(url.pathname.endsWith('/rpc/orbis_save_signing_document')) { saved=route.request().postDataJSON();json=token; }
  else if(url.pathname.endsWith('/rpc/orbis_issue_document_signing_link')) { pending=true;json={token,expiresAt:'2030-01-01'}; }
  else if(url.pathname.endsWith('/janus_signing_documents'))json=saved?[{id:token,account_id:token,content:saved.p_content,signer_name:saved.p_signer_name,signer_email:saved.p_signer_email,allow_recipient_edits:saved.p_allow_edits,status:pending?'pending':'draft',created_at:'2026-01-01'}]:[];
  await route.fulfill({json});
 });
 await page.goto('/');
 await page.waitForFunction(()=>typeof window.signIn==='function');
 const login=await page.evaluate(async()=>{const result=await window.signIn?.('sender@example.com','test-password');return {ok:Boolean(result),role:window.currentUserRole,error:document.getElementById('loginError')?.textContent};});
 expect(login).toMatchObject({role:'admin'});
 await page.waitForFunction(()=>window.currentUserRole==='admin');
 await page.evaluate(async()=>{await window.loadJanus?.();await window.openJanusAccountDrawer?.('00000000-0000-0000-0000-000000000001','documents');});
 await page.getByRole('button',{name:'Create document',exact:true}).click();
 await page.locator('#janusDocumentSigning [data-doc-field="title"]').fill('Publisher document');
 await page.locator('#janusDocumentSigning [data-doc-field="body"]').fill('Draft publisher terms');
 await page.locator('[data-signing-name]').fill('Test Publisher');await page.locator('[data-signing-email]').fill('publisher@example.com');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await expect(page.locator('[data-signing-list]')).toContainText('Publisher document');
 expect(saved?.p_account_id).toBe(token);
 await page.getByRole('button',{name:'Create signing link',exact:true}).click();
 await expect(page.locator('.document-signing-link')).toHaveValue(new RegExp(`/document-sign.html#${token}$`));
 await expect(page.locator('[data-signing-list]')).toContainText('Awaiting signature');
 await page.screenshot({path:'../publisher-sender.png',fullPage:true});
});
