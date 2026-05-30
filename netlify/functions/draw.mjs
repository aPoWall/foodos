// foodos · draw — live ingredient line-art via OpenRouter (Nano Banana).
// Key lives ONLY in Netlify env (OPENROUTER_API_KEY). Browser never sees it.

const MODEL = "google/gemini-2.5-flash-image";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return json({ error: "OPENROUTER_API_KEY not set on site" }, 500);

  let ingredient = "";
  try { ingredient = (await req.json()).ingredient || ""; } catch {}
  ingredient = String(ingredient).slice(0, 80).trim();
  if (!ingredient) return json({ error: "no ingredient" }, 400);

  const prompt =
    `Black and white technical patent drawing of ${ingredient}. ` +
    `Single continuous line-art illustration, thin clean ink strokes on a pure white background, ` +
    `vintage engraving / blueprint / patent-figure style, no shading, no halftone, no color, ` +
    `no text, no labels, no background scene, centered subject, minimal, ` +
    `monospace technical-manual aesthetic.`;

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
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
        image_config: { aspect_ratio: "1:1", image_size: "1K" },
      }),
    });
    const data = await r.json();
    if (!r.ok) return json({ error: data?.error?.message || `openrouter ${r.status}` }, 502);
    const img = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!img) return json({ error: "no image in response" }, 502);
    return json({ image: img, model: data.model || MODEL });
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
