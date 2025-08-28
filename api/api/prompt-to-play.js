// api/prompt-to-play.js
// One-stop "prompt → play": queues the prompt, runs the generator,
// and (optionally) redirects you to the game's play.html.
// No manual manifest step required.
//
// Usage:
//   /api/prompt-to-play?prompt=pastel%20cloud%20jumper&redirect=1

import { createClient } from "@supabase/supabase-js";

const BUCKET = "game-assets";
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false }
});

export default async function handler(req, res) {
  try {
    const prompt = (req.query.prompt || "").toString().trim();
    if (!prompt) {
      return res.status(400).json({ ok: false, error: "Provide ?prompt=your%20idea" });
    }

    // Optional quick scan so the generator knows what exists.
    let counts = null;
    try {
      const sprites = await list("Spritesheet");
      const backgrounds = await list("Backgrounds");
      counts = { sprites: sprites.length, backgrounds: backgrounds.length };
      global._ASSET_MANIFEST = {
        generatedAt: new Date().toISOString(),
        sprites: sprites.map((n) => ({ name: n, url: `Spritesheet/${n}` })),
        backgrounds: backgrounds.map((n) => ({ name: n, url: `Backgrounds/${n}` }))
      };
    } catch (_) {}

    const site = process.env.PUBLIC_SITE_URL || `https://${req.headers.host}`;

    // 1) Queue the prompt
    const qRes = await safeJsonFetch(`${site}/api/queue-prompt?prompt=${encodeURIComponent(prompt)}`);

    // 2) Run the queue now
    const rRes = await safeJsonFetch(`${site}/api/run-queue`);

    // Extract first slug if present
    const slug =
      (rRes && (rRes.slug || (Array.isArray(rRes.slugs) && rRes.slugs[0]))) ||
      (qRes && qRes.slug) ||
      null;

    const playUrl = slug ? `${site}/play.html?slug=${encodeURIComponent(slug)}` : null;

    if (req.query.redirect === "1" && playUrl) {
      res.writeHead(302, { Location: playUrl });
      return res.end();
    }

    return res.status(200).json({
      ok: true,
      prompt,
      counts,
      queued: qRes,
      run: rRes,
      slug,
      playUrl
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}

async function list(prefix) {
  const { data, error } = await db.storage.from(BUCKET).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" }
  });
  if (error || !data) return [];
  return data.filter((x) => !x.id).map((x) => x.name);
}

async function safeJsonFetch(url) {
  try {
    const r = await fetch(url);
    return await r.json();
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
