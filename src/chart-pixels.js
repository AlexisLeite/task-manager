let cleanup;

export function alignHistoryPixels() {
  cleanup?.();
  const view = document.querySelector('.history-view');
  if (!view) return;
  let frame;
  let settlingUntil = 0;
  const controller = new AbortController();
  const align = () => {
    if (!view.isConnected) { cleanup?.(); return; }
    const scale = devicePixelRatio || 1;
    for (const bar of view.querySelectorAll('.history-task-track > span')) {
      if (!bar.dataset.fraction) bar.dataset.fraction = String(parseFloat(bar.style.width) / 100);
      const rect = bar.getBoundingClientRect();
      const left = rect.left - (parseFloat(bar.style.left) || 0);
      const top = rect.top - (parseFloat(bar.style.top) || 0);
      bar.style.left = `${Math.round(left * scale) / scale - left}px`;
      bar.style.top = `${Math.round(top * scale) / scale - top}px`;
      bar.style.width = `${Math.round(bar.parentElement.getBoundingClientRect().width * Number(bar.dataset.fraction) * scale) / scale}px`;
      bar.style.height = `${Math.max(1, Math.round(4 * scale)) / scale}px`;
    }
    if (performance.now() < settlingUntil) frame = requestAnimationFrame(align);
  };
  const schedule = () => { settlingUntil = performance.now() + 400; cancelAnimationFrame(frame); frame = requestAnimationFrame(align); };
  const observer = new ResizeObserver(schedule);
  observer.observe(view);
  view.querySelectorAll('.history-accordion, .history-chart-region').forEach(node => observer.observe(node));
  const mutations = new MutationObserver(schedule);
  mutations.observe(view, { childList:true, subtree:true });
  window.addEventListener('resize', schedule, {signal:controller.signal});
  window.addEventListener('scroll', schedule, {capture:true,signal:controller.signal});
  cleanup = () => { observer.disconnect(); mutations.disconnect(); controller.abort(); cancelAnimationFrame(frame); cleanup = null; };
  schedule();
}
