import type { WidgetRenderState } from '../../shared/ipc';

const stage = document.getElementById('stage')!;
const api = window.gifengine;

let mountedSrc: string | null = null;
let interactive = false;
let dragging = false;
let sawPointer = false;
let lastWheel = 0;

function mount(state: WidgetRenderState): void {
  if (mountedSrc === state.src) return;
  mountedSrc = state.src;
  stage.replaceChildren();

  if (state.kind === 'image') {
    const img = new Image();
    img.decoding = 'async';
    img.draggable = false;
    img.addEventListener('load', () => api.reportNaturalSize(img.naturalWidth, img.naturalHeight), { once: true });
    img.addEventListener('error', () => api.reportMediaError(`cannot load image ${state.src}`), { once: true });
    img.src = state.src;
    stage.append(img);
    return;
  }

  const video = document.createElement('video');
  video.muted = true;
  video.loop = true;
  video.autoplay = true;
  video.playsInline = true;
  video.addEventListener('loadedmetadata', () => api.reportNaturalSize(video.videoWidth, video.videoHeight), { once: true });
  video.addEventListener('error', () => api.reportMediaError(video.error?.message || `cannot play ${state.src}`), { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) video.pause();
    else void video.play();
  });
  video.src = state.src;
  stage.append(video);
}

function endDrag(): void {
  if (!dragging) return;
  dragging = false;
  api.dragEnd();
}

document.addEventListener('pointerdown', (e) => {
  if (!interactive || e.button !== 0) return;
  dragging = true;
  console.log(`drag start at ${e.screenX},${e.screenY}`);
  document.documentElement.setPointerCapture(e.pointerId);
  api.dragStart({ x: e.screenX, y: e.screenY });
});
document.addEventListener('pointermove', (e) => {
  if (interactive && !sawPointer) {
    sawPointer = true;
    console.log(`pointer reached widget in edit mode at ${e.screenX},${e.screenY}`);
  }
  if (dragging) api.dragMove({ x: e.screenX, y: e.screenY });
});
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

document.addEventListener(
  'wheel',
  (e) => {
    if (!interactive || e.deltaY === 0) return;
    e.preventDefault();
    const now = performance.now();
    if (now - lastWheel < 40) return;
    lastWheel = now;
    api.wheelResize(e.deltaY < 0 ? 1 : -1);
  },
  { passive: false },
);

api.onState((state) => {
  interactive = state.editing && !state.locked;
  if (!interactive) {
    sawPointer = false;
    endDrag();
  }
  document.body.classList.toggle('editing', interactive);
  document.body.classList.toggle('locked-edit', state.editing && state.locked);
  stage.style.opacity = String(state.opacity);
  stage.style.transform = `scale(${state.flipH ? -1 : 1}, ${state.flipV ? -1 : 1})`;
  mount(state);
});
