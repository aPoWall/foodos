/* foodos · store — единый слой данных: вкусовой профиль, библиотека блюд,
   кэш нарисованных метафор, прогресс. localStorage как быстрый кеш +
   Netlify Blobs как общий state между девайсами. */

export const FN = (name, body) =>
  localStaticServer()
    ? Promise.reject(new Error(`локально функция ${name} недоступна: запусти netlify dev или открой live-сайт`))
    : fetch(`/.netlify/functions/${name}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }).then(async (r) => {
      const text = await r.text().catch(() => "");
      if (!r.ok) throw new Error(functionError(name, r.status, text));
      try { return JSON.parse(text || "{}"); }
      catch { throw new Error(functionError(name, r.status, text)); }
    });

function localStaticServer() {
  if (document.querySelector('meta[name="foodos-static"]')) return true;
  const local = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
  return local && location.port && !["8888", "8889"].includes(location.port);
}

function functionError(name, status, text) {
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {}
  if (parsed?.error) return parsed.error;
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (status === 501 && /doctype html|unsupported method|simplehttp/i.test(clean))
    return `локально функция ${name} недоступна: запусти netlify dev или открой live-сайт`;
  if (status === 404) return `функция ${name} недоступна на этом сервере`;
  if (/doctype html/i.test(clean)) return `функция ${name} вернула html вместо json`;
  return `${status} ${clean.slice(0, 180) || "ошибка функции"}`;
}

const LS = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("foodos:" + k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem("foodos:" + k, JSON.stringify(v)); },
  del(k) { localStorage.removeItem("foodos:" + k); },
};

let syncReady = false;
let syncBusy = false;
let syncTimer = null;
let lastSync = { mode: "idle", at: "", error: "" };

export function syncStatus() { return lastSync; }

export async function syncFromServer() {
  if (localStaticServer()) return false;
  try {
    const { state } = await FN("state", { action: "get" });
    mergeRemoteState(state || {});
    syncReady = true;
    lastSync = { mode: "ok", at: new Date().toISOString(), error: "" };
    syncToServer("merge-local");
    return true;
  } catch (e) {
    syncReady = true;
    lastSync = { mode: "offline", at: new Date().toISOString(), error: String(e.message || e) };
    return false;
  }
}

export function syncToServer(reason = "change") {
  if (!syncReady || localStaticServer()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => pushServerState(reason), 350);
}

async function pushServerState(reason) {
  if (syncBusy) return syncToServer(reason);
  syncBusy = true;
  try {
    const { state } = await FN("state", { action: "put", reason, state: snapshotState() });
    mergeRemoteState(state || {});
    lastSync = { mode: "ok", at: new Date().toISOString(), error: "" };
  } catch (e) {
    lastSync = { mode: "offline", at: new Date().toISOString(), error: String(e.message || e) };
  } finally {
    syncBusy = false;
  }
}

function snapshotState() {
  const mealDetails = {};
  for (const m of LS.get("meals", [])) {
    const detail = LS.get("meal:" + m.slug, null);
    if (detail) mealDetails[m.slug] = detail;
  }
  return {
    version: "v3.3-client-state",
    updatedAt: new Date().toISOString(),
    taste: LS.get("taste", null),
    meals: LS.get("meals", []),
    mealDetails,
    hiddenMeals: LS.get("hiddenMeals", []),
    deletedMeals: LS.get("deletedMeals", []),
    items: getItems(),
    mealEvents: getMealEvents(),
    metaphors: getMetaphors(),
    deletedMetaphors: LS.get("deletedMetaphors", []),
    progress: collectScoped("progress:"),
    expands: collectScoped("expand:"),
  };
}

function mergeRemoteState(remote) {
  const deletedMeals = union(LS.get("deletedMeals", []), remote.deletedMeals || []);
  const hiddenMeals = union(LS.get("hiddenMeals", []), remote.hiddenMeals || []);
  const blockedMeals = new Set([...deletedMeals, ...hiddenMeals]);
  if (remote.taste && !LS.get("taste", null)) LS.set("taste", remote.taste);

  const meals = mergeBy(remote.meals || [], LS.get("meals", []), "slug")
    .filter(m => !blockedMeals.has(m.slug))
    .slice(0, 160);
  LS.set("meals", meals);
  LS.set("hiddenMeals", hiddenMeals);
  LS.set("deletedMeals", deletedMeals);

  const remoteDetails = remote.mealDetails || {};
  Object.keys(remoteDetails).forEach((slug) => {
    if (!blockedMeals.has(slug) && !LS.get("meal:" + slug, null)) LS.set("meal:" + slug, remoteDetails[slug]);
  });
  blockedMeals.forEach(slug => {
    LS.del("meal:" + slug);
    LS.del("progress:" + slug);
    LS.del("expand:" + slug);
    LS.del("device:" + slug);
  });

  LS.set("items", mergeBy(remote.items || [], getItems(), "key").slice(0, 320));
  LS.set("mealEvents", mergeBy(remote.mealEvents || [], getMealEvents(), "id")
    .filter(e => !blockedMeals.has(e.slug))
    .sort((a, b) => Date.parse(b.at || "") - Date.parse(a.at || ""))
    .slice(0, 900));

  const deletedMetaphors = union(LS.get("deletedMetaphors", []), remote.deletedMetaphors || []);
  const metaphors = { ...(remote.metaphors || {}), ...getMetaphors() };
  deletedMetaphors.forEach(name => delete metaphors[name]);
  LS.set("metaphors", metaphors);
  LS.set("deletedMetaphors", deletedMetaphors);

  applyScoped("progress:", remote.progress || {}, blockedMeals);
  applyScoped("expand:", remote.expands || {}, blockedMeals);
}

function collectScoped(prefix) {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("foodos:" + prefix)) continue;
    const slug = key.slice(("foodos:" + prefix).length);
    out[slug] = LS.get(prefix + slug, prefix === "progress:" ? [] : {});
  }
  return out;
}

function applyScoped(prefix, data, blockedMeals) {
  Object.entries(data || {}).forEach(([slug, value]) => {
    if (!blockedMeals.has(slug) && LS.get(prefix + slug, null) == null) LS.set(prefix + slug, value);
  });
}

function mergeBy(a, b, key) {
  const map = new Map();
  [...(a || []), ...(b || [])].forEach((x) => {
    const k = String(x?.[key] || "").trim();
    if (!k) return;
    map.set(k, { ...(map.get(k) || {}), ...x });
  });
  return [...map.values()];
}

function union(a = [], b = []) {
  return [...new Set([...(a || []), ...(b || [])].map(String).filter(Boolean))];
}

/* ---------- built-in visual atlas ---------- */
// Close-to-reality SVG metaphors for the things FoodOS already knows.
// AI drawing is still used for everything outside this atlas.
const VISUAL_ATLAS_VERSION = "2026-06-27-plate-v2";
const BUILTIN_VISUALS = [
  {
    id: "salt", label: "соль", type: "ingredient", aliases: ["соль", "salt", "sea salt", "крупная соль"],
    body: `
      <path class="draw-line d1" d="M39 18 H61 L58 66 H42 Z"/>
      <path class="draw-line d2" d="M41 27 H59 M42 36 H58 M43 51 H57"/>
      <path class="draw-line d3" d="M43 17 C46 11 54 11 57 17 M46 13 H54"/>
      <circle class="grain drift a" cx="31" cy="34" r="1.4"/><circle class="grain drift b" cx="68" cy="42" r="1.2"/>
      <circle class="grain drift a" cx="45" cy="10" r="1.3"/><circle class="grain drift b" cx="51" cy="8" r="1.5"/><circle class="grain drift a" cx="57" cy="11" r="1.2"/>`
  },
  {
    id: "pepper", label: "чёрный перец", type: "ingredient", aliases: ["перец", "черный перец", "чёрный перец", "pepper", "black pepper"],
    body: `
      <path class="draw-line d1" d="M48 13 C60 16 68 28 68 42 C68 58 56 67 42 62 C31 58 27 44 32 32 C36 23 41 17 48 13 Z"/>
      <path class="draw-line d2" d="M43 14 C41 9 47 7 54 10 C58 12 59 15 56 19 M36 34 C45 30 58 33 64 41 M35 46 C45 43 58 46 65 53"/>
      <path class="draw-line d3 dash" d="M43 24 C51 23 59 27 63 34"/>
      <circle class="grain pulse" cx="46" cy="39" r="1.4"/><circle class="grain pulse" cx="53" cy="49" r="1.7"/><circle class="grain drift a" cx="71" cy="61" r="2"/><circle class="grain drift b" cx="76" cy="66" r="1.2"/>`
  },
  {
    id: "steak", label: "стейк", type: "ingredient", aliases: ["steak", "стейк", "beef", "мясо", "говядина"],
    body: `
      <path class="draw-line d1" d="M18 46 C16 34 25 23 39 18 C54 12 73 17 82 30 C92 44 83 60 64 65 C46 70 25 62 18 46 Z"/>
      <path class="draw-line d2" d="M31 45 C30 36 39 28 51 26 C64 24 75 32 76 42 C76 51 64 58 51 58 C39 58 32 53 31 45 Z"/>
      <path class="draw-line d2" d="M43 42 C46 37 55 35 61 39 C67 43 65 52 58 54 C50 56 42 50 43 42 Z"/>
      <path class="draw-line d3 dash" d="M24 34 C39 40 57 37 78 30 M23 55 C38 48 61 51 82 58 M29 25 C35 29 41 31 48 31"/>`
  },
  {
    id: "garlic", label: "чеснок", type: "ingredient", aliases: ["чеснок", "garlic"],
    body: `
      <path class="draw-line d1" d="M50 17 C62 28 67 43 61 57 C57 67 43 67 39 57 C33 43 38 28 50 17 Z"/>
      <path class="draw-line d2" d="M50 20 C49 36 49 52 50 66 M40 32 C47 40 47 54 42 63 M60 32 C53 40 53 54 58 63"/>
      <path class="draw-line d2" d="M34 45 C29 55 34 64 43 64 M66 45 C71 55 66 64 57 64"/>
      <path class="draw-line d3" d="M42 18 C44 11 52 9 58 17 M47 14 C49 10 53 10 55 14"/>
      <path class="draw-line d3 dash" d="M39 56 C45 53 55 53 61 56"/>`
  },
  {
    id: "thyme", label: "тимьян / розмарин", type: "ingredient", aliases: ["тимьян", "розмарин", "thyme", "rosemary", "herbs"],
    body: `
      <path class="draw-line d1" d="M28 66 C42 44 58 26 74 12"/>
      <path class="draw-line d2" d="M39 49 C31 47 27 42 27 36 C35 37 41 41 39 49 Z M47 40 C39 35 38 29 41 24 C48 29 51 34 47 40 Z"/>
      <path class="draw-line d3" d="M56 31 C51 25 52 19 57 15 C63 22 63 27 56 31 Z M58 32 C66 31 72 35 75 41 C67 43 61 40 58 32 Z M47 42 C55 43 61 48 62 55 C54 55 48 50 47 42 Z"/>`
  },
  {
    id: "butter", label: "сливочное масло", type: "ingredient", aliases: ["сливочное масло", "butter"],
    body: `
      <path class="draw-line d1" d="M24 46 L49 29 L77 36 L52 54 Z"/>
      <path class="draw-line d2" d="M24 46 V58 L52 66 L77 48 V36 M52 54 V66"/>
      <path class="draw-line d3" d="M37 43 L62 50 M33 54 L51 59"/>`
  },
  {
    id: "olive-oil", label: "оливковое масло", type: "ingredient", aliases: ["оливковое масло", "масло для sear", "oil", "olive oil", "neutral oil"],
    body: `
      <path class="draw-line d1" d="M43 16 H57 L60 29 V63 C60 68 40 68 40 63 V29 Z"/>
      <path class="draw-line d2" d="M42 29 H58 M44 21 H56"/>
      <path class="draw-line d3" d="M50 40 C57 49 57 58 50 60 C43 58 43 49 50 40 Z"/>
      <path class="draw-line d3" d="M66 50 C74 55 74 66 66 68 C59 66 59 55 66 50 Z"/>`
  },
  {
    id: "lemon", label: "лимон", type: "ingredient", aliases: ["лимон", "lemon", "кислота"],
    body: `
      <path class="draw-line d1" d="M19 43 C29 22 55 13 76 27 C70 54 42 70 19 43 Z"/>
      <path class="draw-line d2" d="M29 43 C43 34 57 29 74 27 M40 34 L49 57 M53 29 L57 51 M62 29 L62 45"/>
      <path class="draw-line d3 dash" d="M31 49 C43 60 59 58 68 45"/>
      <circle class="grain drift a" cx="75" cy="56" r="1.5"/><circle class="grain drift b" cx="82" cy="48" r="1.2"/>`
  },
  {
    id: "paprika", label: "копчёная паприка", type: "ingredient", aliases: ["паприка", "копченая паприка", "копчёная паприка", "paprika"],
    body: `
      <path class="draw-line d1" d="M33 21 H67 L62 66 H38 Z"/>
      <path class="draw-line d2" d="M38 35 C46 31 55 31 63 35 M39 45 C48 42 54 42 61 45"/>
      <path class="draw-line d3" d="M48 16 C46 10 54 8 57 14"/>
      <circle class="grain drift a" cx="47" cy="56" r="1.5"/><circle class="grain drift b" cx="55" cy="58" r="1.2"/>`
  },
  {
    id: "tomato", label: "томат", type: "ingredient", aliases: ["томат", "помидор", "томаты", "помидоры", "томаты в собственном соку", "canned tomatoes", "tomato"],
    body: `
      <path class="draw-line d1" d="M25 45 C24 31 37 23 50 25 C62 20 77 28 78 44 C79 60 63 69 47 66 C34 64 26 57 25 45 Z"/>
      <path class="draw-line d2" d="M43 25 C46 18 55 15 62 22 M50 24 L49 14 M55 25 L66 17 M47 25 L40 18"/>
      <path class="draw-line d2 dash" d="M35 45 C45 40 60 41 70 48 M34 54 C45 58 59 58 69 52"/>
      <circle class="grain drift a" cx="38" cy="38" r="1.1"/><circle class="grain drift b" cx="63" cy="36" r="1.2"/>`
  },
  {
    id: "wine", label: "белое вино", type: "ingredient", aliases: ["вино", "белое вино", "wine"],
    body: `
      <path class="draw-line d1" d="M43 13 H61 C61 30 58 42 52 45 C46 42 43 30 43 13 Z"/>
      <path class="draw-line d2" d="M47 54 H57 M52 45 V64 M44 64 H60"/>
      <path class="draw-line d3" d="M45 30 C50 28 55 28 60 30"/>`
  },
  {
    id: "squid", label: "кальмар", type: "ingredient", aliases: ["кальмар", "squid", "lula"],
    body: `
      <path class="draw-line d1" d="M50 8 C61 9 64 23 63 39 L62 52 C61 60 55 64 50 64 C45 64 39 60 38 52 L37 39 C36 23 39 9 50 8 Z"/>
      <path class="draw-line d2" d="M39 16 C30 18 28 28 36 31 M61 16 C70 18 72 28 64 31 M45 18 C43 30 43 48 46 61 M55 18 C57 30 57 48 54 61"/>
      <path class="draw-line d3" d="M42 62 C40 68 37 71 35 75 M47 64 C46 70 44 73 42 76 M53 64 C54 70 56 73 58 76 M58 62 C60 68 63 71 65 75"/>
      <circle class="grain pulse" cx="44" cy="39" r="2.1"/><circle class="grain" cx="56" cy="39" r="1.3"/>`
  },
  {
    id: "shrimp", label: "креветка", type: "ingredient", aliases: ["креветка", "креветки", "shrimp", "prawn", "camarão", "camarao"],
    body: `
      <path class="draw-line d1" d="M29 31 C29 19 44 13 58 20 C72 27 73 43 63 52 C55 60 43 60 37 55"/>
      <path class="draw-line d2" d="M38 55 C35 52 33 48 33 45 M44 58 C41 54 40 50 40 47 M51 58 C49 54 48 50 48 47 M58 55 C56 52 55 48 55 45"/>
      <path class="draw-line d2" d="M35 25 C42 26 50 30 56 36 C61 42 63 48 62 52"/>
      <path class="draw-line d3" d="M29 31 C23 28 19 30 17 34 M58 20 C60 14 65 10 72 11 M63 52 C70 54 74 58 72 64 C69 59 66 58 62 58"/>
      <circle class="grain pulse" cx="33" cy="28" r="1.6"/>`
  },
  {
    id: "mushroom", label: "вёшенка", type: "ingredient", aliases: ["гриб", "грибы", "вешенка", "вёшенка", "шампиньон", "шампиньоны", "champignon", "champignons", "mushroom", "oyster mushroom"],
    body: `
      <path class="draw-line d1" d="M31 31 C30 17 46 11 61 15 C72 18 77 26 72 35 C63 42 42 41 31 31 Z"/>
      <path class="draw-line d2" d="M47 36 C44 47 44 59 47 68 C50 72 58 72 61 68 C60 58 57 47 55 36"/>
      <path class="draw-line d2" d="M38 34 C46 38 60 39 70 33 M43 32 C49 35 56 35 64 31"/>
      <path class="draw-line d3 dash" d="M50 39 L50 67 M55 39 L59 66 M45 39 L43 63"/>
      <circle class="grain drift a" cx="40" cy="24" r="1.1"/><circle class="grain drift b" cx="61" cy="22" r="1.2"/>`
  },
  {
    id: "potato", label: "картофель", type: "ingredient", aliases: ["картофель", "картошка", "potato"],
    body: `
      <path class="draw-line d1" d="M31 48 C25 35 35 24 50 22 C65 20 77 31 74 46 C72 60 58 69 44 65 C37 63 33 57 31 48 Z"/>
      <path class="draw-line d2 dash" d="M39 35 C45 31 55 30 63 34 M36 50 C47 45 60 47 69 53"/>
      <circle class="grain drift a" cx="43" cy="40" r="1.2"/><circle class="grain drift b" cx="57" cy="34" r="1.1"/><circle class="grain drift a" cx="60" cy="54" r="1.3"/>
      <path class="draw-line d3" d="M29 44 C22 45 19 49 20 54 M75 43 C82 43 85 47 84 52"/>`
  },
  {
    id: "onion", label: "лук репчатый", type: "ingredient", aliases: ["лук", "лук репчатый", "onion", "yellow onion"],
    body: `
      <path class="draw-line d1" d="M50 17 C64 28 72 42 68 56 C64 68 52 72 41 66 C30 60 29 45 37 32 C41 25 46 21 50 17 Z"/>
      <path class="draw-line d2" d="M50 18 C49 33 49 50 50 68 M42 27 C48 38 48 55 43 65 M58 27 C52 38 52 55 57 65"/>
      <path class="draw-line d2" d="M36 44 C43 49 57 49 66 43 M35 55 C43 60 58 60 66 54"/>
      <path class="draw-line d3" d="M45 17 C45 11 53 9 57 16 M46 68 C43 72 39 73 34 72 M54 68 C58 72 63 73 68 71"/>`
  },
  {
    id: "pot", label: "глубокая кастрюля", type: "equipment", aliases: ["кастрюля", "pot", "deep pot"],
    body: `
      <path class="draw-line d1" d="M24 34 H76 V62 C76 66 24 66 24 62 Z"/>
      <path class="draw-line d2" d="M20 36 H24 M76 36 H80 M34 28 H66 M40 25 H60"/>
      <path class="draw-line d3 dash" d="M32 42 H68 M32 52 H68"/>`
  },
  {
    id: "roner", label: "roner", type: "equipment", aliases: ["roner", "sous-vide", "sous vide", "kitchenboss", "циркулятор"],
    body: `
      <rect class="draw-line d1" x="42" y="8" width="18" height="54" rx="7"/>
      <path class="draw-line d2" d="M45 62 H57 L55 73 H47 Z M63 27 H78 V43 H63"/>
      <circle class="grain pulse" cx="51" cy="18" r="2"/><path class="draw-line d3" d="M47 29 H55 M47 36 H55 M47 43 H55"/>`
  },
  {
    id: "bag", label: "вакуумный пакет", type: "household", aliases: ["пакет", "вакуумный пакет", "bag", "zip-lock", "ziplock"],
    body: `
      <path class="draw-line d1" d="M27 14 H73 V68 H27 Z"/>
      <path class="draw-line d2 dash" d="M31 21 H69 M31 28 H69"/>
      <path class="draw-line d3" d="M36 49 C40 38 55 35 64 44 C68 55 57 62 45 58 C38 56 35 53 36 49 Z"/>`
  },
  {
    id: "weight", label: "груз", type: "household", aliases: ["груз", "ложка", "решетка", "решётка", "weight"],
    body: `
      <path class="draw-line d1" d="M38 30 C38 21 62 21 62 30 L70 62 H30 Z"/>
      <path class="draw-line d2" d="M44 30 C44 25 56 25 56 30"/>
      <path class="draw-line d3 dash" d="M39 48 H61"/>`
  },
  {
    id: "pan", label: "тяжёлая сковорода", type: "equipment", aliases: ["сковорода", "pan", " skillet", "sear"],
    body: `
      <ellipse class="draw-line d1" cx="43" cy="45" rx="25" ry="13"/>
      <path class="draw-line d2" d="M66 43 L88 32 M30 45 C36 39 50 39 58 45 M31 52 C40 57 52 57 60 52"/>
      <path class="draw-line d3 heat" d="M38 32 C32 24 43 22 38 15 M51 32 C45 24 57 22 52 15"/>`
  },
  {
    id: "vacuum-sealer", label: "вакууматор", type: "equipment", aliases: ["вакууматор", "vacuum sealer", "sealer"],
    body: `
      <path class="draw-line d1" d="M18 32 H82 V54 H18 Z"/>
      <path class="draw-line d2" d="M24 38 H57 M64 38 H75 M24 47 H76"/>
      <circle class="grain pulse" cx="70" cy="38" r="2.2"/><path class="draw-line d3" d="M31 54 L27 68 H73 L69 54"/>`
  },
  {
    id: "tongs", label: "щипцы", type: "household", aliases: ["щипцы", "tongs"],
    body: `
      <path class="draw-line d1" d="M32 13 C44 30 52 48 58 70"/>
      <path class="draw-line d2" d="M44 12 C51 32 55 49 58 70"/>
      <path class="draw-line d3" d="M24 17 L36 11 M39 12 L50 9 M53 69 C58 74 64 74 70 69 M55 61 C61 65 66 65 72 61"/>`
  },
  {
    id: "towel", label: "бумажные полотенца", type: "household", aliases: ["бумажное полотенце", "полотенца", "towel", "paper towel"],
    body: `
      <path class="draw-line d1" d="M30 13 H63 C70 13 75 18 75 25 V66 H30 Z"/>
      <path class="draw-line d2" d="M63 13 C59 20 64 27 75 25 M38 27 H65 M38 39 H66 M38 51 H63"/>
      <path class="draw-line d3 dash" d="M45 21 V63"/>`
  }
];

const VISUAL_BY_ID = Object.fromEntries(BUILTIN_VISUALS.map(v => [v.id, v]));
function cleanName(v) { return String(v || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim(); }
function escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function escapeAttr(v) { return escapeHtml(v).replace(/"/g, "&quot;"); }
function atlasCacheKeys(v) {
  return [...new Set([v.id, v.label, ...(v.aliases || [])].flatMap(x => [cleanName(x), String(x || "").trim().toLowerCase()]).filter(Boolean))];
}

export function listBuiltInVisuals() {
  return BUILTIN_VISUALS.map(({ id, label, type }) => ({ id, label, type }));
}

export function initVisualAtlas() {
  if (LS.get("visualAtlasVersion", "") === VISUAL_ATLAS_VERSION) return false;
  const metaphors = getMetaphors();
  const deleted = new Set(LS.get("deletedMetaphors", []));
  for (const visual of BUILTIN_VISUALS) {
    for (const key of atlasCacheKeys(visual)) {
      delete metaphors[key];
      deleted.add(key);
    }
  }
  LS.set("metaphors", metaphors);
  LS.set("deletedMetaphors", [...deleted]);
  LS.set("visualAtlasVersion", VISUAL_ATLAS_VERSION);
  syncToServer("refresh-visual-atlas");
  return true;
}

export function visualKey(input) {
  const raw = typeof input === "object" && input
    ? [input.id, input.artKey, input.label, input.name, input.note].filter(Boolean).join(" ")
    : String(input || "");
  const n = cleanName(raw);
  if (!n) return "";
  if (VISUAL_BY_ID[n]) return n;
  for (const v of BUILTIN_VISUALS) {
    if (v.aliases.some(a => {
      const x = cleanName(a);
      return n === x || n.includes(x);
    })) return v.id;
  }
  return "";
}

export function builtinArtMarkup(input, opts = {}) {
  const key = visualKey(input);
  const v = VISUAL_BY_ID[key];
  if (!v) return "";
  const label = opts.label || (typeof input === "object" && input ? input.label || input.name : "") || v.label;
  const extra = opts.className ? " " + opts.className : "";
  return `<svg class="symbol-art${extra}" viewBox="0 0 100 80" role="img" aria-label="${escapeAttr(label)}">${v.body}</svg>`;
}

export function builtinArtDataUrl(input) {
  const svg = builtinArtMarkup(input, { className: "as-data" });
  if (!svg) return "";
  const styled = svg.replace("<svg ", `<svg xmlns="http://www.w3.org/2000/svg" `).replace("</svg>",
    `<style>.symbol-art{color:#080808;background:#fff}.draw-line{fill:none;stroke:currentColor;stroke-width:1.45;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:220;stroke-dashoffset:220;animation:draw 1.35s ease forwards}.d2{animation-delay:.14s}.d3{animation-delay:.28s}.dash{stroke-dasharray:3 4;stroke-dashoffset:0;animation:none}.grain{fill:currentColor}.drift{animation:drift 2.8s ease-in-out infinite}.drift.b{animation-delay:.55s}.pulse{transform-origin:center;animation:pulse 2s ease-in-out infinite}.heat{stroke-dasharray:80;stroke-dashoffset:80;animation:draw 1.8s ease forwards,heat 2s ease-in-out infinite 1.8s}@keyframes draw{to{stroke-dashoffset:0}}@keyframes drift{0%,100%{transform:translate(0,0);opacity:.6}50%{transform:translate(2px,-4px);opacity:1}}@keyframes pulse{0%,100%{opacity:.35;transform:scale(.85)}50%{opacity:1;transform:scale(1.1)}}@keyframes heat{0%,100%{opacity:.35;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}</style></svg>`);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(styled)}`;
}

/* ---------- taste profile ---------- */
export async function getTaste() {
  const saved = LS.get("taste", null);
  if (saved) return saved;
  try { const d = await fetch("data/taste-profile.default.json", { cache: "no-store" }).then(r => r.json()); LS.set("taste", d); return d; }
  catch { return { language: "ru", diet_tracks: ["обычная"], loves: [], avoids: [] }; }
}
export function saveTaste(t) { LS.set("taste", t); syncToServer("save-taste"); }

/* ---------- meal library ---------- */
// built-in meals (data/meals/*.json) + user meals (localStorage)
export async function listMeals() {
  let builtin = [];
  try { builtin = (await fetch("data/meals/index.json", { cache: "no-store" }).then(r => r.json())).meals || []; } catch {}
  const user = LS.get("meals", []); // [{slug,title,sub,fig,tags,_user:true}]
  const hidden = new Set(LS.get("hiddenMeals", []));
  const seen = new Set(user.map(m => m.slug));
  return [...user, ...builtin.filter(m => !seen.has(m.slug) && !hidden.has(m.slug))];
}
export async function getMeal(slug) {
  const user = LS.get("meal:" + slug, null);
  if (user) return user;
  return fetch(`data/meals/${slug}.json`, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error("no meal"); return r.json(); });
}
export function saveUserMeal(meal) {
  const deleted = new Set(LS.get("deletedMeals", [])); deleted.delete(meal.slug); LS.set("deletedMeals", [...deleted]);
  const hidden = new Set(LS.get("hiddenMeals", [])); hidden.delete(meal.slug); LS.set("hiddenMeals", [...hidden]);
  const list = LS.get("meals", []).filter(m => m.slug !== meal.slug);
  list.unshift({
    slug: meal.slug,
    title: meal.title,
    sub: meal.sub,
    fig: meal.fig,
    tags: meal.tags || [],
    artKeys: mealArtKeys(meal),
    createdAt: new Date().toISOString(),
    _user: true,
  });
  LS.set("meals", list);
  LS.set("meal:" + meal.slug, meal);
  syncToServer("save-meal");
}
export function deleteUserMeal(slug) {
  LS.set("meals", LS.get("meals", []).filter(m => m.slug !== slug));
  const deleted = new Set(LS.get("deletedMeals", [])); deleted.add(slug); LS.set("deletedMeals", [...deleted]);
  LS.del("meal:" + slug); LS.del("progress:" + slug); LS.del("expand:" + slug); LS.del("device:" + slug);
  deleteMealEvents(slug);
  syncToServer("delete-user-meal");
}
export function deleteMeal(slug) {
  const isUser = LS.get("meals", []).some(m => m.slug === slug);
  if (isUser) deleteUserMeal(slug);
  else {
    const hidden = new Set(LS.get("hiddenMeals", []));
    hidden.add(slug);
    LS.set("hiddenMeals", [...hidden]);
    LS.del("progress:" + slug); LS.del("expand:" + slug);
    deleteMealEvents(slug);
    syncToServer("hide-builtin-meal");
  }
}
function mealArtKeys(meal) {
  return [...(meal.ingredients || []), ...(meal.equipment || [])]
    .map(i => (i.label || i.id || "").toLowerCase())
    .filter(Boolean)
    .slice(0, 6);
}

/* ---------- object library: ingredients, devices, household parts ---------- */
export function getItems() { return LS.get("items", []); }
export function saveItems(items) { LS.set("items", items); }
export function deleteItem(key) { saveItems(getItems().filter(i => i.key !== key)); syncToServer("delete-item"); }
export function upsertItem(item) {
  const name = String(item.name || item.label || item.id || "").replace(/\s+/g, " ").trim();
  if (!name) return null;
  const type = item.type || "ingredient";
  const key = item.key || `${type}:${name.toLowerCase()}`;
  const list = getItems();
  const prev = list.find(i => i.key === key);
  const touch = item.touch !== false;
  const next = {
    key,
    name,
    type,
    note: item.note || prev?.note || "",
    source: item.source || prev?.source || "manual",
    slug: item.slug || prev?.slug || "",
    fig: item.fig || prev?.fig || "",
    artKey: item.artKey || prev?.artKey || name.toLowerCase(),
    uses: (prev?.uses || 0) + (touch ? 1 : 0),
    lastSeen: touch ? new Date().toISOString() : (prev?.lastSeen || new Date().toISOString()),
  };
  saveItems([next, ...list.filter(i => i.key !== key)].slice(0, 240));
  syncToServer("upsert-item");
  return next;
}
export function rememberMealItems(meal, source = "meal", touch = true) {
  (meal.ingredients || []).forEach(i => upsertItem({
    type: "ingredient",
    name: i.label || i.id,
    note: i.note || "",
    slug: meal.slug,
    fig: meal.fig,
    source,
    touch,
    artKey: (i.label || i.id || "").toLowerCase(),
  }));
  (meal.equipment || []).forEach(i => upsertItem({
    type: /roner|вакуум|кастрюл|сковород|контейнер|пакет|груз|ложк|решёт/i.test(`${i.id} ${i.label}`) ? "household" : "equipment",
    name: i.label || i.id,
    note: i.note || "",
    slug: meal.slug,
    fig: meal.fig,
    source,
    touch,
    artKey: (i.label || i.id || "").toLowerCase(),
  }));
}
export function rememberRecognizedItems(items = [], source = "camera") {
  items.forEach(i => upsertItem({
    type: i.type || "ingredient",
    name: i.label || i.name,
    note: i.confidence ? `conf ${Math.round(Number(i.confidence) * 100)}%` : "",
    source,
  }));
}

/* ---------- meal tracking ---------- */
export function getMealEvents() { return LS.get("mealEvents", []); }
export function recordMealEvent(event = {}) {
  const slug = String(event.slug || "").trim();
  if (!slug) return null;
  const next = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    kind: event.kind || "event",
    slug,
    title: event.title || slug,
    fig: event.fig || "",
    progress: event.progress || "",
    note: event.note || "",
    track: event.track || "",
  };
  LS.set("mealEvents", [next, ...getMealEvents()].slice(0, 500));
  syncToServer("record-meal-event");
  return next;
}
export function deleteMealEvents(slug) {
  LS.set("mealEvents", getMealEvents().filter(e => e.slug !== slug));
  syncToServer("delete-meal-events");
}
export function mealHistorySummary(limit = 12) {
  const bySlug = new Map();
  for (const e of getMealEvents()) {
    if (!bySlug.has(e.slug)) bySlug.set(e.slug, { ...e, count: 0, events: [] });
    const row = bySlug.get(e.slug);
    row.count++;
    if (row.events.length < 4) row.events.push(e);
  }
  return [...bySlug.values()].slice(0, limit);
}

export async function getEquipmentSystem() {
  try { return await fetch("data/equipment.json", { cache: "no-store" }).then(r => r.json()); }
  catch { return { categories: [], deviceStory: null }; }
}

export async function getKnowledgeBase() {
  try { return await fetch("data/knowledge-base.json", { cache: "no-store" }).then(r => r.json()); }
  catch { return { principles: [], sourceMap: [], server: {}, hermes: {} }; }
}

/* ---------- compact browser context for Mise / Hermes ---------- */
export async function clientContext(extra = {}) {
  const [taste, meals, equipmentSystem, knowledgeBase] = await Promise.all([
    getTaste(),
    listMeals(),
    getEquipmentSystem(),
    getKnowledgeBase(),
  ]);
  return {
    app: "FoodOS",
    version: "v3.3",
    url: location.href,
    taste,
    meals: meals.slice(0, 18).map(m => ({
      slug: m.slug, title: m.title, sub: m.sub, fig: m.fig, tags: m.tags || [], user: !!m._user,
    })),
    equipmentSystem: {
      deviceStory: equipmentSystem.deviceStory || null,
      categories: (equipmentSystem.categories || []).map(c => ({
        id: c.id, label: c.label, summary: c.summary,
        items: (c.items || []).slice(0, 12).map(i => ({
          id: i.id, label: i.label, status: i.status, role: i.role, note: i.note,
        })),
      })),
    },
    knowledgeBase: {
      version: knowledgeBase.version || "",
      principles: (knowledgeBase.principles || []).slice(0, 8),
      sourceMap: (knowledgeBase.sourceMap || []).slice(0, 12).map(s => ({
        id: s.id, label: s.label, kind: s.kind, summary: s.summary, storage: s.storage,
      })),
      server: knowledgeBase.server || {},
      hermes: knowledgeBase.hermes || {},
    },
    items: getItems().slice(0, 80).map(i => ({
      name: i.name, type: i.type, note: i.note, source: i.source, slug: i.slug, uses: i.uses,
      visual: visualKey(i) || "",
    })),
    metaphorNames: Object.keys(getMetaphors()).slice(0, 80),
    mealHistory: mealHistorySummary(10).map(e => ({
      slug: e.slug, title: e.title, fig: e.fig, kind: e.kind, at: e.at,
      progress: e.progress, count: e.count,
    })),
    builtInVisuals: listBuiltInVisuals(),
    ...extra,
  };
}

/* ---------- progress (per meal) ---------- */
export function getProgress(slug) { return new Set(LS.get("progress:" + slug, [])); }
export function saveProgress(slug, set) { LS.set("progress:" + slug, [...set]); syncToServer("save-progress"); }

/* ---------- manual device bridge ---------- */
export function getDeviceState(slug) { return LS.get("device:" + slug, null); }
export function saveDeviceState(slug, state) { LS.set("device:" + slug, state); }

/* ---------- expanded substeps (AI per-step) ---------- */
export function getExpands(slug) { return LS.get("expand:" + slug, {}); }
export function saveExpand(slug, stepId, text) { const e = getExpands(slug); e[stepId] = text; LS.set("expand:" + slug, e); syncToServer("save-expand"); }

/* ---------- metaphor library (drawn ingredient line-art) ---------- */
// shared across all meals — a growing visual dictionary
let lastDrawInfo = { mode: "idle", reason: "" };
export function getLastDrawInfo() { return lastDrawInfo; }
export function getMetaphors() { return LS.get("metaphors", {}); } // { name: dataURL }
export function saveMetaphor(name, dataURL) {
  const key = name.trim().toLowerCase();
  const deleted = new Set(LS.get("deletedMetaphors", [])); deleted.delete(key); LS.set("deletedMetaphors", [...deleted]);
  const m = getMetaphors(); m[key] = dataURL; LS.set("metaphors", m);
  syncToServer("save-metaphor");
}
export function deleteMetaphor(name) {
  const key = name.trim().toLowerCase();
  const m = getMetaphors(); delete m[key]; LS.set("metaphors", m);
  const deleted = new Set(LS.get("deletedMetaphors", [])); deleted.add(key); LS.set("deletedMetaphors", [...deleted]);
  syncToServer("delete-metaphor");
}

export async function drawMetaphor(name) {
  const lib = getMetaphors();
  const raw = String(name || "").trim();
  const key = cleanName(raw);
  if (!key) throw new Error("no ingredient");
  const atlasKey = visualKey(raw) || visualKey(key);
  const atlas = atlasKey ? builtinArtDataUrl(atlasKey) : "";
  if (atlas) {
    lastDrawInfo = { mode: "atlas", reason: VISUAL_ATLAS_VERSION };
    if (lib[atlasKey] !== atlas) saveMetaphor(atlasKey, atlas);
    if (atlasKey !== key && lib[key] !== atlas) saveMetaphor(key, atlas);
    return atlas;
  }
  if (lib[key]) return lib[key];
  try {
    const { image, model } = await FN("draw", { ingredient: key });
    if (!image) throw new Error("пустой ответ");
    lastDrawInfo = { mode: "ai", reason: model || "openrouter" };
    saveMetaphor(key, image);
    return image;
  } catch (e) {
    const msg = String(e.message || e);
    if (/локально функция draw|функция draw недоступна|OPENROUTER_API_KEY not set/i.test(msg)) {
      const sketch = builtinArtDataUrl(key) || localMetaphor(key);
      lastDrawInfo = { mode: "local", reason: msg };
      saveMetaphor(key, sketch);
      return sketch;
    }
    throw e;
  }
}

function localMetaphor(name) {
  const h = Math.abs(hash(name));
  const a = 16 + (h % 18), b = 30 + (h % 24), c = 58 + (h % 20);
  const flip = h % 2 ? 1 : -1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <rect width="160" height="160" fill="#fff"/>
    <g fill="none" stroke="#080808" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M80 18 C${80 + flip * a} 38 ${80 - flip * b} 56 80 78 C${80 + flip * c} 104 ${80 - flip * a} 120 80 142"/>
      <path d="M42 92 C58 ${48 + a} 106 ${48 + b} 122 92"/>
      <path d="M50 68 C70 ${40 + a} 92 ${40 + b} 112 68"/>
      <path d="M54 116 C70 104 94 104 108 116"/>
      <circle cx="${46 + (h % 18)}" cy="${42 + (h % 20)}" r="${5 + (h % 5)}"/>
      <circle cx="${103 + (h % 20)}" cy="${36 + (h % 16)}" r="${4 + (h % 6)}"/>
      <path d="M28 28 H52 M108 132 H134 M28 132 H44 M118 28 H132"/>
    </g>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function hash(s){let h=0;for(let i=0;i<s.length;i++){h=(h<<5)-h+s.charCodeAt(i)|0;}return h;}

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

export const esc = escapeHtml;
