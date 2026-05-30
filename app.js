/* ============================================================
   foodos · shaper instrument · app logic
   steps engine · camera monitor · voice guidance · live advice
   on-the-fly ingredient drawing (openrouter via netlify function)
   ============================================================ */

const MEAL = {
  id: "lula-camarao-2026-05-30",
  title: "lula recheada com chouriço × camarão",
  sub: "фаршированный кальмар (чоризо) + креветки · разморозка → стол",
  date: "2026-05-30",
  servings: "3–4",
  active: "~40м",
  total: "~1ч",
};

/* cooking principles — shaper axioms */
const AXIOMS = [
  "правило кальмара — либо <b>&lt;3 мин</b>, либо <b>&gt;30 мин</b>. между = резина.",
  "соус делим <b>до</b> морепродуктов — иначе растительная сковорода загрязнена.",
  "мокрый продукт парится, а не жарится — <b>обсушить</b> перед сковородой.",
  "соль креветкам — <b>в конце</b>, иначе тянет влагу и резинит.",
  "одна база — две тарелки. меньше работы, больше людей за столом.",
];

/* ingredient line-art (svg symbol ids defined in index.html) */
const INGREDIENTS = [
  { id: "squid",   label: "кальмар" },
  { id: "shrimp",  label: "креветка" },
  { id: "mushroom",label: "вёшенка" },
];

/* meal steps · t: shared|split|sea|veg */
const STEPS = [
  { id:"s1", t:"shared", ttl:"defrost · разморозка", time:1200,
    lead:"кальмары и креветки — в холодную воду на 15–20 мин. затем обсушить насухо: мокрые не подрумянятся.",
    tip:"горячую воду нельзя — края «свариваются». лёд в холодной воде тает быстрее, чем на воздухе." },
  { id:"s2", t:"shared", ttl:"base · соус", time:300,
    lead:"оливковое масло, лук и чеснок — на средний огонь до мягкости и аромата." },
  { id:"s3", t:"shared", ttl:"base · томат + вино", time:180,
    lead:"банка рубленых томатов, плеск белого вина, лавр, копчёная паприка, соль, щепоть сахара. прогреть ~3 мин." },
  { id:"split", t:"split" },
  { id:"sea1", t:"sea", ttl:"sea · подрумянить", time:240,
    lead:"обсушенные тушки — 2 мин с каждой стороны на сильном огне. не прокалывать: начинка с чоризо внутри.",
    tip:"открытый конец тушки закрепить зубочисткой — начинка останется внутри." },
  { id:"sea2", t:"sea", ttl:"sea · тушение", time:2100,
    lead:"тушки в морскую сковороду с соусом, накрыть, томить 30–35 мин на слабом, перевернуть раз. готово — нож входит легко.",
    tip:"правило кальмара: фаршированные тушки только долго, иначе резина." },
  { id:"sea3", t:"sea", ttl:"sea · креветки à guilho", time:240,
    lead:"за 5 мин до подачи: чеснок + хлопья чили + масло, креветки по 2 мин до розового, в конце лимон и петрушка." },
  { id:"sea4", t:"sea", ttl:"sea · подача",
    lead:"кальмары в соусе, сверху чесночные креветки, петрушка, корка хлеба под соус." },
  { id:"veg1", t:"veg", ttl:"veg · начинка",
    lead:"рис + копчёная паприка + вяленый томат + жареный лук + грецкий орех. дымный умами вместо колбасы." },
  { id:"veg2", t:"veg", ttl:"veg · нафаршировать",
    lead:"королевские вёшенки разрезать вдоль и вынуть серединку (или мини-перцы) — набить начинкой." },
  { id:"veg3", t:"veg", ttl:"veg · тушение", time:1500,
    lead:"в растительную сковороду с соусом, накрыть, 20–25 мин на слабом огне." },
  { id:"veg4", t:"veg", ttl:"veg · вёшенки à guilho", time:300,
    lead:"бруски королевской вёшенки + чеснок + чили + масло, 4–5 мин, лимон и петрушка. растительный аналог креветок." },
  { id:"veg5", t:"veg", ttl:"veg · подача",
    lead:"фаршированные в соусе, сверху грибы, петрушка, хлеб." },
];

const PHASE_NAMES = { shared:"общая база", sea:"морская дорожка", veg:"растительная дорожка" };
const PHASE_GLYPH = { shared:"⊕", sea:"◆", veg:"◇" };

/* ---------- state ---------- */
const K = (s)=>`foodos:${MEAL.id}:${s}`;
let track = localStorage.getItem(K("track")) || "both";
let voiceOn = localStorage.getItem(K("voice")) === "1";
const done = new Set(JSON.parse(localStorage.getItem(K("done")) || "[]"));
const drawCache = JSON.parse(localStorage.getItem(K("draw")) || "{}");

function save(){ localStorage.setItem(K("done"), JSON.stringify([...done])); }
function fmt(s){ const m=Math.floor(s/60), x=s%60; return m+":"+String(x).padStart(2,"0"); }
function esc(v){ return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

/* ---------- theme ---------- */
function initTheme(){
  const t = localStorage.getItem(K("theme")) || "light";
  document.documentElement.classList.toggle("dark", t==="dark");
  syncThemeChip();
}
function toggleTheme(){
  const dark = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem(K("theme"), dark?"dark":"light");
  syncThemeChip();
}
function syncThemeChip(){
  const dark = document.documentElement.classList.contains("dark");
  const el = document.getElementById("themeChip");
  if(el) el.innerHTML = `theme · <span class="k">${dark?"dark":"light"}</span>`;
}

/* ---------- voice (web speech) ---------- */
let ruVoice = null;
function pickVoice(){
  const vs = speechSynthesis.getVoices();
  ruVoice = vs.find(v=>/ru/i.test(v.lang)) || vs.find(v=>/Milena|Yuri|Google рус/i.test(v.name)) || null;
}
if("speechSynthesis" in window){ speechSynthesis.onvoiceschanged = pickVoice; pickVoice(); }
function say(text){
  if(!voiceOn || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ru-RU"; if(ruVoice) u.voice = ruVoice; u.rate = .98; u.pitch = 1;
  speechSynthesis.speak(u);
}
function toggleVoice(){
  voiceOn = !voiceOn;
  localStorage.setItem(K("voice"), voiceOn?"1":"0");
  syncVoiceChip();
  if(voiceOn){ const s = currentStep(); if(s) say(stripTtl(s)); }
  else if("speechSynthesis" in window) speechSynthesis.cancel();
}
function syncVoiceChip(){
  const el=document.getElementById("voiceChip");
  if(el){ el.classList.toggle("on",voiceOn); el.innerHTML=`voice · <span class="k">${voiceOn?"on":"off"}</span>`; }
}
function stripTtl(s){ return `${s.ttl.split("·").pop().trim()}. ${s.lead}`; }

/* ---------- render: ingredients + axioms ---------- */
function renderIngredients(){
  const root=document.getElementById("ingArt");
  root.innerHTML = INGREDIENTS.map(i=>
    `<figure><svg viewBox="0 0 100 80" aria-label="${i.label}"><use href="#ing-${i.id}"/></svg><figcaption>${i.label}</figcaption></figure>`
  ).join("");
}
function renderAxioms(){
  const root=document.getElementById("axioms");
  root.innerHTML = AXIOMS.map((a,i)=>`<div class="axiom"><span class="i">${String(i+1).padStart(2,"0")}</span><span>${a}</span></div>`).join("");
}

/* ---------- render: steps ---------- */
function visible(t){ return track==="both" || t==="shared" || t==="split" || t===track; }

function renderSteps(){
  const root=document.getElementById("steps"); root.innerHTML=""; let last="";
  let n=0;
  STEPS.forEach(st=>{
    if(st.t==="split"){
      const d=document.createElement("div"); d.className="split"; d.dataset.t="split";
      d.innerHTML=`<div class="lab">⑃ точка разделения</div>
        <div class="txt">раздели соус на две сковороды. дальше дорожки идут параллельно — в растительную не попадают морепродукты.</div>
        <div class="arrows"><span class="a">◆ → кальмары + креветки</span><span class="a">◇ → грибы / перцы</span></div>`;
      root.appendChild(d); return;
    }
    if(st.t!==last){
      last=st.t;
      const ph=document.createElement("div"); ph.className="phase-label"; ph.dataset.t=st.t;
      ph.innerHTML=`<span class="gl">${PHASE_GLYPH[st.t]}</span> ${PHASE_NAMES[st.t]}`;
      root.appendChild(ph);
    }
    n++;
    const el=document.createElement("article");
    el.className="step"+(done.has(st.id)?" done":""); el.dataset.t=st.t; el.dataset.id=st.id;
    el.innerHTML=`
      <div class="num">${n}</div>
      <div class="hd"><span class="ttl">${esc(st.ttl)}</span><span class="id">${st.id}</span></div>
      <div class="lead">${esc(st.lead)}</div>
      ${st.tip?`<div class="tip"><span class="m">⚑</span><span>${esc(st.tip)}</span></div>`:""}
      <div class="acts">
        <button class="chip" onclick="toggle('${st.id}')">${done.has(st.id)?"✓ готово":"отметить"}</button>
        ${st.time?`<button class="chip" data-tid="${st.id}" onclick="startTimer('${st.id}',${st.time})">▶ ${fmt(st.time)}</button>`:""}
        <button class="chip" onclick="sayStep('${st.id}')">◂ озвучить</button>
      </div>`;
    root.appendChild(el);
  });
  applyTrack(); updateProgress(); markCurrent();
}

function applyTrack(){
  document.querySelectorAll("[data-track]").forEach(b=>b.classList.toggle("on", b.dataset.track===track));
  document.querySelectorAll("#steps .step, #steps .phase-label").forEach(e=>e.classList.toggle("hide", !visible(e.dataset.t)));
  document.querySelectorAll("#steps .split").forEach(e=>e.classList.toggle("hide", !(track==="both"||track==="sea"||track==="veg")));
}
function setTrack(t){ track=t; localStorage.setItem(K("track"),t); applyTrack(); updateProgress(); markCurrent(); }

function toggle(id){
  done.has(id)?done.delete(id):done.add(id); save();
  const el=document.querySelector(`.step[data-id="${id}"]`);
  if(el){ el.classList.toggle("done",done.has(id));
    const b=el.querySelector(".acts .chip"); if(b) b.textContent = done.has(id)?"✓ готово":"отметить"; }
  updateProgress(); markCurrent();
  if(done.has(id)){ const nx=currentStep(); if(nx && voiceOn) say(stripTtl(nx)); }
}

function currentStep(){ return STEPS.find(s=>s.t!=="split" && visible(s.t) && !done.has(s.id)) || null; }
function markCurrent(){
  document.querySelectorAll("#steps .step").forEach(e=>e.classList.remove("current"));
  const c=currentStep(); if(c){ const el=document.querySelector(`.step[data-id="${c.id}"]`); if(el) el.classList.add("current"); }
  renderSeeds();
}
function sayStep(id){ const s=STEPS.find(x=>x.id===id); if(!s) return; if(!voiceOn){ voiceOn=true; localStorage.setItem(K("voice"),"1"); syncVoiceChip(); } say(stripTtl(s)); }

function updateProgress(){
  const vis=STEPS.filter(s=>s.t!=="split"&&visible(s.t));
  const d=vis.filter(s=>done.has(s.id)).length;
  const pct=vis.length?Math.round(d/vis.length*100):0;
  document.getElementById("progfill").style.right=(100-pct)+"%";
  document.getElementById("stDone").textContent=`${d}/${vis.length}`;
}
function renderSeeds(){
  const root=document.getElementById("seeds"); if(!root) return;
  const vis=STEPS.filter(s=>s.t!=="split"&&visible(s.t));
  root.innerHTML=`<span>seeds</span>`+vis.map(s=>`<span class="seed${done.has(s.id)?" active":""}">${s.id}</span>`).join("");
}

/* ---------- timers ---------- */
const timers={}; let actx=null;
function beep(){ try{ actx=actx||new(window.AudioContext||window.webkitAudioContext)();
  const o=actx.createOscillator(),g=actx.createGain(); o.connect(g); g.connect(actx.destination);
  o.frequency.value=880; g.gain.value=.16; o.start(); let n=0;
  const iv=setInterval(()=>{ o.frequency.value=n%2?660:880; if(++n>7){o.stop();clearInterval(iv);} },180);
}catch(e){} }
function startTimer(id,sec){
  if(timers[id]) return;
  const st=STEPS.find(s=>s.id===id);
  timers[id]={left:sec, title:st.ttl.split("·").pop().trim()};
  const b=document.querySelector(`.chip[data-tid="${id}"]`); if(b) b.classList.add("on");
  timers[id].iv=setInterval(()=>{ timers[id].left--;
    if(timers[id].left<=0){ clearInterval(timers[id].iv); timers[id].ring=true; beep();
      if(navigator.vibrate) navigator.vibrate([300,120,300]);
      if(voiceOn) say(`таймер ${timers[id].title} — готово`); }
    drawDock(); }, 1000);
  drawDock();
}
function stopTimer(id){ if(timers[id]){ clearInterval(timers[id].iv); delete timers[id];
  const b=document.querySelector(`.chip[data-tid="${id}"]`); if(b) b.classList.remove("on"); drawDock(); } }
function drawDock(){
  const dock=document.getElementById("dock"); const ids=Object.keys(timers);
  dock.classList.toggle("show", ids.length>0); dock.innerHTML="";
  ids.forEach(id=>{ const t=timers[id];
    const c=document.createElement("div"); c.className="tchip"+(t.ring?" ring":"");
    c.innerHTML=`${t.ring?"⏰ ":""}${esc(t.title).slice(0,18)} · ${t.left>0?fmt(t.left):"готово"} <span class="x" onclick="stopTimer('${id}')">✕</span>`;
    dock.appendChild(c); });
}

/* ---------- camera monitor ---------- */
let stream=null;
async function toggleCam(){
  const cam=document.getElementById("cam"); const v=document.getElementById("camVideo");
  if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; cam.classList.remove("live");
    document.getElementById("camChip").innerHTML=`cam · <span class="k">off</span>`;
    document.getElementById("camChip").classList.remove("on"); return; }
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
    v.srcObject=stream; await v.play(); cam.classList.add("live");
    document.getElementById("camChip").innerHTML=`cam · <span class="k">live</span>`;
    document.getElementById("camChip").classList.add("on");
  }catch(e){ consoleOut("камера недоступна: "+(e.message||e)+" · на телефоне разреши доступ к камере.", false); }
}
function captureFrame(){
  const v=document.getElementById("camVideo");
  if(!stream || !v.videoWidth){ consoleOut("сначала включи камеру (cam · live).", false); return null; }
  const c=document.createElement("canvas");
  const w=Math.min(768, v.videoWidth); const sc=w/v.videoWidth;
  c.width=w; c.height=Math.round(v.videoHeight*sc);
  c.getContext("2d").drawImage(v,0,0,c.width,c.height);
  return c.toDataURL("image/jpeg",0.7);
}

/* ---------- advice console (openrouter via netlify fn) ---------- */
function consoleOut(html, ok=true){
  const bd=document.getElementById("consoleBd");
  bd.classList.remove("think"); bd.innerHTML = html;
  if(ok && voiceOn) say(bd.textContent);
}
function consoleThink(label){
  const bd=document.getElementById("consoleBd");
  bd.classList.add("think"); bd.innerHTML=`<span class="blink">${label}</span>`;
}
async function callFn(name, body){
  const r=await fetch(`/.netlify/functions/${name}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  if(!r.ok){ const t=await r.text().catch(()=> ""); throw new Error(`${r.status} ${t.slice(0,120)}`); }
  return r.json();
}
async function adviseStep(){
  const s=currentStep() || STEPS[STEPS.length-1];
  consoleThink("шеф думает");
  try{
    const ctx=`блюдо: ${MEAL.title}. дорожка: ${track}. текущий шаг: ${s.ttl} — ${s.lead}`;
    const {advice}=await callFn("advise",{mode:"text",step:s.ttl,context:ctx});
    consoleOut(esc(advice));
  }catch(e){ consoleOut(`совет недоступен офлайн (${esc(e.message)}). база: ${esc(s.tip||s.lead)}`, false); }
}
async function checkByCamera(){
  const img=captureFrame(); if(!img) return;
  const s=currentStep() || STEPS[STEPS.length-1];
  consoleThink("смотрю на сковороду");
  try{
    const ctx=`шаг: ${s.ttl} — ${s.lead}. оцени по фото готовность/что поправить, кратко, по-русски.`;
    const {advice}=await callFn("advise",{mode:"vision",step:s.ttl,context:ctx,image:img});
    consoleOut(esc(advice));
  }catch(e){ consoleOut(`vision недоступен (${esc(e.message)}).`, false); }
}

/* ---------- live ingredient drawing ---------- */
async function drawIngredient(){
  const inp=document.getElementById("drawInput"); const q=(inp.value||"").trim();
  if(!q){ inp.focus(); return; }
  const box=document.getElementById("drawBox");
  if(drawCache[q]){ box.innerHTML=`<img src="${drawCache[q]}" alt="${esc(q)}">`; return; }
  box.innerHTML=`<div class="ph"><span class="spin">◍</span> рисую «${esc(q)}»…</div>`;
  try{
    const {image}=await callFn("draw",{ingredient:q});
    if(!image) throw new Error("пустой ответ");
    drawCache[q]=image; localStorage.setItem(K("draw"),JSON.stringify(drawCache));
    box.innerHTML=`<img src="${image}" alt="${esc(q)}">`;
  }catch(e){ box.innerHTML=`<div class="ph">не вышло: ${esc(e.message)}<br>(нужен деплой на netlify с ключом)</div>`; }
}

/* ---------- reset ---------- */
function resetAll(){ if(confirm("сбросить прогресс?")){ done.clear(); save(); Object.keys(timers).forEach(stopTimer); renderSteps(); } }

/* ---------- boot ---------- */
function fillMeta(){
  document.getElementById("crumb").innerHTML=`fig.01 · <b>${esc(MEAL.title)}</b>`;
  document.getElementById("metaSub").textContent=MEAL.sub;
  document.getElementById("stServ").textContent=MEAL.servings;
  document.getElementById("stActive").textContent=MEAL.active;
  document.getElementById("stTotal").textContent=MEAL.total;
  document.getElementById("stampFig").innerHTML=`fig.01 · lula × camarão <small>schematic · ${MEAL.date}</small>`;
}
function boot(){
  initTheme(); fillMeta(); renderIngredients(); renderAxioms(); renderSteps();
  syncVoiceChip();
  document.querySelectorAll("[data-track]").forEach(b=>b.addEventListener("click",()=>setTrack(b.dataset.track)));
  document.getElementById("drawInput").addEventListener("keydown",e=>{ if(e.key==="Enter") drawIngredient(); });
}
document.addEventListener("DOMContentLoaded", boot);
