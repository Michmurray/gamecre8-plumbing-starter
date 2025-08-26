// api/auto-enqueue.js
// Pull prompts.json from Supabase Storage and enqueue new prompts automatically.

import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } }
);

const BUCKET = "game-assets";
const PROMPTS_FILE = "prompts.json"; // place this at the root of the bucket

export default async function handler(req, res) {
  try {
    // 1) download prompts.json
    const { data: file, error: dlErr } = await db.storage
      .from(BUCKET)
      .download(PROMPTS_FILE);
    if (dlErr) return res.status(200).json({ ok: true, enqueued: 0, skipped: 0, note: "no prompts.json found" });

    const text = await file.text();
    let prompts = [];
    try { prompts = JSON.parse(text); } catch { prompts = []; }
    if (!Array.isArray(prompts) || prompts.length === 0) {
      return res.status(200).json({ ok: true, enqueued: 0, skipped: 0, note: "prompts.json empty" });
    }

    // 2) pull recent (7d) prompts to avoid duplicates
    const { data: recent, error: qErr } = await db
      .from("prompt_queue")
      .select("prompt,created_at")
      .gte("created_at", new Date(Date.now() - 7*24*60*60*1000).toISOString());
    if (qErr) throw qErr;

    const seen = new Set((recent || []).map(r => norm(r.prompt)));
    const todo = [];
    for (const p of prompts) {
      const s = typeof p === "string" ? p : String(p?.prompt ?? "");
      if (!s) continue;
      if (seen.has(norm(s))) continue;
      seen.add(norm(s));
      todo.push({ prompt: s });
    }

    if (todo.length === 0) {
      return res.status(200).json({ ok: true, enqueued: 0, skipped: prompts.length });
    }

    // 3) enqueue the new ones
    const { data: ins, error: insErr } = await db
      .from("prompt_queue")
      .insert(todo)
      .select("id,prompt,status,created_at");
    if (insErr) throw insErr;

    res.status(200).json({ ok: true, enqueued: ins?.length || 0, skipped: prompts.length - (ins?.length || 0) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}

function norm(s){ return s.trim().toLowerCase(); }
