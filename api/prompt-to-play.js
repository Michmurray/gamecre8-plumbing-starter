// api/prompt-to-play.js
// One-stop "prompt → play": scans storage, queues the prompt, runs the queue,
// and optionally redirects to the playable game.
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

    // === 1) RECURSIVE SCAN OF STORAGE (Spritesheet/** and Backgrounds/**)
    let counts = null;
    try {
      const spriteFiles = await listRecursive("Spritesheet");
      const bgFiles     = await listRecursive("Backgrounds");

      counts = { sprites: spriteFiles.length, backgrounds: bgFiles.length };

      // Cache a simple manifest for the current lambda instance
      global._ASSET_MANIFEST = {
        generatedAt: new Date().toISOString(),
        sprites: spriteFiles.map((p) => ({ name: basename(p), url: p })),
        backgrounds: bgFiles.map((p) => ({ name: basename(p), url: p }))
      };
    } catch (scanErr) {
      // non-fatal; we still try to queue
      counts = { sprites: 0, backgrounds: 0, warn: String(scanErr) };
    }

    // Where to call sub-endpoints
    const site = process.env.PUBLIC_SITE_URL || `https://${req.headers.host}`;

    // === 2) QUEUE THE PROMPT
    const qUrl = `${site}/api/queue-prompt?prompt=${encodeURIComponent(prompt)}`;
    const queued = await safeFetchJson(qUrl);

    // If we didn't get JSON, include the raw text so we can see why
    if (queued._raw && !queued.ok) {
      return res.status(200).json({
        ok: false,
        step: "queue-prompt",
        info: "queue-prompt did not return JSON",
        prompt,
        counts,
        queued
      });
    }

    // === 3) RUN THE QUEUE NOW
    const run = await safeFetchJson(`${site}/api/run-queue`);

    // Extract first slug if present
    const slug =
      (run && (run.slug || (Array.isArray(run.slugs) && run.slugs[0]))) ||
      (queued && queued.slug) ||
      null;

    const playUrl = slug ? `${site}/play.html?slug=${encodeURIComponent(slug)}` : null;

    // === 4) OPTIONAL REDIRECT
    if (req.query.redirect === "1" && playUrl) {
      res.writeHead(302, { Location: playUrl });
      return res.end();
    }

    return res.status(200).json({
      ok: !!slug,
      prompt,
      counts,
      queued,
      run,
      slug,
      playUrl
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}

function basename(p) {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

async function listRecursive(prefix) {
  // Returns paths like "Spritesheet/foo.png" including nested folders
  const results = [];
  await walk(prefix, results);
  return results.filter((p) => /\.(png|jpg|jpeg|gif|webp)$/i.test(p));
}

async function walk(prefix, out) {
  const { data, error } = await db.storage.from(BUCKET).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" }
  });
  if (error || !data) return;
  for (const item of data) {
    // Supabase "list" returns both files and "folders" (with null/empty metadata.size)
    const isFolder = !item.metadata || typeof item.metadata.size !== "number";
    if (isFolder) {
      // Recurse into subfolder: prefix + "/" + item.name
      await walk(`${prefix}/${item.name}`, out);
    } else {
      out.push(`${prefix}/${item.name}`);
    }
  }
}

async function safeFetchJson(url) {
  try {
    const r = await fetch(url);
    const ct = r.headers.get("content-type") || "";
    if (/application\/json/i.test(ct)) {
      return await r.json();
    }
    const text = await r.text();
    try {
      return JSON.parse(text); // maybe still JSON
    } catch {
      return { ok: false, status: r.status, _raw: text.slice(0, 500) };
    }
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
