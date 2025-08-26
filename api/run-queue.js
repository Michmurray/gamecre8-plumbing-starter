// api/run-queue.js
// Processes pending prompts: Olli brief → generate → save → mark done.

import { createClient } from "@supabase/supabase-js";

const SITE  = process.env.PUBLIC_SITE_URL;            // e.g. https://<your-app>.vercel.app
const BATCH = Number(process.env.QUEUE_BATCH || 5);   // items per run

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  try {
    // 1) pull some pending jobs
    const { data: pending, error } = await db
      .from("prompt_queue").select("*")
      .eq("status","pending")
      .order("created_at",{ ascending:true })
      .limit(BATCH);
    if (error) return res.status(500).json({ ok:false, error:error.message });

    const results = [];
    for (const row of pending) {
      // 2) claim this job (avoid double work)
      const claim = await db.from("prompt_queue")
        .update({ status:"working" })
        .eq("id", row.id).eq("status","pending")
        .select("id").single();
      if (claim.error || !claim.data) continue;

      try {
        // 3a) optional Olli brief for better tuning
        let brief = null;
        try {
          brief = await post("/api/olli-brief", {
            answers:{ theme: row.prompt, pace:"medium", jump:"normal" }
          });
        } catch {}

        // 3b) generate the game
        const genBody = brief?.engine ? { prompt: row.prompt, brief } : { prompt: row.prompt };
        const game = await post("/api/generatr", genBody);

        // 3c) save it (store engine/brief too)
        const saved = await post("/api/save-game", {
          prompt: game.prompt, game, engine: game.engine || null, brief: brief || null
        });

        await db.from("prompt_queue")
          .update({ status:"done", result_slug: saved.slug, brief: brief || null })
          .eq("id", row.id);

        results.push({ id: row.id, slug: saved.slug });
      } catch (err) {
        await db.from("prompt_queue")
          .update({ status:"error", error: String(err) })
          .eq("id", row.id);
        results.push({ id: row.id, error: String(err) });
      }
    }

    res.status(200).json({ ok:true, processed: results.length, results });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e) });
  }
}

async function post(path, body){
  const r = await fetch(abs(path), {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });
  const j = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
function abs(p){ return p.startsWith("http") ? p : `${SITE}${p}`; }
