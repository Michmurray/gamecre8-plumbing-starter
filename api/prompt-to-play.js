// api/prompt-to-play.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } }
);

// --- tolerant, self-contained scanner (no local imports) ---
const BUCKET = 'game-assets';
const SPRITE_DIRS = ['Spritesheet/', 'sprite/', 'Sprites/', 'PNG/'];
const BG_DIRS = ['Backgrounds/', 'backgrounds/', 'BG/', 'bg/'];
const isImage = (n) => /\.(png|jpg|jpeg|gif|webp)$/i.test(n);

async function listDir(prefix) {
  const { data, error } = await supabase
    .storage.from(BUCKET)
    .list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
  if (error) return [];
  return (data || [])
    .filter((it) => it?.name && isImage(it.name))
    .map((it) => `${prefix}${it.name}`);
}

async function scanAssets() {
  const [spriteLists, bgLists] = await Promise.all([
    Promise.all(SPRITE_DIRS.map(listDir)),
    Promise.all(BG_DIRS.map(listDir)),
  ]);
  const sprites = [...new Set(spriteLists.flat())];
  const backgrounds = [...new Set(bgLists.flat())];
  return { counts: { sprites: sprites.length, backgrounds: backgrounds.length }, sprites, backgrounds };
}

function makeSlug(input) {
  const base = (input || 'game')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '').slice(0, 48);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base}-${rand}`;
}

export default async function handler(req, res) {
  try {
    const prompt = (req.query.prompt || '').toString().trim() || 'untitled';
    const redirectFlag = String(req.query.redirect || '1') === '1';

    // 1) Scan assets
    const assets = await scanAssets();

    // Step 1: counts only
    if (!redirectFlag) {
      return res.status(200).json({ ok: true, counts: assets.counts });
    }

    // Need at least one of each to proceed
    if (assets.counts.sprites === 0 || assets.counts.backgrounds === 0) {
      return res.status(200).json({ ok: false, error: 'No assets found', counts: assets.counts });
    }

    // 2) Pick random art
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const sprite = pick(assets.sprites);
    const background = pick(assets.backgrounds);

    // 3) Save game (db requires title + slug; slug mirrors share_slug)
    const share_slug = makeSlug(prompt);
    const game_json = { version: 1, prompt, art: { sprite, background } };
    const title = prompt;

    // Insert, being tolerant of column differences
    let data, error;
    ({ data, error } = await supabase
      .from('games')
      .insert({ prompt, title, game_json, share_slug, slug: share_slug })
      .select('share_slug, slug')
      .single());

    if (error) {
      // Retry paths if schema differs
      const msg = (error.message || error.details || '').toLowerCase();
      if (msg.includes('column') && msg.includes('slug') && msg.includes('does not exist')) {
        ({ data, error } = await supabase
          .from('games')
          .insert({ prompt, title, game_json, share_slug })
          .select('share_slug')
          .single());
      } else if (msg.includes('column') && msg.includes('share_slug') && msg.includes('does not exist')) {
        ({ data, error } = await supabase
          .from('games')
          .insert({ prompt, title, game_json, slug: share_slug })
          .select('slug')
          .single());
      } else if (msg.includes('column') && msg.includes('title') && msg.includes('does not exist')) {
        ({ data, error } = await supabase
          .from('games')
          .insert({ prompt, game_json, share_slug, slug: share_slug })
          .select('share_slug, slug')
          .single());
      }
    }

    if (error) return res.status(500).json({ ok: false, error: error.message });

    const finalSlug = data?.share_slug || data?.slug || share_slug;
    const urlPath = `/play.html?slug=${finalSlug}`;
    const base = process.env.PUBLIC_SITE_URL || '';
    res.setHeader('Location', base ? `${base}${urlPath}` : urlPath);
    return res.status(302).end();
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'error' });
  }
}
