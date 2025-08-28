// api/generatr.js
import { createClient } from "@supabase/supabase-js";
import { buildManifest, pickBest } from "./_assets";

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false }
});

export default async function handler(req, res) {
  try {
    const { prompt: bodyPrompt } = await readJson(req);
    const prompt = (bodyPrompt || req.query.prompt || "").toString().trim();
    if (!prompt) {
      return res.status(400).json({ ok: false, error: "Missing prompt" });
    }

    // 1) Build manifest (sprites/backgrounds with tags)
    const manifest = await buildManifest();

    // 2) Get desired tags from prompt via AI (or heuristics)
    const want = await extractTags(prompt);

    // 3) Pick assets by tag-match
    const sprite = pickBest(manifest.sprites, want.all);
    const bg     = pickBest(manifest.backgrounds, want.all);
    if (!sprite) return res.status(400).json({ ok: false, error: "No sprites found. Put PNGs in game-assets/Spritesheet/" });

    // 4) Build a minimal game-config JSON
    const game = {
      version: 1,
      prompt,
      canvas: { width: 800, height: 450, background: want.bgColor || "#0b0f2a" },
      player: {
        spriteUrl: publicUrl(sprite.url),
        x: 80, y: 360, w: 64, h: 64,
        vx: 0, vy: 0, speed: 5, jump: 12, gravity: 0.6
      },
      backgroundUrl: bg ? publicUrl(bg.url) : null,
      groundY: 400
    };

    // 5) Save to DB (games)
    const slug = nanoid();
    const { error } = await db.from("games").insert([{
      prompt,
      game_json: game,
      share_slug: slug
    }]);
    if (error) return res.status(500).json({ ok: false, error: error.message || String(error) });

    return res.status(200).json({ ok: true, slug, game });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}

function nanoid(n = 12) {
  const s = "abcdefghjkmnpqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < n; i++) out += s[(Math.random() * s.length) | 0];
  return out;
}

function publicUrl(path) {
  // Your play page already uses signed/public serving; for public buckets we can serve via
  // /storage/v1/object/public/<bucket>/<path>
  const base = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/game-assets/${path}`;
}

async function readJson(req) {
  try {
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Use OpenAI to turn a prompt into tags; fallback to heuristics if no key. */
async function extractTags(prompt) {
  const want = { all: [], bgColor: "#0b0f2a" };

  // Quick heuristics first
  const p = prompt.toLowerCase();
  const base = new Set();
  if (/\b(space|galaxy|star|nebula|planet)\b/.test(p)) {
    base.add("space"); base.add("star"); base.add("ship");
    want.bgColor = "#0b0f2a";
  }
  if (/\bforest|jungle|green\b/.test(p)) { base.add("forest"); base.add("tree"); want.bgColor = "#204a24"; }
  if (/\bdesert|sand\b/.test(p)) { base.add("desert"); base.add("sand"); want.bgColor = "#c2a25a"; }
  if (/\b1bit|1-bit|monochrome|retro\b/.test(p)) { base.add("1bit"); base.add("retro"); }

  // Try OpenAI if available for richer tags
  const key = process.env.OPENAI_API_KEY;
  if (key) {
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You output JSON with tags for sprite/background selection." },
            { role: "user", content:
              `Prompt: ${prompt}\n` +
              `Respond JSON: {"tags":["..."],"bgColor":"#rrggbb"}` }
          ],
          temperature: 0.2,
          response_format: { type: "json_object" }
        })
      });
      const j = await r.json();
      const txt = j?.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(txt);
      const tags = Array.isArray(parsed.tags) ? parsed.tags : [];
      tags.forEach(t => base.add(String(t).toLowerCase().replace(/[^a-z0-9]/g, "")));
      if (parsed.bgColor && /^#?[0-9a-f]{6}$/i.test(parsed.bgColor)) {
        want.bgColor = parsed.bgColor.startsWith("#") ? parsed.bgColor : ("#" + parsed.bgColor);
      }
    } catch (_) {
      // ignore and use heuristics only
    }
  }

  want.all = Array.from(base).filter(Boolean);
  if (!want.all.length) want.all = p.split(/[^a-z0-9]+/g).filter(Boolean);
  return want;
}
