// api/prompt-to-play.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } }
);

const BUCKET = 'game-assets';
const SPRITE_DIRS = ['Spritesheet/', 'sprite/', 'Sprites/', 'PNG/'];
const BG_DIRS = ['Backgrounds/', 'backgrounds/', 'BG/', 'bg/'];
const isImage = (n) => /\.(png|jpg|jpeg|gif|webp)$/i.test(n);

async function listDir(prefix) {
  const { data, error } = await supabase
    .storage
    .from(BUCKET)
    .list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
  if (error) return [];
  return (data || [])
    .filter((it) => it && it.name && isImage(it.name))
    .map((it) => `${prefix}${it.name}`);
}

// Prefer external scanner if present; otherwise inline tolerant scanner
async function getScanAssets() {
  try {
    const mod = await import('./_assets.js');
    if (typeof mod.scanAssets === 'function') return mod.scanAssets;
  } catch {}
  return async function scanAssetsInline() {
    const spriteLists = await Promise.all(SPRITE_DIRS.map(listDir));
    const bgLists = await Promise.all(BG_DIRS.map(listDir));
    const sprites = [...new Set(spriteLists.flat())];
    const backgrounds = [...new Set(bgLists.flat())];
    return { counts: { sprites: sprites.length, backgrounds: backgrounds.length }, sprites, backgrounds };
  };
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

    const scanAssets = await getScanAssets();
    const assets = await scanAssets();

    // Step 1: counts only
    if (!redirectFlag) {
      return res.status(200).json({ ok: true, counts: assets.counts });
    }

    if (assets.counts.sprites === 0 || assets.counts.backgrounds === 0) {
      return res.status(200).json({ ok: false, error: 'No assets found', counts: assets.counts });
    }

    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const sprite = pick(assets.sprites);
    const background = pick(assets.backgrounds);

    const share_slug = makeSlug(prompt);
    const game_json = { version: 1, prompt, art: { sprite, background } };
    const title = prompt;

    // Try with title (handles NOT NULL). If the column doesn't exist, retry without.
    let data, error;
    ({ data, error } = await supabase
      .from('games')
      .insert({ prompt, title, game_json, share_slug })
      .select('share_slug')
      .single());
    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('column') && msg.includes('title') && msg.includes('does not exist')) {
        ({ data, error } = await supabase
          .from('games')
          .insert({ prompt, game_json, share_slug })
          .select('share_slug')
          .single());
      }
    }
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const urlPath = `/play.html?slug=${data.share_slug}`;
    const base = process.env.PUBLIC_SITE_URL || '';
    res.setHeader('Location', base ? `${base}${urlPath}` : urlPath);
    return res.status(302).end();
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'error' });
  }
}
