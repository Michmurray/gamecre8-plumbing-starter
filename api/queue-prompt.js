// api/queue-prompt.js
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth:{ persistSession:false } });

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow",["POST"]); return res.status(405).end(); }
  try {
    const body = await read(req);
    const prompts = Array.isArray(body.prompts) ? body.prompts : [body.prompt].filter(Boolean);
    if (!prompts.length) return res.status(400).json({ error:"No prompts" });
    const rows = prompts.map(p => ({ prompt:p }));
    const { data, error } = await db.from("prompt_queue").insert(rows).select("id,prompt,status,created_at");
    if (error) return res.status(500).json({ error:error.message });
    res.status(200).json({ ok:true, enqueued:data });
  } catch (e) {
    res.status(500).json({ error:String(e) });
  }
}
async function read(req){ const bufs=[]; for await (const c of req) bufs.push(c); try{ return JSON.parse(Buffer.concat(bufs).toString("utf8")||"{}"); }catch{ return {}; } }
