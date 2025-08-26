import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { slug } = req.query || {};
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const { data, error } = await supabase
    .from("games")
    .select("prompt, game_json, created_at")
    .eq("share_slug", slug)
    .maybeSingle();

  if (error) return res.status(500).json({ error: "DB read failed" });
  if (!data) return res.status(404).json({ error: "Not found" });

  return res.status(200).json(data);
}
