// foodos · advise — cooking advice during the process via OpenRouter.
// mode "text"  → step-aware recommendation
// mode "vision"→ judge a captured pan/dish photo and advise

const MODEL = "google/gemini-2.5-flash";

const SYSTEM =
  "Ты лаконичный шеф-повар у плиты. Отвечай ТОЛЬКО по-русски, строчными буквами, " +
  "1–3 коротких предложения, конкретно и по делу, без воды и без вступлений. " +
  "Помни правило кальмара: либо <3 мин, либо >30 мин тушения; фаршированные тушки — только долго.";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return json({ error: "OPENROUTER_API_KEY not set on site" }, 500);

  let body = {};
  try { body = await req.json(); } catch {}
  const mode = body.mode === "vision" ? "vision" : "text";
  const context = String(body.context || "").slice(0, 1200);
  const step = String(body.step || "").slice(0, 200);

  let userContent;
  if (mode === "vision") {
    const image = String(body.image || "");
    if (!image.startsWith("data:image")) return json({ error: "no image" }, 400);
    userContent = [
      { type: "text", text: `${context}\nшаг: ${step}\nоцени по фото готовность и что поправить.` },
      { type: "image_url", image_url: { url: image } },
    ];
  } else {
    userContent = `${context}\nдай один практичный совет по текущему шагу: ${step}`;
  }

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
        max_tokens: 220,
      }),
    });
    const data = await r.json();
    if (!r.ok) return json({ error: data?.error?.message || `openrouter ${r.status}` }, 502);
    const advice = data?.choices?.[0]?.message?.content?.trim();
    if (!advice) return json({ error: "empty advice" }, 502);
    return json({ advice, model: data.model || MODEL });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
