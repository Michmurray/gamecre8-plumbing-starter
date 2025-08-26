// api/generatr.js
// Simple AI generator. If OpenAI fails or no key, falls back to rules.

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  // 1) No key? Always succeed with fallback.
  if (!process.env.OPENAI_API_KEY) {
    return res.status(200).json({ engine: "fallback:no_key", ...fallbackGame(prompt) });
  }

  try {
    // 2) Ask the model for a pure JSON game spec (no extra text)
    const sys = `Return ONLY JSON for this schema:
{
  "version": 2,
  "prompt": string,
  "canvas": { "width": number, "height": number, "background": string },
  "player": { "spriteUrl": string|null, "x": number, "y": number, "w": number, "h": number, "speed": number, "jump": number, "gravity": number },
  "groundY": number,
  "assets": { "backgroundUrl": string|null },
  "rules": { "lives": number, "levelUpEvery": number }
}
Keep it sensible. If you don't know a URL to use, set null.`;

    const user = `Make a tiny arcade game for this idea: "${prompt}".
- Size near 800x450.
- If theme is space/galaxy, prefer a dark background color.
- Use short numbers; keep it playable.
Return ONLY the JSON object — no backticks, no prose.`;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.5,
        messages: [{ role: "system", content: sys }, { role: "user", content: user }]
      })
    });

    const data = await aiRes.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() || "";
    // Extract the first {...} block in case the model added anything
    const jsonText = (raw.match(/\{[\s\S]*\}/) || [raw])[0];

    const game = JSON.parse(jsonText);
    const normalized = normalizeGame(game, prompt);
    return res.status(200).json({ engine: "openai", ...normalized });

  } catch (err) {
    console.error("generatr AI error:", err?.message || err);
    // 3) Fail safe with fallback so UX never breaks
    return res.status(200).json({ engine: "fallback:error", ...fallbackGame(prompt) });
  }
}

/* -------- helpers -------- */

function normalizeGame(g, prompt) {
  const spriteUrl = g?.player?.spriteUrl ?? process.env.DEFAULT_SPRITE_URL ?? null;
  const bgColor = g?.canvas?.background ?? "#0b0f2a";
  return {
    version: 2,
    prompt,
    canvas: { width: g?.canvas?.width ?? 800, height: g?.canvas?.height ?? 450, background: bgColor },
    player: {
      spriteUrl,
      x: g?.player?.x ?? 80, y: g?.player?.y ?? 360,
      w: g?.player?.w ?? 64, h: g?.player?.h ?? 64,
      speed: g?.player?.speed ?? 3, jump: g?.player?.jump ?? 12, gravity: g?.player?.gravity ?? 0.6
    },
    groundY: g?.groundY ?? 400,
    assets: { backgroundUrl: g?.assets?.backgroundUrl ?? (process.env.DEFAULT_BG_URL || null) },
    rules: { lives: g?.rules?.lives ?? 3, levelUpEvery: g?.rules?.levelUpEvery ?? 6 }
  };
}

function fallbackGame(prompt) {
  const speed = /fast|speedy|quick/i.test(prompt) ? 5 : /slow|calm/i.test(prompt) ? 2 : 3;
  const bg =
    /space|galaxy|star/i.test(prompt) ? "#0b0f2a" :
    /lava|volcano|fire/i.test(prompt) ? "#2a0b0b" :
    /cloud|sky|unicorn/i.test(prompt) ? "#e9f3ff" :
    "#0b0f2a";

  return {
    version: 2,
    prompt,
    canvas: { width: 800, height: 450, background: bg },
    player: {
      spriteUrl: process.env.DEFAULT_SPRITE_URL || null,
      x: 80, y: 360, w: 64, h: 64, speed, jump: 12, gravity: 0.6
    },
    groundY: 400,
    assets: { backgroundUrl: process.env.DEFAULT_BG_URL || null },
    rules: { lives: 3, levelUpEvery: 6 }
  };
}
