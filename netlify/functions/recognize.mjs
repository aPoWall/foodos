// foodos · recognize — camera frame → ingredients with bounding boxes.
// Cloud vision via OpenRouter (Gemini 2.5 Flash). Key only in Netlify env.
// Returns: { items:[{label, conf, box:[x,y,w,h] in 0..1}], dish, note }

const MODEL = "google/gemini-2.5-flash";

const SYSTEM =
  "Ты система компьютерного зрения для кухни. На фото — продукты/ингредиенты или блюдо в процессе. " +
  "Верни СТРОГО JSON без markdown: " +
  '{"items":[{"label":"<ингредиент по-русски, строчными>","conf":<0..1>,"box":[x,y,w,h]}],"dish":"<если это готовящееся блюдо — что это, иначе пустая строка>","note":"<очень кратко что видишь, без инструкций по готовке>"}. ' +
  "box — нормализованные координаты 0..1 (x,y — левый верхний угол, w,h — ширина/высота). " +
  "Максимум 6 главных объектов. НЕ давай советов по готовке. Только распознавание.";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return json({ error: "OPENROUTER_API_KEY not set on site" }, 500);

  let image = "";
  try { image = (await req.json()).image || ""; } catch {}
  if (!image.startsWith("data:image")) return json({ error: "no image" }, 400);

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
          { role: "user", content: [
            { type: "text", text: "распознай продукты на фото, верни JSON." },
            { type: "image_url", image_url: { url: image } },
          ] },
        ],
        max_tokens: 600,
        response_format: { type: "json_object" },
      }),
    });
    const data = await r.json();
    if (!r.ok) return json({ error: data?.error?.message || `openrouter ${r.status}` }, 502);
    let raw = data?.choices?.[0]?.message?.content?.trim() || "{}";
    raw = raw.replace(/^```json\s*/i, "").replace(/```$/,"").trim();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = { items: [], dish: "", note: raw.slice(0, 140) }; }
    parsed.items = Array.isArray(parsed.items) ? parsed.items.slice(0, 6) : [];
    return json({ ...parsed, model: data.model || MODEL });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
