import { PDFDocument } from 'pdf-lib';
import type { SigningDocument, SigningDocumentContent } from './signingDocumentModel';

/** Render the exact stored text with browser fonts, preserving Unicode in the PDF. */
export async function buildSigningPdf(content: SigningDocumentContent, signed?: SigningDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(content.title); pdf.setCreator('Orbis · BTW Global');
  const width=1224, height=1584, margin=96, bottom=height-110;
  let canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, y: number;
  function startPage() {
    canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
    ctx=canvas.getContext('2d')!; ctx.fillStyle='#fff'; ctx.fillRect(0,0,width,height); ctx.fillStyle='#182335'; y=margin;
  }
  async function finishPage() {
    ctx.font='18px Arial'; ctx.fillStyle='#64748b'; ctx.fillText(`${pdf.getPageCount()+1}`,width-margin-20,height-50);
    const image=await pdf.embedPng(canvas.toDataURL('image/png'));
    const page=pdf.addPage([612,792]); page.drawImage(image,{x:0,y:0,width:612,height:792});
  }
  async function text(value: string, size=22, bold=false, gap=10) {
    ctx.font=`${bold?'bold ':''}${size}px Arial`;ctx.fillStyle='#182335';
    const maxWidth=width-margin*2;
    for (const paragraph of value.split('\n')) {
      // Preserve characters and whitespace, wrapping long words as well as prose.
      let line='';
      for (const character of Array.from(paragraph)) {
        if (ctx.measureText(line+character).width>maxWidth && line) {
          if(y+size*1.5>bottom){await finishPage();startPage();ctx.font=`${bold?'bold ':''}${size}px Arial`;}
          ctx.fillText(line,margin,y);y+=size*1.5;line='';
        }
        line+=character;
      }
      if(y+size*1.5>bottom){await finishPage();startPage();ctx.font=`${bold?'bold ':''}${size}px Arial`;}
      ctx.fillText(line,margin,y);y+=size*1.5;
    }
    y+=gap;
  }
  async function image(dataUrl:string,maxWidth:number,maxHeight:number) {
    const img=new Image();img.src=dataUrl;await img.decode();
    const scale=Math.min(maxWidth/img.naturalWidth,maxHeight/img.naturalHeight);
    const w=img.naturalWidth*scale,h=img.naturalHeight*scale;
    if(y+h>bottom){await finishPage();startPage();}
    ctx.drawImage(img,margin,y,w,h);y+=h+24;
  }
  startPage();
  if(content.logo) await image(content.logo,300,130);
  if(content.letterhead_name) await text(content.letterhead_name,28,true);
  if(content.letterhead_details) await text(content.letterhead_details,18);
  ctx.strokeStyle='#213e64';ctx.beginPath();ctx.moveTo(margin,y);ctx.lineTo(width-margin,y);ctx.stroke();y+=50;
  await text(content.title,32,true,24);await text(content.body,22,false,24);
  await finishPage();
  if (signed) {
    startPage();
    await text('Electronic signature record',32,true,24);
    await text(content.title,24,true);
    await text(`Signed by: ${signed.signed_name || ''}\nRecipient email: ${signed.signer_email}\nRecorded at: ${signed.signed_at || ''}\nDocument ID: ${signed.id}`,20);
    if(signed.signature) await image(signed.signature,650,140);
    await text('The signer reviewed the final document and consented to sign electronically. Access to the signing link was used; the recipient email was specified by the sender.',18,false,20);
    await text(`Final document SHA-256:\n${signed.signed_hash || ''}`,16);
    await finishPage();
  }
  return pdf.save();
}
export async function downloadSigningPdf(content: SigningDocumentContent, signed?: SigningDocument): Promise<void> {
  const bytes=await buildSigningPdf(content,signed);
  const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/pdf'}));
  const a=document.createElement('a');a.href=url;a.download=`${content.title.replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(0,100)||'document'}${signed?'-signed':''}.pdf`;
  document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
