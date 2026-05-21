/**
 * Canvas signature pads for ER forms (discipline, incidents, performance reviews).
 */

const initializedPads = new Set<string>();

export function initSignaturePad(canvasId: string, statusId: string): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  const status = document.getElementById(statusId);

  if (!canvas || initializedPads.has(canvasId)) {
    return;
  }

  initializedPads.add(canvasId);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  let drawing = false;

  const getPos = (event: MouseEvent | TouchEvent) => {
    const rect = canvas.getBoundingClientRect();
    const point = 'touches' in event ? event.touches[0] : event;

    return {
      x: point.clientX - rect.left,
      y: point.clientY - rect.top,
    };
  };

  const startDrawing = (event: MouseEvent | TouchEvent) => {
    drawing = true;
    const pos = getPos(event);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (event: MouseEvent | TouchEvent) => {
    if (!drawing) {
      return;
    }

    if ('touches' in event) {
      event.preventDefault();
    }

    const pos = getPos(event);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!drawing) {
      return;
    }

    drawing = false;
    canvas.dataset.signature = canvas.toDataURL();

    if (status) {
      status.textContent = 'Signed';
      status.style.color = 'green';
    }
  };

  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  window.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('touchstart', startDrawing);
  canvas.addEventListener('touchmove', draw);
  canvas.addEventListener('touchend', stopDrawing);
}

export function clearSignaturePad(canvasId: string, statusId: string): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  const status = document.getElementById(statusId);

  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  delete canvas.dataset.signature;

  if (status) {
    status.textContent = 'Not signed';
    status.style.color = '#667085';
  }
}

export function getCanvasSignature(canvasId: string): string {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  return canvas?.dataset?.signature || '';
}

export function setCanvasSignature(
  canvasId: string,
  statusId: string,
  signature: string
): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  const status = document.getElementById(statusId);

  if (!canvas) {
    return;
  }

  if (signature) {
    canvas.dataset.signature = signature;
    if (status) {
      status.textContent = 'Signed';
      status.style.color = 'green';
    }
    return;
  }

  delete canvas.dataset.signature;
  if (status) {
    status.textContent = 'Not signed';
    status.style.color = '#667085';
  }
}

export function clearCanvasSignature(canvasId: string, statusId: string): void {
  clearSignaturePad(canvasId, statusId);
}

export function initErSignaturePads(formPrefix: 'discipline' | 'incident' | 'review'): void {
  initSignaturePad(
    `${formPrefix}EmployeeSignature`,
    `${formPrefix}EmployeeSigStatus`
  );
  initSignaturePad(
    `${formPrefix}ManagerSignature`,
    `${formPrefix}ManagerSigStatus`
  );
  initSignaturePad(
    `${formPrefix}WitnessSignature`,
    `${formPrefix}WitnessSigStatus`
  );
}

declare global {
  interface Window {
    clearSig?: (canvasId: string, statusId: string) => void;
    initDisciplineSignaturePads?: () => void;
    initIncidentSignaturePads?: () => void;
    initReviewSignaturePads?: () => void;
  }
}

window.clearSig = clearSignaturePad;
window.initDisciplineSignaturePads = () => initErSignaturePads('discipline');
window.initIncidentSignaturePads = () => initErSignaturePads('incident');
window.initReviewSignaturePads = () => initErSignaturePads('review');

document.addEventListener('DOMContentLoaded', () => {
  initErSignaturePads('discipline');
});
