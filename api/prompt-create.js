// api/prompt-create.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } }
);

const BUCKET = 'game-assets';
const SPRITE_DIRS = ['sprite/', 'PNG/', 'Spritesheet/', 'Sprites/']; // prefer your real dirs first
const BG_DIRS = ['backgrounds/', 'Backgrounds/', 'BG/', 'bg/'];
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
  const base = (input || 'game').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)+/g,'').slice(0,48);
  const rand = Math.random().toString(36).slice(2,8);
  return `${base}-${rand}`;
}

// build public URL + probe it
function publicUrl(path) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
async function urlOk(url) {
  try { const r = await fetch(url, { method: 'HEAD' }); return r.ok; } catch { return false; }
}
async function pickValid(arr, maxTries = 8) {
  if (!arr.length) return null;
  for (let i = 0; i < maxTries; i++) {
    const p = arr[Math.floor(Math.random() * arr.length)];
    const u = publicUrl(p);
    if (await urlOk(u)) return p;
  }
  // last resort: scan sequentially
  for (const p of arr) { if (await urlOk(publicUrl(p))) return p; }
  return null;
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

    // 2) pick only assets that return 200
    const sprite = await pickValid(a.sprites);
    const background = await pickValid(a.backgrounds);
    if (!sprite || !background) {
      return res.status(200).json({ ok:false, error:'No valid asset URLs after probing', counts:a.counts });
    }

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
      if (ins.error || !ins.data) return res.status(500).json({ ok:false, error: ins.error?.message || 'insert failed' });
    }

    const slug = ins.data.share_slug || ins.data.slug || share_slug;

    // Prefer the serverless page; it always exists due to vercel.json rewrite
    const proto = (req.headers['x-forwarded-proto'] || 'https') + '';
    const host  = (req.headers.host || '') + '';
    const base  = `${proto}://${host}`;
    const url   = `${base}/api/play?slug=${encodeURIComponent(slug)}`;

    return res.status(200).json({
      ok: true,
      slug,
      url,
      candidates: { play_api: url, play: `${base}/play?slug=${slug}`, play_html: `${base}/play.html?slug=${slug}` },
      chosen_art: { sprite, background },
      counts: a.counts
    });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message || 'error' });
  }
}
