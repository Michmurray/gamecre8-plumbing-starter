// api/prompt-create.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } }
);

// tolerant inline scanner
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
  const [s,b] = await Promise.all([
    Promise.all(SPRITE_DIRS.map(listDir)),
    Promise.all(BG_DIRS.map(listDir)),
  ]);
  const sprites = [...new Set(s.flat())];
  const backgrounds = [...new Set(b.flat())];
  return { counts: { sprites: sprites.length, backgrounds: backgrounds.length }, sprites, backgrounds };
}
function makeSlug(input) {
  const base = (input || 'game').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)+/g,'').slice(0,48);
  const rand = Math.random().toString(36).slice(2,8);
  return `${base}-${rand}`;
}

// Probe helper: check which path exists on THIS request's origin
async function pickWorkingPlayURL(req, slug) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').toString();
  const host = (req.headers.host || '').toString();
  const origin = `${proto}://${host}`;
  const candidates = [`/play?slug=${slug}`, `/play.html?slug=${slug}`];

  for (const path of candidates) {
    try {
      const r = await fetch(origin + path, { method: 'HEAD' });
      if (r.ok) return { url: origin + path, candidates: { play: origin + candidates[0], play_html: origin + candidates[1] } };
    } catch {}
  }
  // fallback: prefer static html even if HEAD failed (some hosts block HEAD)
  return { url: origin + candidates[1], candidates: { play: origin + candidates[0], play_html: origin + candidates[1] } };
}

export default async function handler(req, res) {
  try {
    const method = req.method || 'GET';
    if (method !== 'GET' && method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ ok:false, error:'Method Not Allowed' });
    }

    const prompt = (method === 'GET'
      ? (req.query.prompt || '')
      : (typeof req.body === 'string'
          ? (JSON.parse(req.body || '{}').prompt || '')
          : (req.body?.prompt || ''))).toString().trim() || 'untitled';

    // 1) assets
    const a = await scanAssets();
    if (a.counts.sprites === 0 || a.counts.backgrounds === 0) {
      return res.status(200).json({ ok:false, error:'No assets found', counts:a.counts });
    }

    // 2) choose art
    const pick = (arr) => arr[Math.floor(Math.random()*arr.length)];
    const sprite = pick(a.sprites), background = pick(a.backgrounds);

    // 3) save
    const share_slug = makeSlug(prompt);
    const title = prompt;
    const game_json = { version:1, prompt, art:{ sprite, background } };

    let ins = await supabase.from('games')
      .insert({ prompt, title, game_json, share_slug, slug: share_slug })
      .select('id, slug, share_slug')
      .maybeSingle();

    if (ins.error || !ins.data) {
      const msg = (ins.error?.message || ins.error?.details || '').toLowerCase();
      if (msg.includes('title') && msg.includes('does not exist')) {
        ins = await supabase.from('games')
          .insert({ prompt, game_json, share_slug, slug: share_slug })
          .select('id, slug, share_slug')
          .maybeSingle();
      }
      if (ins.error || !ins.data) return res.status(500).json({ ok:false, error: ins.error?.message || 'insert failed' });
    }

    const slug = ins.data.share_slug || ins.data.slug || share_slug;

    // 4) choose a working play URL for THIS deploy
    const chosen = await pickWorkingPlayURL(req, slug);

    return res.status(200).json({
      ok: true,
      slug,
      url: chosen.url,
      candidates: chosen.candidates,
      chosen_art: { sprite, background },
      counts: a.counts
    });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message || 'error' });
  }
}
