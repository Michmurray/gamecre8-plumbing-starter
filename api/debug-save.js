import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  try {
    const { error } = await supabase.from("games").insert({
      prompt: "test prompt",
      game_json: { hello: "world" },
      share_slug: "testslug"
    });

    if (error) {
      return res.status(200).json({ ok: false, error });
    } else {
      return res.status(200).json({ ok: true, message: "Insert worked" });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, exception: err.message });
  }
}
