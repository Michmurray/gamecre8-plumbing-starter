// api/get-game.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    }

    const idRaw = (req.query.id ?? '').toString().trim();
    const slug = (req.query.slug ?? req.query.share_slug ?? '').toString().trim();

    let row = null, error = null;

    if (idRaw) {
      const id = Number(idRaw);
      const { data, error: e } = await supabase
        .from('games')
        .select('id,slug,share_slug,title,prompt,game_json,created_at')
        .eq('id', id)
        .limit(1);
      error = e;
      row = (data && data[0]) || null;
    } else if (slug) {
      // Accept either slug or share_slug
      const { data, error: e } = await supabase
        .from('games')
        .select('id,slug,share_slug,title,prompt,game_json,created_at')
        .or(`slug.eq.${slug},share_slug.eq.${slug}`)
        .order('id', { ascending: false })
        .limit(1);
      error = e;
      row = (data && data[0]) || null;
    } else {
      return res.status(400).json({ ok: false, error: 'Missing id or slug' });
    }

    if (error) {
      return res.status(500).json({ ok: false, error: error.message || 'query error' });
    }
    if (!row) {
      return res.status(404).json({ ok: false, error: 'Not found' });
    }

    const finalSlug = row.slug || row.share_slug || null;
    return res.status(200).json({ ok: true, slug: finalSlug, game: row });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'error' });
  }
}
