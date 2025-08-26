// api/generatr.js
export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });

    const spriteUrl = process.env.DEFAULT_SPRITE_URL || null;

    const speed =
      /fast|speedy|quick/i.test(prompt) ? 5 :
      /slow|calm/i.test(prompt) ? 2 : 3;

    const bg =
      /space|galaxy|star/i.test(prompt) ? "#0b0f2a" :
      /lava|volcano|fire/i.test(prompt) ? "#2a0b0b" :
      /cloud|sky|unicorn/i.test(prompt) ? "#e9f3ff" :
      "#f7f7ff";

    const game = {
      version: 1,
      prompt,
      canvas: { width: 800, height: 450, background: bg },
      player: {
        spriteUrl, x: 80, y: 360, w: 64, h: 64,
        vx: 0, vy: 0, speed, jump: 12, gravity: 0.6
      },
      groundY: 400
    };

    return res.status(200).json(game);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
