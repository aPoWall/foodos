/* foodos · cook — data-driven instrument. Renders ANY meal JSON (?meal=slug).
   Not tied to a recipe. Camera recognition, voice, timers, live drawing,
   per-step AI expand, dual-track engine. */

import * as S from "./store.js?v=19";
import { voice } from "./voice.js?v=19";
import { mountCamera, toggleCamera, recognizeFrame, recognizeImageData, fileToImageData, captureFrame, camLive } from "./camera.js?v=19";

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
  await S.syncFromServer();
  S.initVisualAtlas();
  try { meal = await S.getMeal(SLUG); }
  catch { $("steps").innerHTML = `<div class="step"><div class="lead">блюдо «${S.esc(SLUG)}» не найдено. <a href="index.html" style="text-decoration:underline">← в библиотеку</a></div></div>`; return; }
  S.rememberMealItems(meal, "cook");

  hasTracks = !!meal.tracks;
  if (hasTracks) {
    TRACK_A = { ...TRACK_A, ...(meal.tracks.a || {}) };
    TRACK_B = { ...TRACK_B, ...(meal.tracks.b || {}) };
  } else { track = "both"; }
  done = S.getProgress(SLUG);
  expands = S.getExpands(SLUG);
  track = localStorage.getItem("foodos:track:" + SLUG) || "both";

  fillMeta(); renderDeviceState(); renderSetup(); renderIngredients(); renderAxioms(); renderTracks(); renderSteps(); renderMemoryMini();
  recordOpenOnce();
  mountCamera({ camEl: $("cam"), videoEl: $("camVideo"), overlayEl: $("camOvl"), seenEl: $("camSeen") });
  wire();
  syncVoice();
  warmMealMetaphors();
}

function fillMeta() {
  $("crumb").innerHTML = `${S.esc(meal.fig || "")} · <b>${S.esc(meal.title)}</b>`;
  $("metaSub").textContent = meal.sub || "";
  $("stServ").textContent = meal.servings || "–";
  $("stActive").textContent = meal.active || "–";
  $("stTotal").textContent = meal.total || "–";
  $("stampFig").innerHTML = `${S.esc(meal.fig || "fig.··")} · ${S.esc(meal.slug)} <small>schematic · foodos</small>`;
  document.title = `FoodOS · ${meal.title}`;
}

function renderDeviceState() {
  const root = $("deviceState");
  if (!root) return;
  const state = S.getDeviceState(SLUG) || meal.operation || null;
  if (!state) { root.classList.add("hide"); return; }
  root.classList.remove("hide");
  const chips = [
    state.device,
    state.mode,
    state.temp,
    state.bag,
    state.app,
  ].filter(Boolean);
  root.innerHTML = `
    <div class="ds-main">
      <span class="ds-dot"></span>
      <div>
        <div class="ds-title">${S.esc(state.title || "device state")}</div>
        <div class="ds-line">${S.esc(state.line || "")}</div>
      </div>
    </div>
    <div class="ds-chips">${chips.map(c => `<span>${S.esc(c)}</span>`).join("")}</div>
    ${state.next ? `<div class="ds-next">${S.esc(state.next)}</div>` : ""}`;
}

function builtInArt(i, letter = "") {
  const id = i.id || "";
  const label = i.label || id;
  const lib = S.getMetaphors();
  const visualKey = S.visualKey(i);
  const inline = S.builtinArtMarkup(i, { label });
  if (inline) return inline;
  const m = lib[(label || "").toLowerCase()] || lib[(id || "").toLowerCase()] || (visualKey ? lib[visualKey] : "");
  if (m) return `<img src="${m}" alt="${S.esc(label)}">`;
  if (document.getElementById("ing-" + id)) return `<svg viewBox="0 0 100 80"><use href="#ing-${id}"/></svg>`;
  return `<svg viewBox="0 0 100 80"><rect x="30" y="20" width="40" height="42" fill="none" stroke="currentColor" stroke-dasharray="3 3"/><text x="50" y="46" text-anchor="middle" font-size="9" fill="#8a8a8a">${S.esc(letter || "?")}</text></svg>`;
}

function renderSetup() {
  const root = $("setupGrid");
  if (!root) return;
  const gear = meal.equipment || [
    { id: "pot", label: "глубокая кастрюля", note: "вода между MIN/MAX" },
    { id: "roner", label: "KitchenBoss roner", note: "зажим на стенке" },
    { id: "bag", label: "вакуумный пакет", note: "край сухой и в канавке" },
    { id: "weight", label: "груз / ложка", note: "если пакет всплывает" },
    { id: "pan", label: "тяжёлая сковорода", note: "финальная корочка" },
  ];
  root.innerHTML = gear.map((i) =>
    `<figure class="setup-card">${builtInArt(i)}<figcaption>${S.esc(i.label || "")}<span>${S.esc(i.note || "")}</span></figcaption></figure>`
  ).join("");

  const note = $("scanNote");
  if (!note) return;
  if (meal.study === "water") {
    const setupTitle = root.closest(".setup-sec")?.querySelector(".hd .t");
    if (setupTitle) setupTitle.textContent = "инвентарь · подготовка";
    for (const link of document.querySelectorAll('a[href="index.html"]')) link.href = "taste-atlas.html#water";
    note.innerHTML = '<b>атлас · ветка воды</b><span>шаги и таймеры для кухонной пробы.</span><a class="chip mini" href="taste-atlas.html#water">← ветка воды</a>';
    return;
  }
  const liveUrl = `https://foodos-lula-camarao.netlify.app/cook.html?meal=${encodeURIComponent(SLUG)}`;
  const local = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
  const secure = window.isSecureContext;
  note.innerHTML = local
    ? `<b>iphone scan</b><span>для камеры с айфона открой HTTPS-версию: <a href="${liveUrl}">${liveUrl}</a>. localhost видит только этот Mac.</span><button class="chip mini" id="copyIphoneLink">copy iphone link</button>`
    : secure
      ? `<b>iphone scan ready</b><span>открой этот экран на айфоне, затем нажми «iphone camera» или «снять фото».</span><button class="chip mini" id="copyIphoneLink">copy iphone link</button>`
      : `<b>camera blocked</b><span>браузер даст камеру только на HTTPS или localhost.</span>`;
  const copy = $("copyIphoneLink");
  if (copy) copy.onclick = async () => {
    try { await navigator.clipboard.writeText(liveUrl); S.toast("ссылка для айфона скопирована"); }
    catch { S.toast(liveUrl); }
  };
}

/* ingredients: use saved metaphor image if present, else built-in svg symbol, else placeholder */
function renderIngredients() {
  const root = $("ingArt");
  root.innerHTML = (meal.ingredients || []).map((i, n) => {
    const art = builtInArt(i, String.fromCharCode(97 + n));
    return `<figure>${art}<figcaption>${S.esc(i.label)}</figcaption></figure>`;
  }).join("");
}

async function warmMealMetaphors() {
  const lib = S.getMetaphors();
  const targets = (meal.ingredients || [])
    .map(i => (i.label || i.id || "").toLowerCase())
    .filter(Boolean)
    .filter(n => !lib[n])
    .slice(0, 6);
  if (!targets.length) return;
  for (const name of targets) {
    try {
      await S.drawMetaphor(name);
      S.upsertItem({ type: "ingredient", name, source: "auto-draw", artKey: name, slug: SLUG, fig: meal.fig, touch: false });
    } catch {}
  }
  renderIngredients();
  renderMemoryMini();
}

function renderMemoryMini() {
  const root = $("memoryMini");
  if (!root) return;
  const current = new Set([
    ...(meal.ingredients || []).map(i => (i.label || i.id || "").toLowerCase()),
    ...(meal.equipment || []).map(i => (i.label || i.id || "").toLowerCase()),
  ]);
  const items = S.getItems()
    .filter(i => current.has((i.name || "").toLowerCase()) || i.slug === SLUG)
    .slice(0, 10);
  root.innerHTML = items.length ? items.map(i =>
    `<span class="mem-chip" title="${S.esc(i.note || i.source || "")}">
      <b>${S.esc(i.type)}</b>${S.esc(i.name)}
    </span>`).join("") : `<span class="muted">пока пусто</span>`;
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
  const wasDone = done.has(id);
  done.has(id) ? done.delete(id) : done.add(id); S.saveProgress(SLUG, done);
  const el = document.querySelector(`.step[data-id="${id}"]`);
  if (el) { el.classList.toggle("done", done.has(id)); const b = el.querySelector('[data-act=toggle]'); if (b) b.textContent = done.has(id) ? "✓ готово" : "отметить"; }
  updateProgress(); markCurrent();
  if (!wasDone && done.has(id)) recordProgress(isComplete() ? "completed" : "step_done", id);
  if (done.has(id)) { const nx = currentStep(); if (nx && voice.on) voice.say(stripTtl(nx), "step"); }
}
const stripTtl = (s) => `${(s.ttl || "").split("·").pop().trim()}. ${s.lead}`;
function currentStep() { return (meal.steps || []).find(s => s.t !== "split" && visible(s.t) && !done.has(s.id)) || null; }
function markCurrent() {
  document.querySelectorAll("#steps .step").forEach(e => e.classList.remove("current"));
  const c = currentStep(); if (c) { const el = document.querySelector(`.step[data-id="${c.id}"]`); if (el) el.classList.add("current"); }
  renderSeeds();
}
function sayStep(s) { if (!voice.on) { voice.set(true); syncVoice(); } voice.say(stripTtl(s), "step"); }

function updateProgress() {
  const vis = (meal.steps || []).filter(s => s.t !== "split" && visible(s.t));
  const d = vis.filter(s => done.has(s.id)).length;
  const pct = vis.length ? Math.round(d / vis.length * 100) : 0;
  $("progfill").style.right = (100 - pct) + "%"; $("stDone").textContent = `${d}/${vis.length}`;
}
function progressLabel() {
  const vis = (meal.steps || []).filter(s => s.t !== "split" && visible(s.t));
  const d = vis.filter(s => done.has(s.id)).length;
  return `${d}/${vis.length} шагов`;
}
function isComplete() {
  const vis = (meal.steps || []).filter(s => s.t !== "split" && visible(s.t));
  return !!vis.length && vis.every(s => done.has(s.id));
}
function recordOpenOnce() {
  const key = "foodos:last-open:" + SLUG;
  const last = Number(localStorage.getItem(key) || 0);
  if (Date.now() - last < 5 * 60 * 1000) return;
  localStorage.setItem(key, String(Date.now()));
  recordProgress("opened", "cook screen");
}
function recordProgress(kind, note = "") {
  S.recordMealEvent({
    kind,
    slug: SLUG,
    title: meal.title,
    fig: meal.fig,
    progress: progressLabel(),
    note,
    track,
  });
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
    if (voice.on) voice.say(advice, "advice");
  } catch (e) { btn.textContent = "не вышло"; btn.disabled = false; S.toast("ai недоступен: " + e.message); }
}

/* ---------- timers ---------- */
const timers = {}; let actx = null;
function beep() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const now = actx.currentTime;
    const master = actx.createGain();
    const filter = actx.createBiquadFilter();
    filter.type = "bandpass"; filter.frequency.value = 1180; filter.Q.value = 3.2;
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.22, now + 0.018);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    filter.connect(master); master.connect(actx.destination);

    const osc = actx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(174, now);
    osc.frequency.exponentialRampToValueAtTime(88, now + 0.33);
    osc.connect(filter);

    const noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.9, actx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = actx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.connect(filter);

    osc.start(now); noise.start(now);
    osc.stop(now + 0.9); noise.stop(now + 0.9);
  } catch {}
}
function startTimer(id, sec) {
  if (timers[id]) return;
  const st = meal.steps.find(s => s.id === id);
  timers[id] = { left: sec, title: (st.ttl || "").split("·").pop().trim() };
  const b = document.querySelector(`[data-tid="${id}"]`); if (b) b.classList.add("on");
  timers[id].iv = setInterval(() => {
    timers[id].left--;
    if (timers[id].left <= 0) { clearInterval(timers[id].iv); timers[id].ring = true; beep(); if (navigator.vibrate) navigator.vibrate([300, 120, 300]); if (voice.on) voice.say(`таймер ${timers[id].title} — готово`, "timer"); }
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
function out(html, ok = true) { const bd = $("consoleBd"); bd.classList.remove("think"); bd.innerHTML = html; if (ok && voice.on) voice.say(bd.textContent, "advice"); }
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

async function askHermesCook() {
  const s = currentStep() || meal.steps.find(x => x.t !== "split") || {};
  think("Mise собирает систему");
  try {
    const state = await S.clientContext({
      surface: "cook",
      currentMeal: {
        slug: meal.slug, title: meal.title, sub: meal.sub, fig: meal.fig,
        operation: meal.operation || null,
        tracks: meal.tracks || null,
        ingredients: meal.ingredients || [],
        equipment: meal.equipment || [],
        axioms: meal.axioms || [],
      },
      currentStep: s,
      activeTrack: track,
      done: [...done],
      visibleSteps: cookableSteps().map(x => ({ id: x.id, t: x.t, ttl: x.ttl, lead: x.lead, time: x.time || 0 })),
    });
    const query = `я у плиты. блюдо: ${meal.title}. текущий шаг: ${s.ttl || ""} — ${s.lead || ""}. что мне сделать сейчас и что проверить?`;
    const { answer, actions = [] } = await S.FN("agent", { query, state });
    const actionHtml = actions.length ? `<ol>${actions.map(a => `<li>${S.esc(a)}</li>`).join("")}</ol>` : "";
    out(`<b>Mise</b><br>${S.esc(answer || "пустой ответ")}${actionHtml}`, false);
    if (voice.on && answer) voice.say(answer, "advice");
  } catch (e) {
    out(`Mise офлайн (${S.esc(e.message)}). текущая база: ${S.esc(s.tip || s.lead || "смотри текущий шаг")}`, false);
  }
}

/* ---------- live ingredient drawing ---------- */
async function drawIngredient() {
  const inp = $("drawInput"); const q = (inp.value || "").trim(); if (!q) { inp.focus(); return; }
  const box = $("drawBox");
  box.innerHTML = `<div class="ph"><span class="spin">◍</span> рисую «${S.esc(q)}»…</div>`;
  try {
    const img = await S.drawMetaphor(q);
    box.innerHTML = `<img src="${img}" class="drawing" alt="${S.esc(q)}">`;
    S.upsertItem({ type: "ingredient", name: q, source: "draw", artKey: q.toLowerCase() });
    renderMemoryMini();
    const info = S.getLastDrawInfo();
    S.toast(info.mode === "local" ? `«${q}» добавлен как локальный эскиз` : `«${q}» добавлен из ai-рисования`);
    inp.value = "";
  }
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
    S.rememberRecognizedItems(r.items || [], "camera");
    renderMemoryMini();
    const names = (r.items || []).map(i => i.label).filter(Boolean);
    out(names.length ? `вижу: <b>${S.esc(names.join(", "))}</b>${r.dish ? ` · похоже на ${S.esc(r.dish)}` : ""}` : (S.esc(r.note) || "ничего явного не вижу"));
    // offer to draw any newly seen ingredient into the library
    if (names.length) { const first = names[0]; $("drawInput").value = first; }
  } catch (e) { out(`распознавание недоступно (${S.esc(e.message)})`, false); }
}

async function camFilePick(ev) {
  const file = ev.target.files?.[0];
  ev.target.value = "";
  if (!file) return;
  think("читаю фото с айфона");
  try {
    const image = await fileToImageData(file);
    const r = await recognizeImageData(image);
    S.rememberRecognizedItems(r.items || [], "iphone photo");
    renderMemoryMini();
    const names = (r.items || []).map(i => i.label).filter(Boolean);
    out(names.length ? `с фото вижу: <b>${S.esc(names.join(", "))}</b>${r.dish ? ` · похоже на ${S.esc(r.dish)}` : ""}` : (S.esc(r.note) || "ничего явного не вижу"));
    if (names.length) $("drawInput").value = names[0];
  } catch (e) { out(`фото не прочиталось (${S.esc(e.message)})`, false); }
}

function syncVoice() {
  const el = $("voiceChip");
  el.classList.toggle("on", voice.on);
  el.innerHTML = `voice · <span class="k">${voice.label()}</span>`;
  el.title = voice.on ? `provider: ${voice.last.provider} · ${voice.last.detail}` : "voice off";
}
function resetAll() { if (confirm("сбросить прогресс этого блюда?")) { done.clear(); S.saveProgress(SLUG, done); recordProgress("reset", "manual reset"); Object.keys(timers).forEach(stopTimer); renderSteps(); if (focusOn) renderFocus(); } }

/* ============================================================
   FOCUS COOK MODE — one big step, hands-free
   ============================================================ */
let focusOn = false;
function cookableSteps() { return (meal.steps || []).filter(s => s.t !== "split" && visible(s.t)); }
function enterFocus() {
  focusOn = true; $("focus").classList.add("show");
  document.body.style.overflow = "hidden";
  $("focusChip").classList.add("on");
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
  if (voice.on) voice.say(stripTtl(st), "step");
}
function focusNext() {
  const list = cookableSteps(); const i = focusIndex(); const st = list[i];
  done.add(st.id); S.saveProgress(SLUG, done);
  const el = document.querySelector(`.step[data-id="${st.id}"]`); if (el) { el.classList.add("done"); const b = el.querySelector('[data-act=toggle]'); if (b) b.textContent = "✓ готово"; }
  updateProgress();
  recordProgress(i >= list.length - 1 ? "completed" : "step_done", st.id);
  if (done.size >= list.length || i >= list.length - 1) { exitFocus(); S.toast("готово — приятного аппетита ◎"); return; }
  renderFocus();
}
function focusPrev() {
  const list = cookableSteps(); const i = focusIndex();
  for (let k = i - 1; k >= 0; k--) { if (done.has(list[k].id)) { done.delete(list[k].id); S.saveProgress(SLUG, done); break; } }
  updateProgress(); renderSteps(); renderFocus();
}

function wire() {
  $("voiceChip").onclick = () => { voice.toggle(); syncVoice(); if (voice.on) { const s = currentStep(); if (s) voice.say(stripTtl(s), "step"); } };
  window.addEventListener("foodos:voice-status", syncVoice);
  $("camChip").onclick = camToggle;
  $("themeChip").onclick = () => { const d = S.toggleTheme(); $("themeChip").innerHTML = `theme · <span class="k">${d ? "dark" : "light"}</span>`; };
  $("camToggleBtn").onclick = camToggle;
  $("camCheckBtn").onclick = checkCamera;
  $("camRecogBtn").onclick = camRecognize;
  $("camFileBtn").onclick = () => $("camFile").click();
  $("camFile").onchange = camFilePick;
  $("adviseBtn").onclick = adviseStep;
  $("checkBtn").onclick = checkCamera;
  $("agentCookBtn").onclick = askHermesCook;
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

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
