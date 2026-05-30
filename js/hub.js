/* foodos · hub — library of dishes, dish composer (context+taste→AI meal),
   taste profile editor, metaphor gallery. */

import * as S from "./store.js";

const $ = (id) => document.getElementById(id);

async function boot() {
  S.initTheme();
  $("themeChip").innerHTML = `theme · <span class="k">${document.documentElement.classList.contains("dark") ? "dark" : "light"}</span>`;
  $("themeChip").onclick = () => { const d = S.toggleTheme(); $("themeChip").innerHTML = `theme · <span class="k">${d ? "dark" : "light"}</span>`; };
  await renderLibrary();
  await renderTaste();
  renderGallery();
  wireComposer();
}

/* ---------- library ---------- */
async function renderLibrary() {
  const meals = await S.listMeals();
  const grid = $("library");
  grid.innerHTML = meals.map(m => `
    <div class="card" data-slug="${S.esc(m.slug)}">
      ${m._user ? `<span class="del" data-del="${S.esc(m.slug)}" title="удалить">✕</span>` : ""}
      <div class="fig">${S.esc(m.fig || "fig.··")}${m._user ? " · моё" : ""}</div>
      <div class="nm">${S.esc(m.title)}</div>
      <div class="sb">${S.esc(m.sub || "")}</div>
      <div class="mt">${(m.tags || []).slice(0, 3).map(t => `<span>${S.esc(t)}</span>`).join("")}</div>
    </div>`).join("") +
    `<div class="card add" id="addCard"><div class="big">＋</div><div>новое блюдо</div><div class="sb">опиши ниже → ai соберёт</div></div>`;
  grid.querySelectorAll(".card[data-slug]").forEach(c => c.onclick = (e) => {
    if (e.target.dataset.del) return;
    location.href = `cook.html?meal=${encodeURIComponent(c.dataset.slug)}`;
  });
  grid.querySelectorAll("[data-del]").forEach(x => x.onclick = (e) => { e.stopPropagation(); if (confirm("удалить блюдо?")) { S.deleteUserMeal(x.dataset.del); renderLibrary(); } });
  $("addCard").onclick = () => $("ctxInput").focus();
}

/* ---------- composer: context + taste → meal ---------- */
function wireComposer() {
  $("composeBtn").onclick = compose;
  $("ctxInput").addEventListener("keydown", e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) compose(); });
}
async function compose() {
  const ctx = ($("ctxInput").value || "").trim();
  if (!ctx) { $("ctxInput").focus(); return; }
  const out = $("composeOut");
  out.innerHTML = `<span class="spin">◍</span> собираю блюдо под твои вкусы…`;
  $("composeBtn").disabled = true;
  try {
    const taste = await S.getTaste();
    const { meal } = await S.FN("compose", { context: ctx, taste });
    if (!meal || !meal.steps?.length) throw new Error("пустой ответ модели");
    S.saveUserMeal(meal);
    out.innerHTML = `✓ собрано: <b>${S.esc(meal.title)}</b> — ${meal.steps.length} шагов. открываю…`;
    setTimeout(() => location.href = `cook.html?meal=${encodeURIComponent(meal.slug)}`, 700);
  } catch (e) {
    out.innerHTML = `не вышло: ${S.esc(e.message)}<br><span style="font-size:11px">нужен онлайн + ключ openrouter на сайте</span>`;
    $("composeBtn").disabled = false;
  }
}

/* ---------- taste profile ---------- */
async function renderTaste() {
  const t = await S.getTaste();
  const arr = (v) => Array.isArray(v) ? v.join(", ") : (v || "");
  $("tProfile").innerHTML = `
    <div class="field"><span class="lbl">люблю</span><textarea id="tLoves">${S.esc(arr(t.loves))}</textarea></div>
    <div class="field"><span class="lbl">избегаю</span><textarea id="tAvoids">${S.esc(arr(t.avoids))}</textarea></div>
    <div class="field"><span class="lbl">острота</span><input id="tSpice" type="text" value="${S.esc(t.spice || "")}"></div>
    <div class="field"><span class="lbl">дорожки</span><input id="tTracks" type="text" value="${S.esc(arr(t.diet_tracks))}"></div>
    <div class="field"><span class="lbl">ограничения</span><textarea id="tConstr">${S.esc(arr(t.constraints))}</textarea></div>
    <div class="field"><span class="lbl"></span><button class="chip" id="tSave">сохранить профиль</button></div>`;
  $("tSave").onclick = () => {
    const list = (id) => $(id).value.split(",").map(s => s.trim()).filter(Boolean);
    const next = { ...t, loves: list("tLoves"), avoids: list("tAvoids"), spice: $("tSpice").value.trim(),
      diet_tracks: list("tTracks"), constraints: list("tConstr"),
      always_vegan_track: list("tTracks").some(x => /веган|растит/i.test(x)) };
    S.saveTaste(next); S.toast("вкусовой профиль сохранён");
  };
}

/* ---------- metaphor gallery ---------- */
function renderGallery() {
  const lib = S.getMetaphors(); const names = Object.keys(lib);
  $("galleryCount").textContent = names.length ? `${names.length}` : "пусто";
  $("gallery").innerHTML = names.length
    ? names.map(n => `<figure><span class="del" data-g="${S.esc(n)}">✕</span><img src="${lib[n]}" alt="${S.esc(n)}"><figcaption>${S.esc(n)}</figcaption></figure>`).join("")
    : `<div style="color:var(--muted);font-size:12px;grid-column:1/-1">библиотека пуста — рисуй ингредиенты в инструменте готовки, они копятся здесь</div>`;
  $("gallery").querySelectorAll("[data-g]").forEach(x => x.onclick = () => { S.deleteMetaphor(x.dataset.g); renderGallery(); });
  // draw-from-hub
  $("galDrawBtn").onclick = galDraw;
  $("galInput").addEventListener("keydown", e => { if (e.key === "Enter") galDraw(); });
}
async function galDraw() {
  const q = ($("galInput").value || "").trim(); if (!q) return;
  $("galInput").disabled = true; const old = $("galDrawBtn").textContent; $("galDrawBtn").textContent = "···";
  try { await S.drawMetaphor(q); $("galInput").value = ""; renderGallery(); S.toast(`«${q}» нарисован`); }
  catch (e) { S.toast("не вышло: " + e.message); }
  finally { $("galInput").disabled = false; $("galDrawBtn").textContent = old; }
}

document.addEventListener("DOMContentLoaded", boot);
