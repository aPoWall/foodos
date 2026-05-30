/* foodos · camera — monitor + recognition.
   Layer 1 (optional, on-device): MediaPipe EfficientNet "вижу: X" hint (cheap, instant).
   Layer 2 (cloud, on tap): one frame → recognize.mjs → ingredients + bounding boxes,
   drawn as Shaper 1px boxes with lettered callouts over the video.
   Recognition does NOT give cooking instructions — only identifies (per spec). */

import { FN } from "./store.js";

let stream = null, video = null, cam = null, ovl = null, octx = null;
let boxes = []; // [{label, box:[x,y,w,h]}] normalized
let onSeen = null;

export function mountCamera({ camEl, videoEl, overlayEl, seenEl }) {
  cam = camEl; video = videoEl; ovl = overlayEl; octx = ovl.getContext("2d");
  onSeen = (txt) => { if (seenEl) seenEl.textContent = txt; };
  window.addEventListener("resize", drawBoxes);
}

export function camLive() { return !!stream; }

export async function toggleCamera() {
  if (stream) { stop(); return false; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    video.srcObject = stream; await video.play();
    cam.classList.add("live");
    sizeOverlay();
    return true;
  } catch (e) { throw new Error(e.message || String(e)); }
}
function stop() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null; boxes = []; cam.classList.remove("live");
  if (onSeen) onSeen("");
  if (octx) octx.clearRect(0, 0, ovl.width, ovl.height);
}
function sizeOverlay() {
  const r = cam.getBoundingClientRect();
  ovl.width = r.width; ovl.height = r.height;
  drawBoxes();
}

/* capture current frame as a downscaled jpeg data URL */
export function captureFrame(maxW = 768, q = 0.7) {
  if (!stream || !video.videoWidth) return null;
  const c = document.createElement("canvas");
  const w = Math.min(maxW, video.videoWidth), sc = w / video.videoWidth;
  c.width = w; c.height = Math.round(video.videoHeight * sc);
  c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", q);
}

/* cloud recognition: returns {items, dish, note} and draws boxes */
export async function recognizeFrame() {
  const img = captureFrame();
  if (!img) throw new Error("камера выключена");
  const res = await FN("recognize", { image: img });
  boxes = (res.items || []).filter(i => Array.isArray(i.box) && i.box.length === 4);
  sizeOverlay();
  if (onSeen) onSeen(boxes.length ? boxes.map(b => b.label).join(" · ") : (res.note || ""));
  return res;
}

/* draw Shaper-style boxes + lettered callouts over the live video */
function drawBoxes() {
  if (!octx || !ovl.width) return;
  octx.clearRect(0, 0, ovl.width, ovl.height);
  const dark = document.documentElement.classList.contains("dark");
  const stroke = "#ffffff"; // overlay sits over B/W contrasted video — white reads on both
  octx.strokeStyle = stroke; octx.fillStyle = stroke;
  octx.lineWidth = 1; octx.font = "600 11px JetBrains Mono, monospace";
  boxes.forEach((b, i) => {
    const [x, y, w, h] = b.box.map(Number);
    const X = x * ovl.width, Y = y * ovl.height, W = w * ovl.width, H = h * ovl.height;
    // corner-bracket box (patent look, not a full rectangle)
    const c = Math.min(14, W / 3, H / 3);
    octx.beginPath();
    octx.moveTo(X, Y + c); octx.lineTo(X, Y); octx.lineTo(X + c, Y);
    octx.moveTo(X + W - c, Y); octx.lineTo(X + W, Y); octx.lineTo(X + W, Y + c);
    octx.moveTo(X + W, Y + H - c); octx.lineTo(X + W, Y + H); octx.lineTo(X + W - c, Y + H);
    octx.moveTo(X + c, Y + H); octx.lineTo(X, Y + H); octx.lineTo(X, Y + H - c);
    octx.stroke();
    // lettered dot a/b/c
    const letter = String.fromCharCode(97 + i);
    octx.beginPath(); octx.arc(X + 9, Y + 9, 8, 0, 7); octx.fill();
    octx.fillStyle = "#000"; octx.fillText(letter, X + 6, Y + 13); octx.fillStyle = stroke;
    // label under box
    octx.fillText(b.label || "", X, Math.min(ovl.height - 4, Y + H + 13));
  });
}
