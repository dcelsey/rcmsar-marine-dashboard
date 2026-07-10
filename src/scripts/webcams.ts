function scaleContainer(container: HTMLElement | null): void {
  const wrapper = container?.querySelector<HTMLDivElement>('.cam-video-scale');
  if (!container || !wrapper) return;
  const scale = Math.min(1, container.clientWidth / 1024);
  wrapper.style.transform = `scale(${scale})`;
  wrapper.style.transformOrigin = '0 0';
  container.style.height = `${576 * scale}px`;
}

function scaleAll(): void {
  document.querySelectorAll<HTMLElement>('[data-cam-index]').forEach(scaleContainer);
  document.querySelectorAll<HTMLElement>('.modal-overlay.show [data-cam-modal-body]').forEach(scaleContainer);
}

window.addEventListener('resize', scaleAll);
window.addEventListener('load', scaleAll);
scaleAll();

document.querySelectorAll<HTMLButtonElement>('[data-cam-open]').forEach(btn => {
  const idx = btn.getAttribute('data-cam-open');
  const modal = document.querySelector<HTMLElement>(`[data-cam-modal="${idx}"]`);
  const closeBtn = document.querySelector<HTMLButtonElement>(`[data-cam-close="${idx}"]`);
  if (!modal || !closeBtn) return;

  btn.addEventListener('click', () => {
    modal.classList.add('show');
    requestAnimationFrame(scaleAll);
  });
  closeBtn.addEventListener('click', () => modal.classList.remove('show'));
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.classList.remove('show');
  });
});
