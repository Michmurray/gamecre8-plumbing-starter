// api/get-game.js
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const BUCKET = 'game-assets';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ ok:false, error:'Method Not Allowed' }); }

    const id = req.query.id ? Number(req.query.id) : null;
    const slug = (req.query.slug ?? req.query.share_slug ?? '').toString().trim();

    let row = null, err = null;

    if (id) {
      const { data, error } = await supabase
        .from('games')
        .select('id,slug,share_slug,title,prompt,game_json,created_at')
        .eq('id', id).maybeSingle();
      row = data; err = error;
    } else if (slug) {
      // Try slug first
      let r1 = await supabase
        .from('games')
        .select('id,slug,share_slug,title,prompt,game_json,created_at')
        .eq('slug', slug).order('id', { ascending:false }).limit(1).maybeSingle();
      row = r1.data; err = r1.error;

      // If not found, try share_slug
      if (!row) {
        let r2 = await supabase
          .from('games')
          .select('id,slug,share_slug,title,prompt,game_json,created_at')
          .eq('share_slug', slug).order('id', { ascending:false }).limit(1).maybeSingle();
        row = r2.data; err = r2.error;
      }
    } else {
      return res.status(400).json({ ok:false, error:'Missing id or slug' });
    }

    if (err)   return res.status(500).json({ ok:false, error: err.message || 'query error' });
    if (!row)  return res.status(404).json({ ok:false, error:'Not found' });

    // Public URLs for chosen art (bucket is public)
    const spPath = row?.game_json?.art?.sprite;
    const bgPath = row?.game_json?.art?.background;
    const sprite_url = spPath ? supabase.storage.from(BUCKET).getPublicUrl(spPath).data.publicUrl : null;
    const background_url = bgPath ? supabase.storage.from(BUCKET).getPublicUrl(bgPath).data.publicUrl : null;

    const finalSlug = row.slug || row.share_slug || null;
    return res.status(200).json({ ok:true, slug: finalSlug, game: row, asset_urls: { sprite_url, background_url } });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message || 'error' });
  }
}
