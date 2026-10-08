import { esc } from '../utils/helpers';
import { emptyDocumentContent, type SigningDocumentContent } from '../services/signingDocumentModel';

export function documentPreview(content: SigningDocumentContent): string {
  const logo = /^data:image\/(png|jpeg);base64,[a-z0-9+/]+={0,2}$/i.test(content.logo) ? `<img class="document-logo" src="${content.logo}" alt="Letterhead logo">` : '';
  return `<article class="document-paper">${logo}<header><strong>${esc(content.letterhead_name)}</strong><div class="document-letterhead-details">${esc(content.letterhead_details)}</div></header><h2>${esc(content.title)}</h2><div class="document-text">${esc(content.body)}</div></article>`;
}
export function mountDocumentEditor(root: HTMLElement, initial: SigningDocumentContent = emptyDocumentContent(), onChange?: () => void): () => SigningDocumentContent {
  let logo = initial.logo;
  root.innerHTML = `<div class="document-editor-fields">
    <label>Document title<input data-doc-field="title" maxlength="200" value="${esc(initial.title)}"></label>
    <label>Letterhead name<input data-doc-field="letterhead_name" maxlength="200" placeholder="Company or publisher name" value="${esc(initial.letterhead_name)}"></label>
    <label>Letterhead details<textarea data-doc-field="letterhead_details" rows="3" maxlength="2000" placeholder="Address, website, contact details">${esc(initial.letterhead_details)}</textarea></label>
    <label>Letterhead logo (PNG or JPG, up to 500 KB)<input data-doc-logo type="file" accept="image/png,image/jpeg"></label>
    <button class="button soft" type="button" data-doc-remove-logo>Remove logo</button>
    <label>Import document text (Word or TXT)<input data-doc-import type="file" accept=".docx,.txt"></label>
    <p class="muted">Word imports bring in text. Review paragraph spacing and add your letterhead here.</p>
    <label>Document text<textarea data-doc-field="body" rows="14" maxlength="100000" placeholder="Write or paste your document here…">${esc(initial.body)}</textarea></label>
    <p class="muted">Blank lines separate paragraphs. Review the preview before requesting a signature.</p>
    <div data-doc-editor-error role="alert"></div>
    </div><div data-doc-preview></div>`;
  const read = (): SigningDocumentContent => ({
    title: (root.querySelector<HTMLInputElement>('[data-doc-field="title"]')?.value || '').trim(),
    letterhead_name: root.querySelector<HTMLInputElement>('[data-doc-field="letterhead_name"]')?.value || '',
    letterhead_details: root.querySelector<HTMLTextAreaElement>('[data-doc-field="letterhead_details"]')?.value || '',
    body: root.querySelector<HTMLTextAreaElement>('[data-doc-field="body"]')?.value || '', logo,
  });
  const preview = () => {
    root.querySelector('[data-doc-preview]')!.innerHTML = documentPreview(read());
    onChange?.();
  };
  root.addEventListener('input', preview);
  root.querySelector('[data-doc-import]')?.addEventListener('change', async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const error = root.querySelector('[data-doc-editor-error]')!;
    if (file.size > 10000000) { error.textContent = 'Choose a Word or TXT file under 10 MB.'; return; }
    try {
      let text: string;
      if (/\.docx$/i.test(file.name)) {
        const { default: mammoth } = await import('mammoth/mammoth.browser');
        text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
      } else if (/\.txt$/i.test(file.name)) { text = await file.text(); }
      else { throw new Error('Choose a .docx or .txt document.'); }
      if (!text.trim() || text.length > 100000) throw new Error('The document must contain text and be under 100,000 characters.');
      const field = root.querySelector<HTMLTextAreaElement>('[data-doc-field="body"]')!;
      if (field.value.trim()) {
        // Ask before replacing an in-progress draft.
        const { showOrbisConfirm } = await import('./confirmModal');
        if (!await showOrbisConfirm('Replace the current document text with the imported text?', {title:'Import document text',confirmLabel:'Replace text'})) return;
      }
      field.value = text;
      const title = root.querySelector<HTMLInputElement>('[data-doc-field="title"]')!;
      if (!title.value) title.value = file.name.replace(/\.(docx|txt)$/i, '').slice(0,200);
      error.textContent = ''; preview();
    } catch (err) { error.textContent = err instanceof Error ? err.message : 'Could not import this document.'; }
  });
  root.querySelector('[data-doc-remove-logo]')?.addEventListener('click', () => { logo = ''; preview(); });
  root.querySelector('[data-doc-logo]')?.addEventListener('change', async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    const error = root.querySelector('[data-doc-editor-error]')!;
    if (!file) return;
    if (!['image/png','image/jpeg'].includes(file.type) || file.size > 500000) { error.textContent = 'Choose a PNG or JPG logo under 500 KB.'; return; }
    try {
      const nextLogo = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      // Decode before accepting the image so broken files cannot prevent PDF generation.
      const image = new Image(); image.src = nextLogo; await image.decode();
      logo = nextLogo; error.textContent = ''; preview();
    } catch { error.textContent = 'This image could not be read. Choose another PNG or JPG.'; }
  });
  preview();
  return read;
}
