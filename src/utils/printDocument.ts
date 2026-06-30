import { safeGet } from './helpers';

const PRINT_FRAME_ID = 'orbisPrintFrame';

function cloneDocumentStyles(target: Document): void {
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    target.head.appendChild(node.cloneNode(true));
  });
}

function removePrintFrame(): void {
  document.getElementById(PRINT_FRAME_ID)?.remove();
}

function printViaHiddenFrame(html: string, bodyClass: string): boolean {
  removePrintFrame();

  const frame = document.createElement('iframe');
  frame.id = PRINT_FRAME_ID;
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('title', 'Print preview');
  frame.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';

  let cleanedUp = false;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    removePrintFrame();
  };

  frame.onload = () => {
    const frameWindow = frame.contentWindow;
    const frameDocument = frame.contentDocument;
    if (!frameWindow || !frameDocument) {
      cleanup();
      return;
    }

    frameWindow.addEventListener('afterprint', cleanup, { once: true });
    window.setTimeout(cleanup, 5000);

    requestAnimationFrame(() => {
      frameWindow.focus();
      frameWindow.print();
    });
  };

  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    cleanup();
    return false;
  }

  doc.open();
  doc.write('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /></head><body></body></html>');
  doc.close();

  cloneDocumentStyles(doc);

  const inline = doc.createElement('style');
  inline.textContent = `
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      color: #111827 !important;
      height: auto !important;
      overflow: visible !important;
    }
    body.${bodyClass} {
      padding: 0 !important;
    }
  `;
  doc.head.appendChild(inline);

  doc.body.className = bodyClass;
  doc.body.innerHTML = `<div id="printArea"><div id="printContent">${html}</div></div>`;

  return true;
}

function printViaPrintArea(html: string, bodyClass: string): void {
  const container = safeGet('printContent');
  const printArea = safeGet('printArea');

  if (!container || !printArea) {
    return;
  }

  let cleanedUp = false;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    document.body.classList.remove(bodyClass);
    printArea.classList.add('hidden');
    container.innerHTML = '';
    window.removeEventListener('afterprint', cleanup);
  };

  container.innerHTML = html;
  document.body.classList.add(bodyClass);
  printArea.classList.remove('hidden');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.addEventListener('afterprint', cleanup, { once: true });
      window.print();
      window.setTimeout(cleanup, 2500);
    });
  });
}

/**
 * Print isolated HTML without capturing the Orbis app shell.
 * Uses a hidden iframe so drawers, tabs, and scroll containers never reach the PDF.
 */
export function printDocument(html: string, bodyClass: string): void {
  const trimmed = String(html || '').trim();
  if (!trimmed) return;

  const usedFrame = printViaHiddenFrame(trimmed, bodyClass);
  if (!usedFrame) {
    printViaPrintArea(trimmed, bodyClass);
  }
}
