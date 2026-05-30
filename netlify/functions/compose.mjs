// foodos · compose — {context} (+ optional photo) + taste profile → full meal JSON.
// The generic engine renders whatever this returns. Cloud LLM via OpenRouter.

const MODEL = "google/gemini-2.5-flash";

const SCHEMA = `{
  "slug": "<kebab-case-латиницей>",
  "title": "<название блюда, можно с оригинальным именем>",
  "sub": "<короткий подзаголовок · дорожки>",
  "fig": "fig.NN",
  "servings": "<напр. 3–4>",
  "active": "<напр. ~40м>",
  "total": "<напр. ~1ч>",
  "tracks": { "a": {"label":"<напр. мясо/море>","glyph":"◆","key":"a"}, "b": {"label":"веган","glyph":"◇","key":"b"} },
  "ingredients": [ {"id":"<англ. id для отрисовки: squid, shrimp, mushroom...>","label":"<по-русски>"} ],
  "axioms": [ "<кулинарный принцип строчными, можно <b>выделить</b>>" ],
  "steps": [
    {"id":"s1","t":"shared","ttl":"<phase · короткий титул>","time":<секунды или опусти>,"lead":"<что делать>","tip":"<опц. подсказка>"},
    {"id":"split","t":"split"},
    {"id":"a1","t":"a","ttl":"...","lead":"..."},
    {"id":"b1","t":"b","ttl":"...","lead":"..."}
  ]
}`;

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return json({ error: "OPENROUTER_API_KEY not set on site" }, 500);

  let body = {};
  try { body = await req.json(); } catch {}
  const context = String(body.context || "").slice(0, 2000);
  const taste = body.taste ? JSON.stringify(body.taste).slice(0, 1500) : "{}";
  const image = String(body.image || "");
  if (!context && !image.startsWith("data:image"))
    return json({ error: "no context and no image" }, 400);

  const SYSTEM =
    "Ты шеф-повар и проектировщик рецептов. По описанию (и/или фото продуктов) и вкусовому профилю пользователя " +
    "спроектируй блюдо как СТРОГО валидный JSON по схеме ниже, без markdown, без комментариев.\n" +
    "Правила:\n" +
    "— весь текст внутри по-русски, строчными буквами;\n" +
    "— если пользователь держит 2 диеты (есть always_vegan_track) — спроектируй ОБЩУЮ базу + ОДНУ точку разделения {\"t\":\"split\"} + две дорожки a/b. Иначе дорожки можно опустить (все шаги t:\"shared\").\n" +
    "— реальный рецепт под состояние продукта (сырое/фарш/заморозка);\n" +
    "— 6–14 шагов, у времязависимых ставь time в секундах;\n" +
    "— ingredients: 3–6 главных, id латиницей для отрисовки;\n" +
    "— учитывай loves/avoids/spice/constraints из профиля;\n" +
    "— НЕ добавляй поля вне схемы.\n\nСХЕМА:\n" + SCHEMA;

  const userText = `вкусовой профиль пользователя: ${taste}\n\nзапрос/контекст блюда: ${context || "(см. фото продуктов)"}\n\nверни ТОЛЬКО JSON блюда.`;
  const userContent = image.startsWith("data:image")
    ? [ { type: "text", text: userText }, { type: "image_url", image_url: { url: image } } ]
    : userText;

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://foodos-lula-camarao.netlify.app",
        "X-Title": "foodos",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userContent },
        ],
        max_tokens: 2200,
        response_format: { type: "json_object" },
      }),
    });
    const data = await r.json();
    if (!r.ok) return json({ error: data?.error?.message || `openrouter ${r.status}` }, 502);
    let raw = data?.choices?.[0]?.message?.content?.trim() || "{}";
    raw = raw.replace(/^```json\s*/i, "").replace(/```$/,"").trim();
    let meal;
    try { meal = JSON.parse(raw); } catch (e) { return json({ error: "model returned non-JSON", raw: raw.slice(0, 300) }, 502); }
    meal = normalize(meal);
    return json({ meal, model: data.model || MODEL });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
};

// guard the shape so the engine never crashes on a malformed meal
function normalize(m) {
  m = m && typeof m === "object" ? m : {};
  m.slug = String(m.slug || "dish-" + Math.abs(hash(m.title || "x")) % 100000).replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  m.title = String(m.title || "новое блюдо");
  m.sub = String(m.sub || "");
  m.fig = String(m.fig || "fig.··");
  m.servings = String(m.servings || "2–4");
  m.active = String(m.active || "");
  m.total = String(m.total || "");
  if (!m.tracks || typeof m.tracks !== "object") m.tracks = null;
  m.ingredients = Array.isArray(m.ingredients) ? m.ingredients.slice(0, 8).map((x, i) => ({
    id: String(x.id || x.label || ("ing" + i)).replace(/[^a-z0-9]/gi, "").toLowerCase() || ("ing" + i),
    label: String(x.label || x.id || "ингредиент"),
  })) : [];
  m.axioms = Array.isArray(m.axioms) ? m.axioms.slice(0, 8).map(String) : [];
  m.steps = Array.isArray(m.steps) ? m.steps.filter(s => s && (s.t === "split" || s.lead)).map((s, i) => ({
    id: String(s.id || ("st" + i)),
    t: ["shared", "split", "a", "b"].includes(s.t) ? s.t : "shared",
    ttl: String(s.ttl || ""),
    lead: s.t === "split" ? "" : String(s.lead || ""),
    ...(typeof s.time === "number" && s.time > 0 ? { time: Math.min(s.time, 7200) } : {}),
    ...(s.tip ? { tip: String(s.tip) } : {}),
  })) : [];
  return m;
}
function hash(s){let h=0;for(let i=0;i<s.length;i++){h=(h<<5)-h+s.charCodeAt(i)|0;}return h;}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
