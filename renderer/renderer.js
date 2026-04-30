/**
 * Renderer: state machine for the mirror flow + UI controls.
 *
 * State transitions:
 *   idle    -> picking : user clicks "Pick a window", system picker opens,
 *                        getDisplayMedia returns a MediaStream
 *   picking -> active  : user drags a crop rectangle and presses Enter
 *   active  -> picking : user clicks "Reselect" (keeps the same stream)
 *   any     -> idle    : user clicks the crop button to stop, or the
 *                        capture is ended by the OS picker
 *
 * The two video elements are not redundant: srcVideo shows the full source
 * during the picking phase so the user can see what they're cropping;
 * croppedVideo is positioned with negative offsets inside the clipped
 * mirror-frame so only the chosen region is visible.
 */

// Inline lucide SVGs into every element with [data-icon].
document.querySelectorAll("[data-icon]").forEach((el) => {
  el.innerHTML = window.LucideIcons[el.dataset.icon] || "";
});

const $ = (id) => document.getElementById(id);

// --- Element refs --------------------------------------------------------
const empty = $("empty");
const emptyCTA = $("empty-cta");
const srcVideo = $("src-video");
const cropOverlay = $("crop-overlay");
const cropRect = $("crop-rect");
const cropDim = $("crop-dim");
const mirrorFrame = $("mirror-frame");
const croppedVideo = $("cropped-video");
const opacity = $("opacity");
const opacityVal = $("opacityVal");
const pickBtn = $("pick");
const reselectBtn = $("reselect");
const clickThroughBtn = $("clickthrough");

// --- State ---------------------------------------------------------------
let stream = null;
let phase = "idle"; // "idle" | "picking" | "active"
let cropBox = null; // { x, y, w, h } in source-video pixel coords

const show = (el, on) => { el.hidden = !on; };

function teardownStream() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  srcVideo.srcObject = null;
  croppedVideo.srcObject = null;
}

function goIdle() {
  phase = "idle";
  teardownStream();
  show(empty, true);
  show(srcVideo, false);
  show(cropOverlay, false);
  show(mirrorFrame, false);
  cropRect.style.display = "none";
  cropBox = null;
  pickBtn.classList.remove("active");
  show(reselectBtn, false);
}

async function startPicking() {
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: false,
    });
  } catch {
    // User cancelled the picker — stay in current phase.
    return;
  }
  phase = "picking";
  pickBtn.classList.add("active");
  show(empty, false);
  show(srcVideo, true);
  srcVideo.srcObject = stream;
  show(cropOverlay, true);
  show(mirrorFrame, false);
  cropRect.style.display = "none";
  cropBox = null;
  show(reselectBtn, false);
  // OS-level "stop sharing" → drop everything.
  stream.getVideoTracks()[0].addEventListener("ended", goIdle);
}

pickBtn.onclick = () => (phase === "idle" ? startPicking() : goIdle());
emptyCTA.onclick = () => startPicking();

// Reselect keeps the active stream and re-enters the drag-rect phase.
// Avoids re-triggering the system window picker.
reselectBtn.onclick = () => {
  if (!stream) return;
  phase = "picking";
  show(mirrorFrame, false);
  show(srcVideo, true);
  show(cropOverlay, true);
  cropRect.style.display = "none";
  cropBox = null;
  show(reselectBtn, false);
};

// --- Crop drag selection -------------------------------------------------
// The video is letterboxed (object-fit: contain) inside its container,
// so client coordinates need to be translated back to source-video pixels
// before we save them as the crop box.
let dragStart = null;
function clientToVideo(x, y) {
  const r = srcVideo.getBoundingClientRect();
  const vw = srcVideo.videoWidth || 1;
  const vh = srcVideo.videoHeight || 1;
  const scale = Math.min(r.width / vw, r.height / vh);
  const offX = (r.width - vw * scale) / 2;
  const offY = (r.height - vh * scale) / 2;
  return { x: (x - r.left - offX) / scale, y: (y - r.top - offY) / scale };
}

cropOverlay.addEventListener("mousedown", (e) => {
  if (phase !== "picking") return;
  e.preventDefault();
  dragStart = { mx: e.clientX, my: e.clientY };
  const r = cropOverlay.getBoundingClientRect();
  cropRect.style.display = "block";
  cropRect.style.left = (e.clientX - r.left) + "px";
  cropRect.style.top = (e.clientY - r.top) + "px";
  cropRect.style.width = "0px";
  cropRect.style.height = "0px";
});

document.addEventListener("mousemove", (e) => {
  if (!dragStart) return;
  const r = cropOverlay.getBoundingClientRect();
  cropRect.style.left = (Math.min(dragStart.mx, e.clientX) - r.left) + "px";
  cropRect.style.top = (Math.min(dragStart.my, e.clientY) - r.top) + "px";
  cropRect.style.width = Math.abs(e.clientX - dragStart.mx) + "px";
  cropRect.style.height = Math.abs(e.clientY - dragStart.my) + "px";
  const a = clientToVideo(dragStart.mx, dragStart.my);
  const b = clientToVideo(e.clientX, e.clientY);
  cropDim.textContent = `${Math.round(Math.abs(b.x - a.x))} × ${Math.round(Math.abs(b.y - a.y))}`;
});

document.addEventListener("mouseup", (e) => {
  if (!dragStart) return;
  const a = clientToVideo(dragStart.mx, dragStart.my);
  const b = clientToVideo(e.clientX, e.clientY);
  dragStart = null;
  const x = Math.max(0, Math.min(a.x, b.x));
  const y = Math.max(0, Math.min(a.y, b.y));
  const w = Math.min((srcVideo.videoWidth || 1) - x, Math.abs(b.x - a.x));
  const h = Math.min((srcVideo.videoHeight || 1) - y, Math.abs(b.y - a.y));
  // Reject tiny accidental drags so a click doesn't commit a 2-px box.
  if (w < 20 || h < 20) {
    cropRect.style.display = "none";
    cropBox = null;
    return;
  }
  cropBox = { x, y, w, h };
});

// --- Crop commit + cropped layout ---------------------------------------
let layoutObs = null;
function commitCrop() {
  show(cropOverlay, false);
  show(srcVideo, false);
  show(mirrorFrame, true);
  croppedVideo.srcObject = stream;
  phase = "active";
  show(reselectBtn, true);
  if (cropBox && cropBox.h > 0) {
    window.api.fitAspect(cropBox.w / cropBox.h);
  }

  // Layout: croppedVideo is a full-source-size element positioned with
  // negative offsets so only the cropBox region falls inside mirrorFrame's
  // overflow:hidden viewport. Re-runs on resize so the crop scales.
  const layout = () => {
    if (!cropBox) return;
    const host = mirrorFrame.getBoundingClientRect();
    if (host.width === 0 || host.height === 0) return;
    const s = Math.min(host.width / cropBox.w, host.height / cropBox.h);
    const offX = (host.width - cropBox.w * s) / 2;
    const offY = (host.height - cropBox.h * s) / 2;
    croppedVideo.style.width = (srcVideo.videoWidth || 1) * s + "px";
    croppedVideo.style.height = (srcVideo.videoHeight || 1) * s + "px";
    croppedVideo.style.left = (offX - cropBox.x * s) + "px";
    croppedVideo.style.top = (offY - cropBox.y * s) + "px";
  };
  layout();
  if (layoutObs) layoutObs.disconnect();
  layoutObs = new ResizeObserver(layout);
  layoutObs.observe(mirrorFrame);
}

// --- Keyboard shortcuts -------------------------------------------------
document.addEventListener("keydown", (e) => {
  if (phase === "picking" && e.key === "Enter" && cropBox) {
    e.preventDefault();
    commitCrop();
  } else if (phase === "picking" && e.key === "Escape") {
    cropRect.style.display = "none";
    cropBox = null;
  } else if ((e.metaKey || e.ctrlKey) && e.key === "h") {
    e.preventDefault();
    window.api.hide();
  } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    e.preventDefault();
    const cur = parseInt(opacity.value, 10);
    const step = e.key === "ArrowUp" ? 5 : -5;
    opacity.value = String(Math.max(20, Math.min(100, cur + step)));
    applyOpacity();
    persistOpacity();
  }
});

// --- Opacity ------------------------------------------------------------
// Chrome (toolbar) has a 0.5 floor: the slider can fade the content all
// the way out, but the toolbar must stay clickable so the user can always
// recover. Without this floor the app appears "frozen" / invisible after
// a low-opacity session is persisted.
const CHROME_MIN = 0.5;

function applyOpacity() {
  const v = parseInt(opacity.value, 10);
  const min = parseInt(opacity.min, 10) || 0;
  const max = parseInt(opacity.max, 10) || 100;
  opacity.style.setProperty("--fill", ((v - min) / (max - min)) * 100 + "%");
  opacityVal.textContent = String(v);
  const f = v / 100;
  const chromeF = Math.max(CHROME_MIN, f);
  document.getElementById("topbar").style.opacity = String(chromeF);
  document.getElementById("stage").style.opacity = String(f);
  document.documentElement.style.setProperty("--chrome-alpha", String(0.85 * chromeF));
}

let saveOpacityTimer = null;
function persistOpacity() {
  clearTimeout(saveOpacityTimer);
  saveOpacityTimer = setTimeout(() => {
    window.api.setState({ opacity: parseInt(opacity.value, 10) });
  }, 200);
}
opacity.addEventListener("input", () => {
  applyOpacity();
  persistOpacity();
});

// --- Click-through -------------------------------------------------------
// Source of truth lives in main (since the global shortcut also flips it).
// Renderer only reflects state pushed from main and asks main to flip.
let clickThrough = false;
function reflectClickThrough(on) {
  clickThrough = on;
  document.body.classList.toggle("click-through", on);
  clickThroughBtn.classList.toggle("active", on);
  clickThroughBtn.title = on
    ? "Click-through ON — clicks pass through (⌘⇧M)"
    : "Click-through (⌘⇧M)";
}
clickThroughBtn.onclick = () => window.api.setClickThrough(!clickThrough);
window.api.onClickThrough(reflectClickThrough);

// --- Pin / hide / close --------------------------------------------------
let pinned = true;
const pinBtn = $("pin");
pinBtn.classList.add("active");
pinBtn.onclick = () => {
  pinned = !pinned;
  window.api.toggleAlwaysOnTop(pinned);
  pinBtn.classList.toggle("active", pinned);
};
$("hide").onclick = () => window.api.hide();
$("close").onclick = () => window.api.close();

// --- Boot ----------------------------------------------------------------
(async () => {
  try {
    const s = await window.api.getState();
    if (s && typeof s.opacity === "number") opacity.value = String(s.opacity);
  } catch {}
  applyOpacity();
  goIdle();
})();
