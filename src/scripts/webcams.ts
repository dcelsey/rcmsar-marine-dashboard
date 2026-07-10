function scaleDallasCamElement(container: HTMLElement | null): void {
  const wrapper = container?.querySelector<HTMLDivElement>('.cam-video-scale');
  if (!container || !wrapper) return;
  const scale = Math.min(1, container.clientWidth / 1024);
  wrapper.style.transform = `scale(${scale})`;
  wrapper.style.transformOrigin = '0 0';
  container.style.height = `${576 * scale}px`;
}

function scaleAllDallasCams(): void {
  scaleDallasCamElement(document.getElementById('dallasRoadCamContainer'));
  const modal = document.getElementById('dallasCamModal');
  if (modal && modal.classList.contains('show')) {
    scaleDallasCamElement(document.getElementById('dallasCamModalBody'));
  }
}

window.addEventListener('resize', scaleAllDallasCams);
window.addEventListener('load', scaleAllDallasCams);
scaleAllDallasCams();

const openDallasCam = document.getElementById('openDallasCam');
const closeDallasCam = document.getElementById('closeDallasCam');
const dallasCamModal = document.getElementById('dallasCamModal');
if (openDallasCam && closeDallasCam && dallasCamModal) {
  openDallasCam.addEventListener('click', () => {
    dallasCamModal.classList.add('show');
    requestAnimationFrame(scaleAllDallasCams);
  });
  closeDallasCam.addEventListener('click', () => dallasCamModal.classList.remove('show'));
  dallasCamModal.addEventListener('click', e => {
    if (e.target === dallasCamModal) dallasCamModal.classList.remove('show');
  });
}
