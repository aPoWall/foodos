/* foodos · store — единый слой данных: вкусовой профиль, библиотека блюд,
   кэш нарисованных метафор, прогресс. Всё в localStorage + встроенные json. */

export const FN = (name, body) =>
  fetch(`/.netlify/functions/${name}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }).then(async (r) => {
    if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`${r.status} ${t.slice(0, 140)}`); }
    return r.json();
  });

const LS = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("foodos:" + k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem("foodos:" + k, JSON.stringify(v)); },
  del(k) { localStorage.removeItem("foodos:" + k); },
};

/* ---------- taste profile ---------- */
export async function getTaste() {
  const saved = LS.get("taste", null);
  if (saved) return saved;
  try { const d = await fetch("data/taste-profile.default.json").then(r => r.json()); LS.set("taste", d); return d; }
  catch { return { language: "ru", diet_tracks: ["обычная"], loves: [], avoids: [] }; }
}
export function saveTaste(t) { LS.set("taste", t); }

/* ---------- meal library ---------- */
// built-in meals (data/meals/*.json) + user meals (localStorage)
export async function listMeals() {
  let builtin = [];
  try { builtin = (await fetch("data/meals/index.json").then(r => r.json())).meals || []; } catch {}
  const user = LS.get("meals", []); // [{slug,title,sub,fig,tags,_user:true}]
  const seen = new Set(user.map(m => m.slug));
  return [...user, ...builtin.filter(m => !seen.has(m.slug))];
}
export async function getMeal(slug) {
  const user = LS.get("meal:" + slug, null);
  if (user) return user;
  return fetch(`data/meals/${slug}.json`).then(r => { if (!r.ok) throw new Error("no meal"); return r.json(); });
}
export function saveUserMeal(meal) {
  const list = LS.get("meals", []).filter(m => m.slug !== meal.slug);
  list.unshift({ slug: meal.slug, title: meal.title, sub: meal.sub, fig: meal.fig, tags: meal.tags || [], _user: true });
  LS.set("meals", list);
  LS.set("meal:" + meal.slug, meal);
}
export function deleteUserMeal(slug) {
  LS.set("meals", LS.get("meals", []).filter(m => m.slug !== slug));
  LS.del("meal:" + slug); LS.del("progress:" + slug);
}

/* ---------- progress (per meal) ---------- */
export function getProgress(slug) { return new Set(LS.get("progress:" + slug, [])); }
export function saveProgress(slug, set) { LS.set("progress:" + slug, [...set]); }

/* ---------- expanded substeps (AI per-step) ---------- */
export function getExpands(slug) { return LS.get("expand:" + slug, {}); }
export function saveExpand(slug, stepId, text) { const e = getExpands(slug); e[stepId] = text; LS.set("expand:" + slug, e); }

/* ---------- metaphor library (drawn ingredient line-art) ---------- */
// shared across all meals — a growing visual dictionary
export function getMetaphors() { return LS.get("metaphors", {}); } // { name: dataURL }
export function saveMetaphor(name, dataURL) { const m = getMetaphors(); m[name] = dataURL; LS.set("metaphors", m); }
export function deleteMetaphor(name) { const m = getMetaphors(); delete m[name]; LS.set("metaphors", m); }

export async function drawMetaphor(name) {
  const lib = getMetaphors();
  const key = name.trim().toLowerCase();
  if (lib[key]) return lib[key];
  const { image } = await FN("draw", { ingredient: key });
  if (!image) throw new Error("пустой ответ");
  saveMetaphor(key, image);
  return image;
}

/* ---------- theme ---------- */
export function initTheme() {
  document.documentElement.classList.toggle("dark", LS.get("theme", "light") === "dark");
}
export function toggleTheme() {
  const dark = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", dark);
  LS.set("theme", dark ? "dark" : "light");
  return dark;
}

/* ---------- toast ---------- */
let toastEl;
export function toast(msg) {
  if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; document.body.appendChild(toastEl); }
  toastEl.textContent = msg; toastEl.classList.add("show");
  clearTimeout(toastEl._t); toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

export const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
