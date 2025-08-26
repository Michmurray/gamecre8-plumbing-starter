import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { prompt, game } = req.body || {};
    if (!prompt || !game) return res.status(400).json({ error: "Missing prompt or game" });

    const slug = `${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`;

    const { error } = await supabase.from("game_saves").insert({
      prompt,
      game_json: game,
      share_slug: slug,
    });

    if (error) {
      console.error("DB insert error:", error);
      return res.status(500).json({ error: "DB insert failed" });
    }

    const share_url = `${process.env.PUBLIC_SITE_URL}/play.html?slug=${slug}`;
    return res.status(200).json({ ok: true, slug, share_url });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
