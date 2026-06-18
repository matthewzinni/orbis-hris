import { isDemoInstance } from '../config/instanceConfig';

function mountDemoBanner(): void {
  if (!isDemoInstance()) return;
  if (document.getElementById('orbis-demo-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'orbis-demo-banner';
  banner.className = 'orbis-demo-banner';
  banner.setAttribute('role', 'status');
  banner.innerHTML = `
    <strong>Training demo</strong>
    <span>Northline Manufacturing — fictional data only. Do not enter real employee information.</span>
  `;

  document.body.prepend(banner);
  document.documentElement.classList.add('orbis-demo-instance');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountDemoBanner);
  } else {
    mountDemoBanner();
  }
}
