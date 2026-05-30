/* foodos · cook — data-driven instrument. Renders ANY meal JSON (?meal=slug).
   Not tied to a recipe. Camera recognition, voice, timers, live drawing,
   per-step AI expand, dual-track engine. */

import * as S from "./store.js";
import { voice } from "./voice.js";
import { mountCamera, toggleCamera, recognizeFrame, captureFrame, camLive } from "./camera.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const SLUG = params.get("meal") || "lula-camarao";

let meal = null, track = "both", done = new Set(), expands = {};
let TRACK_A = { label: "дорожка a", glyph: "◆", key: "a" }, TRACK_B = { label: "дорожка b", glyph: "◇", key: "b" };
let hasTracks = true;

const fmt = (s) => { const m = Math.floor(s / 60), x = s % 60; return m + ":" + String(x).padStart(2, "0"); };
const phaseName = (t) => t === "shared" ? "общая база" : t === "a" ? TRACK_A.label : t === "b" ? TRACK_B.label : "";
const phaseGlyph = (t) => t === "shared" ? "⊕" : t === "a" ? TRACK_A.glyph : t === "b" ? TRACK_B.glyph : "·";

async function boot() {
  S.initTheme();
  try { meal = await S.getMeal(SLUG); }
  catch { $("steps").innerHTML = `<div class="step"><div class="lead">блюдо «${S.esc(SLUG)}» не найдено. <a href="index.html" style="text-decoration:underline">← в библиотеку</a></div></div>`; return; }

  hasTracks = !!meal.tracks;
  if (hasTracks) {
    TRACK_A = { ...TRACK_A, ...(meal.tracks.a || {}) };
    TRACK_B = { ...TRACK_B, ...(meal.tracks.b || {}) };
  } else { track = "both"; }
  done = S.getProgress(SLUG);
  expands = S.getExpands(SLUG);
  track = localStorage.getItem("foodos:track:" + SLUG) || "both";

  fillMeta(); renderIngredients(); renderAxioms(); renderTracks(); renderSteps();
  mountCamera({ camEl: $("cam"), videoEl: $("camVideo"), overlayEl: $("camOvl"), seenEl: $("camSeen") });
  wire();
  syncVoice();
}

function fillMeta() {
  $("crumb").innerHTML = `${S.esc(meal.fig || "")} · <b>${S.esc(meal.title)}</b>`;
  $("metaSub").textContent = meal.sub || "";
  $("stServ").textContent = meal.servings || "–";
  $("stActive").textContent = meal.active || "–";
  $("stTotal").textContent = meal.total || "–";
  $("stampFig").innerHTML = `${S.esc(meal.fig || "fig.··")} · ${S.esc(meal.slug)} <small>schematic · foodos</small>`;
  document.title = `foodos · ${meal.title}`;
}

/* ingredients: use saved metaphor image if present, else built-in svg symbol, else placeholder */
function renderIngredients() {
  const root = $("ingArt"); const lib = S.getMetaphors();
  root.innerHTML = (meal.ingredients || []).map((i) => {
    const m = lib[(i.label || "").toLowerCase()] || lib[(i.id || "").toLowerCase()];
    const art = m ? `<img src="${m}" alt="${S.esc(i.label)}">`
      : (document.getElementById("ing-" + i.id) ? `<svg viewBox="0 0 100 80"><use href="#ing-${i.id}"/></svg>`
      : `<svg viewBox="0 0 100 80"><rect x="30" y="20" width="40" height="42" fill="none" stroke="currentColor" stroke-dasharray="3 3"/><text x="50" y="46" text-anchor="middle" font-size="9" fill="#8a8a8a">?</text></svg>`);
    return `<figure>${art}<figcaption>${S.esc(i.label)}</figcaption></figure>`;
  }).join("");
}
function renderAxioms() {
  $("axioms").innerHTML = (meal.axioms || []).map((a, i) =>
    `<div class="axiom"><span class="i">${String(i + 1).padStart(2, "0")}</span><span>${a}</span></div>`).join("")
    || `<div class="axiom"><span>—</span></div>`;
}

function renderTracks() {
  const t = $("tracks");
  if (!hasTracks) { t.classList.add("hide"); return; }
  t.innerHTML =
    `<button class="chip on" data-track="both">⊕ параллель</button>
     <button class="chip" data-track="a">${TRACK_A.glyph} ${S.esc(TRACK_A.label)}</button>
     <button class="chip" data-track="b">${TRACK_B.glyph} ${S.esc(TRACK_B.label)}</button>`;
  t.querySelectorAll("[data-track]").forEach(b => b.onclick = () => setTrack(b.dataset.track));
}

const visible = (t) => !hasTracks || track === "both" || t === "shared" || t === "split" || t === track;

function renderSteps() {
  const root = $("steps"); root.innerHTML = ""; let last = "", n = 0;
  (meal.steps || []).forEach((st) => {
    if (st.t === "split") {
      const d = document.createElement("div"); d.className = "split"; d.dataset.t = "split";
      d.innerHTML = `<div class="lab">⑃ точка разделения</div>
        <div class="txt">раздели базу на две части. дальше дорожки идут параллельно.</div>
        <div class="arrows"><span class="a">${TRACK_A.glyph} → ${S.esc(TRACK_A.label)}</span><span class="a">${TRACK_B.glyph} → ${S.esc(TRACK_B.label)}</span></div>`;
      root.appendChild(d); return;
    }
    if (st.t !== last) {
      last = st.t;
      const ph = document.createElement("div"); ph.className = "phase-label"; ph.dataset.t = st.t;
      ph.innerHTML = `<span class="gl">${phaseGlyph(st.t)}</span> ${S.esc(phaseName(st.t))}`;
      root.appendChild(ph);
    }
    n++;
    const ex = expands[st.id];
    const el = document.createElement("article");
    el.className = "step" + (done.has(st.id) ? " done" : ""); el.dataset.t = st.t; el.dataset.id = st.id;
    el.innerHTML = `
      <div class="num">${n}</div>
      <div class="hd"><span class="ttl">${S.esc(st.ttl || "")}</span><span class="id">${S.esc(st.id)}</span></div>
      <div class="lead">${S.esc(st.lead || "")}</div>
      ${st.tip ? `<div class="tip"><span class="m">⚑</span><span>${S.esc(st.tip)}</span></div>` : ""}
      ${ex ? `<div class="expand">${S.esc(ex)}</div>` : ""}
      <div class="acts">
        <button class="chip" data-act="toggle">${done.has(st.id) ? "✓ готово" : "отметить"}</button>
        ${st.time ? `<button class="chip" data-act="timer" data-tid="${st.id}">▶ ${fmt(st.time)}</button>` : ""}
        <button class="chip" data-act="say">◂ озвучить</button>
        <button class="chip" data-act="expand">＋ детальнее (ai)</button>
      </div>`;
    el.querySelector('[data-act=toggle]').onclick = () => toggle(st.id);
    const tb = el.querySelector('[data-act=timer]'); if (tb) tb.onclick = () => startTimer(st.id, st.time);
    el.querySelector('[data-act=say]').onclick = () => sayStep(st);
    el.querySelector('[data-act=expand]').onclick = (e) => expandStep(st, e.target);
    root.appendChild(el);
  });
  applyTrack(); updateProgress(); markCurrent();
}

function applyTrack() {
  if (hasTracks) document.querySelectorAll("[data-track]").forEach(b => b.classList.toggle("on", b.dataset.track === track));
  document.querySelectorAll("#steps .step, #steps .phase-label").forEach(e => e.classList.toggle("hide", !visible(e.dataset.t)));
  document.querySelectorAll("#steps .split").forEach(e => e.classList.toggle("hide", !(hasTracks && (track === "both" || track === "a" || track === "b"))));
}
function setTrack(t) { track = t; localStorage.setItem("foodos:track:" + SLUG, t); applyTrack(); updateProgress(); markCurrent(); }

function toggle(id) {
  done.has(id) ? done.delete(id) : done.add(id); S.saveProgress(SLUG, done);
  const el = document.querySelector(`.step[data-id="${id}"]`);
  if (el) { el.classList.toggle("done", done.has(id)); const b = el.querySelector('[data-act=toggle]'); if (b) b.textContent = done.has(id) ? "✓ готово" : "отметить"; }
  updateProgress(); markCurrent();
  if (done.has(id)) { const nx = currentStep(); if (nx && voice.on) voice.say(stripTtl(nx)); }
}
const stripTtl = (s) => `${(s.ttl || "").split("·").pop().trim()}. ${s.lead}`;
function currentStep() { return (meal.steps || []).find(s => s.t !== "split" && visible(s.t) && !done.has(s.id)) || null; }
function markCurrent() {
  document.querySelectorAll("#steps .step").forEach(e => e.classList.remove("current"));
  const c = currentStep(); if (c) { const el = document.querySelector(`.step[data-id="${c.id}"]`); if (el) el.classList.add("current"); }
  renderSeeds();
}
function sayStep(s) { if (!voice.on) { voice.set(true); syncVoice(); } voice.say(stripTtl(s)); }

function updateProgress() {
  const vis = (meal.steps || []).filter(s => s.t !== "split" && visible(s.t));
  const d = vis.filter(s => done.has(s.id)).length;
  const pct = vis.length ? Math.round(d / vis.length * 100) : 0;
  $("progfill").style.right = (100 - pct) + "%"; $("stDone").textContent = `${d}/${vis.length}`;
}
function renderSeeds() {
  const vis = (meal.steps || []).filter(s => s.t !== "split" && visible(s.t));
  $("seeds").innerHTML = `<span>seeds</span>` + vis.map(s => `<span class="seed${done.has(s.id) ? " active" : ""}">${S.esc(s.id)}</span>`).join("");
}

/* per-step AI detail */
async function expandStep(st, btn, fromFocus) {
  if (expands[st.id]) { delete expands[st.id]; S.saveExpand(SLUG, st.id, ""); renderSteps(); if (fromFocus) renderFocus(); return; }
  btn.textContent = "···"; btn.disabled = true;
  try {
    const ctx = `блюдо: ${meal.title}. шаг: ${st.ttl} — ${st.lead}. дай чуть больше деталей по ЭТОМУ шагу (как понять готовность, частые ошибки), 2-3 предложения.`;
    const { advice } = await S.FN("advise", { mode: "text", step: st.ttl, context: ctx });
    expands[st.id] = advice; S.saveExpand(SLUG, st.id, advice); renderSteps(); if (fromFocus) renderFocus();
    if (voice.on) voice.say(advice);
  } catch (e) { btn.textContent = "не вышло"; btn.disabled = false; S.toast("ai недоступен: " + e.message); }
}

/* ---------- timers ---------- */
const timers = {}; let actx = null;
function beep() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const o = actx.createOscillator(), g = actx.createGain(); o.connect(g); g.connect(actx.destination); o.frequency.value = 880; g.gain.value = .16; o.start(); let n = 0; const iv = setInterval(() => { o.frequency.value = n % 2 ? 660 : 880; if (++n > 7) { o.stop(); clearInterval(iv); } }, 180); } catch {} }
function startTimer(id, sec) {
  if (timers[id]) return;
  const st = meal.steps.find(s => s.id === id);
  timers[id] = { left: sec, title: (st.ttl || "").split("·").pop().trim() };
  const b = document.querySelector(`[data-tid="${id}"]`); if (b) b.classList.add("on");
  timers[id].iv = setInterval(() => {
    timers[id].left--;
    if (timers[id].left <= 0) { clearInterval(timers[id].iv); timers[id].ring = true; beep(); if (navigator.vibrate) navigator.vibrate([300, 120, 300]); if (voice.on) voice.say(`таймер ${timers[id].title} — готово`); }
    drawDock();
    if (focusOn) { const ft = $("fTimer"); if (ft && cookableSteps()[focusIndex()]?.id === id) { ft.textContent = timers[id].left > 0 ? fmt(timers[id].left) : "готово"; ft.classList.toggle("ring", !!timers[id].ring); } }
  }, 1000);
  drawDock();
}
function stopTimer(id) { if (timers[id]) { clearInterval(timers[id].iv); delete timers[id]; const b = document.querySelector(`[data-tid="${id}"]`); if (b) b.classList.remove("on"); drawDock(); } }
function drawDock() {
  const dock = $("dock"); const ids = Object.keys(timers);
  dock.classList.toggle("show", ids.length > 0); dock.innerHTML = "";
  ids.forEach(id => { const t = timers[id]; const c = document.createElement("div"); c.className = "tchip" + (t.ring ? " ring" : ""); c.innerHTML = `${t.ring ? "⏰ " : ""}${S.esc(t.title).slice(0, 18)} · ${t.left > 0 ? fmt(t.left) : "готово"} <span class="x">✕</span>`; c.querySelector(".x").onclick = () => stopTimer(id); dock.appendChild(c); });
}

/* ---------- console: advise + vision check ---------- */
function out(html, ok = true) { const bd = $("consoleBd"); bd.classList.remove("think"); bd.innerHTML = html; if (ok && voice.on) voice.say(bd.textContent); }
function think(l) { const bd = $("consoleBd"); bd.classList.add("think"); bd.innerHTML = `<span class="blink">${l}</span>`; }
async function adviseStep() {
  const s = currentStep() || meal.steps[meal.steps.length - 1]; think("шеф думает");
  try { const { advice } = await S.FN("advise", { mode: "text", step: s.ttl, context: `блюдо: ${meal.title}. дорожка: ${track}. шаг: ${s.ttl} — ${s.lead}` }); out(S.esc(advice)); }
  catch (e) { out(`совет офлайн (${S.esc(e.message)}). база: ${S.esc(s.tip || s.lead)}`, false); }
}
async function checkCamera() {
  const s = currentStep() || meal.steps[meal.steps.length - 1]; think("смотрю на сковороду");
  try { const img = captureFrame(); if (!img) { out("включи камеру (cam · live).", false); return; }
    const { advice } = await S.FN("advise", { mode: "vision", step: s.ttl, context: `шаг: ${s.ttl} — ${s.lead}. оцени готовность по фото, кратко.`, image: img }); out(S.esc(advice)); }
  catch (e) { out(`vision недоступен (${S.esc(e.message)}).`, false); }
}

/* ---------- live ingredient drawing ---------- */
async function drawIngredient() {
  const inp = $("drawInput"); const q = (inp.value || "").trim(); if (!q) { inp.focus(); return; }
  const box = $("drawBox");
  box.innerHTML = `<div class="ph"><span class="spin">◍</span> рисую «${S.esc(q)}»…</div>`;
  try { const img = await S.drawMetaphor(q); box.innerHTML = `<img src="${img}" class="drawing" alt="${S.esc(q)}">`; S.toast(`«${q}» добавлен в библиотеку метафор`); inp.value = ""; }
  catch (e) { box.innerHTML = `<div class="ph">не вышло: ${S.esc(e.message)}</div>`; }
}

/* ---------- camera recognition (boxes) ---------- */
async function camToggle() {
  try { const live = await toggleCamera(); $("camChip").classList.toggle("on", live); $("camChip").innerHTML = `cam · <span class="k">${live ? "live" : "off"}</span>`; }
  catch (e) { out("камера недоступна: " + S.esc(e.message) + " · на телефоне разреши доступ.", false); }
}
async function camRecognize() {
  if (!camLive()) { out("включи камеру.", false); return; }
  think("распознаю продукты");
  try {
    const r = await recognizeFrame();
    const names = (r.items || []).map(i => i.label).filter(Boolean);
    out(names.length ? `вижу: <b>${S.esc(names.join(", "))}</b>${r.dish ? ` · похоже на ${S.esc(r.dish)}` : ""}` : (S.esc(r.note) || "ничего явного не вижу"));
    // offer to draw any newly seen ingredient into the library
    if (names.length) { const first = names[0]; $("drawInput").value = first; }
  } catch (e) { out(`распознавание недоступно (${S.esc(e.message)})`, false); }
}

function syncVoice() { const el = $("voiceChip"); el.classList.toggle("on", voice.on); el.innerHTML = `voice · <span class="k">${voice.on ? "on" : "off"}</span>`; }
function resetAll() { if (confirm("сбросить прогресс этого блюда?")) { done.clear(); S.saveProgress(SLUG, done); Object.keys(timers).forEach(stopTimer); renderSteps(); if (focusOn) renderFocus(); } }

/* ============================================================
   FOCUS COOK MODE — one big step, hands-free
   ============================================================ */
let focusOn = false;
function cookableSteps() { return (meal.steps || []).filter(s => s.t !== "split" && visible(s.t)); }
function enterFocus() {
  focusOn = true; $("focus").classList.add("show");
  document.body.style.overflow = "hidden";
  $("focusChip").classList.add("on");
  if (!voice.on) { voice.set(true); syncVoice(); }
  renderFocus();
}
function exitFocus() { focusOn = false; $("focus").classList.remove("show"); document.body.style.overflow = ""; $("focusChip").classList.remove("on"); markCurrent(); }
function focusIndex() {
  const list = cookableSteps();
  const cur = list.findIndex(s => !done.has(s.id));
  return cur === -1 ? list.length - 1 : cur;
}
function renderFocus() {
  const list = cookableSteps(); if (!list.length) return;
  const i = focusIndex(); const st = list[i];
  $("fcrumb").textContent = `готовка · ${i + 1}/${list.length}${meal.tracks ? " · " + (track === "both" ? "обе дорожки" : phaseName(track)) : ""}`;
  $("fdots").innerHTML = list.map((s, n) => `<span class="d ${done.has(s.id) ? "done" : ""} ${n === i ? "cur" : ""}"></span>`).join("");
  const ex = expands[st.id]; const tm = timers[st.id];
  $("fstage").innerHTML = `
    <div class="pn"><span class="bignum">${phaseGlyph(st.t)} ${i + 1}/${list.length}</span> · <span class="bigttl">${S.esc(st.ttl || "")}</span></div>
    <div class="biglead">${S.esc(st.lead || "")}</div>
    ${st.tip ? `<div class="bigtip"><span class="m">⚑</span><span>${S.esc(st.tip)}</span></div>` : ""}
    ${st.time ? `<div class="ftimer${tm && tm.ring ? " ring" : ""}" id="fTimer">${tm ? fmt(tm.left) : fmt(st.time)}</div>` : ""}
    ${ex ? `<div class="bigexpand">${S.esc(ex)}</div>` : ""}
    <div class="frail">
      ${st.time ? `<button class="chip" id="fTimerBtn">${tm ? "⏸ стоп" : "▶ таймер " + fmt(st.time)}</button>` : ""}
      <button class="chip" id="fSay">◂ озвучить</button>
      <button class="chip" id="fExpand">＋ детальнее (ai)</button>
    </div>`;
  const tb = $("fTimerBtn"); if (tb) tb.onclick = () => { tm ? stopTimer(st.id) : startTimer(st.id, st.time); renderFocus(); };
  $("fSay").onclick = () => sayStep(st);
  $("fExpand").onclick = (e) => expandStep(st, e.target, true);
  if (voice.on) voice.say(stripTtl(st));
}
function focusNext() {
  const list = cookableSteps(); const i = focusIndex(); const st = list[i];
  done.add(st.id); S.saveProgress(SLUG, done);
  const el = document.querySelector(`.step[data-id="${st.id}"]`); if (el) { el.classList.add("done"); const b = el.querySelector('[data-act=toggle]'); if (b) b.textContent = "✓ готово"; }
  updateProgress();
  if (done.size >= list.length || i >= list.length - 1) { exitFocus(); S.toast("готово — приятного аппетита ◎"); return; }
  renderFocus();
}
function focusPrev() {
  const list = cookableSteps(); const i = focusIndex();
  for (let k = i - 1; k >= 0; k--) { if (done.has(list[k].id)) { done.delete(list[k].id); S.saveProgress(SLUG, done); break; } }
  updateProgress(); renderSteps(); renderFocus();
}

function wire() {
  $("voiceChip").onclick = () => { voice.toggle(); syncVoice(); if (voice.on) { const s = currentStep(); if (s) voice.say(stripTtl(s)); } };
  $("camChip").onclick = camToggle;
  $("themeChip").onclick = () => { const d = S.toggleTheme(); $("themeChip").innerHTML = `theme · <span class="k">${d ? "dark" : "light"}</span>`; };
  $("camToggleBtn").onclick = camToggle;
  $("camCheckBtn").onclick = checkCamera;
  $("camRecogBtn").onclick = camRecognize;
  $("adviseBtn").onclick = adviseStep;
  $("checkBtn").onclick = checkCamera;
  $("drawBtn").onclick = drawIngredient;
  $("drawInput").addEventListener("keydown", e => { if (e.key === "Enter") drawIngredient(); });
  $("resetBtn").onclick = resetAll;
  $("focusChip").onclick = () => focusOn ? exitFocus() : enterFocus();
  $("fExit").onclick = exitFocus;
  $("fNext").onclick = focusNext;
  $("fPrev").onclick = focusPrev;
  document.addEventListener("keydown", e => {
    if (!focusOn) return;
    if (e.key === "Escape") exitFocus();
    else if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); focusNext(); }
    else if (e.key === "ArrowLeft") focusPrev();
  });
  const d = document.documentElement.classList.contains("dark");
  $("themeChip").innerHTML = `theme · <span class="k">${d ? "dark" : "light"}</span>`;
}

document.addEventListener("DOMContentLoaded", boot);
