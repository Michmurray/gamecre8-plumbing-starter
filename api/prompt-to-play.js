// api/prompt-to-play.js
import { createClient } from '@supabase/supabase-js';
import { scanAssets } from './_assets.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } }
);

function makeSlug(input) {
  const base = (input || 'game')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 48);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base}-${rand}`;
}

export default async function handler(req, res) {
  try {
    const prompt = (req.query.prompt || '').toString().trim() || 'untitled';
    const redirectFlag = String(req.query.redirect || '1') === '1';

    // 1) Scan assets
    const assets = await scanAssets();

    // If redirect=0, just report counts and exit (no save)
    if (!redirectFlag) {
      return res.status(200).json({ ok: true, counts: assets.counts });
    }

    // Need at least 1 sprite + 1 background to proceed
    if (assets.counts.sprites === 0 || assets.counts.backgrounds === 0) {
      return res
        .status(200)
        .json({ ok: false, error: 'No assets found', counts: assets.counts });
    }

    // 2) Pick random art
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const sprite = pick(assets.sprites);
    const background = pick(assets.backgrounds);

    // 3) Save game
    const share_slug = makeSlug(prompt);
    const game_json = {
      version: 1,
      prompt,
      art: { sprite, background },
    };

    const { data, error } = await supabase
      .from('games')
      .insert({ prompt, game_json, share_slug })
      .select('share_slug')
      .single();

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    const urlPath = `/play.html?slug=${data.share_slug}`;
    const base = process.env.PUBLIC_SITE_URL || '';

    if (redirectFlag) {
      res.setHeader('Location', base ? `${base}${urlPath}` : urlPath);
      return res.status(302).end();
    }

    // (Not used here, but kept for symmetry)
    return res
      .status(200)
      .json({
        ok: true,
        counts: assets.counts,
        slug: data.share_slug,
        url: urlPath,
        chosen: { sprite, background },
      });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'error' });
  }
}
