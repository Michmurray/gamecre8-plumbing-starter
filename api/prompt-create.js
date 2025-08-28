// api/prompt-create.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } }
);

// tolerant, inline scanner
const BUCKET = 'game-assets';
const SPRITE_DIRS = ['Spritesheet/', 'sprite/', 'Sprites/', 'PNG/'];
const BG_DIRS = ['Backgrounds/', 'backgrounds/', 'BG/', 'bg/'];
const isImage = (n) => /\.(png|jpe?g|gif|webp)$/i.test(n);

async function listDir(prefix) {
  const { data } = await supabase.storage.from(BUCKET)
    .list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
  return (data || []).filter(it => it?.name && isImage(it.name)).map(it => `${prefix}${it.name}`);
}
async function scanAssets() {
  const [s, b] = await Promise.all([
    Promise.all(SPRITE_DIRS.map(listDir)),
    Promise.all(BG_DIRS.map(listDir)),
  ]);
  const sprites = [...new Set(s.flat())];
  const backgrounds = [...new Set(b.flat())];
  return { counts: { sprites: sprites.length, backgrounds: backgrounds.length }, sprites, backgrounds };
}
function makeSlug(input) {
  const base = (input || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '').slice(0,48);
  const rand = Math.random().toString(36).slice(2,8);
  return `${base}-${rand}`;
}

// Try to pick a working play URL by probing both candidates
async function choosePlayURL(slug) {
  const base = (process.env.PUBLIC_SITE_URL || '').replace(/\/+$/,'');
  const paths = [
    `${base}/play?slug=${encodeURIComponent(slug)}`,
    `${base}/play.html?slug=${encodeURIComponent(slug)}`
  ].filter(Boolean);

  // If PUBLIC_SITE_URL not set, return relative paths (no probe)
  if (!base) return { chosen: `/play?slug=${slug}`, candidates: { play:`/play?slug=${slug}`, play_html:`/play.html?slug=${slug}` } };

  for (const url of paths) {
    try {
      const resp = await fetch(url, { method: 'HEAD' });
      if (resp.ok) return { chosen: url, candidates: { play: paths[0], play_html: paths[1] } };
    } catch {}
  }
  // If neither HEAD works, fall back to /play.html (static most common)
  return { chosen: paths[1], candidates: { play: paths[0], play_html: paths[1] } };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ ok:false, error:'Method Not Allowed' });
    }
    const prompt = (req.method === 'GET'
      ? (req.query.prompt || '')
      : (typeof req.body === 'string'
          ? (JSON.parse(req.body || '{}').prompt || '')
          : (req.body?.prompt || ''))).toString().trim() || 'untitled';

    // 1) assets
    const assets = await scanAssets();
    if (assets.counts.sprites === 0 || assets.counts.backgrounds === 0) {
      return res.status(200).json({ ok:false, error:'No assets found', counts: assets.counts });
    }

    // 2) pick art
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const sprite = pick(assets.sprites);
    const background = pick(assets.backgrounds);

    // 3) save
    const share_slug = makeSlug(prompt);
    const title = prompt;
    const game_json = { version:1, prompt, art:{ sprite, background } };

    let ins = await supabase.from('games')
      .insert({ prompt, title, game_json, share_slug, slug: share_slug })
      .select('id, slug, share_slug').maybeSingle();

    if (ins.error || !ins.data) {
      const msg = (ins.error?.message || ins.error?.details || '').toLowerCase();
      if (msg.includes('title') && msg.includes('does not exist')) {
        ins = await supabase.from('games')
          .insert({ prompt, game_json, share_slug, slug: share_slug })
          .select('id, slug, share_slug').maybeSingle();
      }
      if (ins.error || !ins.data) {
        return res.status(500).json({ ok:false, error: ins.error?.message || 'insert failed' });
      }
    }

    const slug = ins.data.share_slug || ins.data.slug || share_slug;

    // 4) choose a working play URL
    const pickURL = await choosePlayURL(slug);

    return res.status(200).json({
      ok: true,
      slug,
      url: pickURL.chosen,
      candidates: pickURL.candidates,
      chosen: { sprite, background },
      counts: assets.counts
    });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message || 'error' });
  }
}
