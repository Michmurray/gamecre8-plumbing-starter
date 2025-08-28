// api/queue-prompt.js
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false }
});

export default async function handler(req, res) {
  try {
    // Accept GET ?prompt=... or POST {"prompt":"..."}
    let prompt = "";

    if (req.method === "GET") {
      prompt = (req.query.prompt || "").toString().trim();
    } else if (req.method === "POST") {
      const body = await readJson(req);
      prompt = (body?.prompt || "").toString().trim();
    } else {
      // Do not 405—fall back to GET-style so /api/prompt-to-play can call it freely
      prompt = (req.query.prompt || "").toString().trim();
    }

    if (!prompt) {
      return res.status(400).json({ ok: false, error: "Missing prompt" });
    }

    const { data, error } = await db
      .from("prompt_queue")
      .insert([{ prompt, status: "queued" }])
      .select("id, prompt, status, created_at")
      .single();

    if (error) {
      return res.status(500).json({ ok: false, error: error.message || String(error) });
    }

    return res.status(200).json({ ok: true, ...data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
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
