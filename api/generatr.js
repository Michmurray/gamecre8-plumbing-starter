// api/generate.js
import { createClient } from "@supabase/supabase-js";
import { buildManifest, pickBest } from "./_assets";
import { v4 as uuidv4 } from "uuid";

// Supabase client
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false }
});

// Helper to read JSON body
async function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Dummy tag extractor (replace with LLM or heuristic)
async function extractTags(prompt) {
  const lower = prompt.toLowerCase();
  const tags = [];
  if (lower.includes("ninja")) tags.push("ninja");
  if (lower.includes("lava")) tags.push("lava");
  if (lower.includes("cloud")) tags.push("cloud");
  return { all: tags };
}

export default async function handler(req, res) {
  try {
    const { prompt: bodyPrompt } = await readJson(req);
    const prompt = (bodyPrompt || req.query.prompt || "").toString().trim();
    if (!prompt) {
      return res.status(400).json({ ok: false, error: "Missing prompt" });
    }

    // 1) Build manifest (sprites/backgrounds with tags)
    const manifest = await buildManifest();

    // 2) Extract tags from prompt
    const want = await extractTags(prompt);

    // 3) Pick assets by tag-match
    const sprite = pickBest(manifest.sprites, want.all);
    const bg = pickBest(manifest.backgrounds, want.all);

    if (!sprite || !bg) {
      return res.status(400).json({ ok: false, error: "Missing assets. Check Supabase Storage paths." });
    }

    // 4) Generate signed URLs
    const spriteUrl = await db.storage.from(process.env.SUPABASE_BUCKET)
      .createSignedUrl(sprite.path, 3600);
    const bgUrl = await db.storage.from(process.env.SUPABASE_BUCKET)
      .createSignedUrl(bg.path, 3600);

    if (!spriteUrl.data || !bgUrl.data) {
      return res.status(500).json({ ok: false, error: "Failed to generate signed URLs." });
    }

    // 5) Build game JSON
    const game_json = {
      version: 1,
      title: prompt,
      sprite: spriteUrl.data.signedUrl,
      background: bgUrl.data.signedUrl,
      physics: { gravity: 9.8 },
      win: "collect all coins",
      lose: "fall in lava"
    };

    // 6) Create slug and insert into DB
    const slug = uuidv4();
    const { error } = await db.from("games").insert([{
      slug,
      prompt,
      game_json,
      status: "ready"
    }]);

    if (error) {
      return res.status(500).json({ ok: false, error: "Failed to write to Supabase." });
    }

    // 7) Return slug
    return res.status(200).json({ ok: true, slug });

  } catch (err) {
    console.error("Error in /api/generate:", err);
    return res.status(500).json({ ok: false, error: "Internal server error." });
  }
}
