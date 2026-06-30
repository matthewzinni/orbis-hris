import { safeGet } from './helpers';

/**
 * Render HTML into #printArea and print with a body class that hides the rest of the app.
 */
export function printDocument(html: string, bodyClass: string): void {
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
