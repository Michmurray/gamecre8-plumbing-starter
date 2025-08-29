// Pops one queued prompt, picks assets (Supabase if configured), saves game, redirects if requested.
const path = require('path');
const bucket = process.env.SUPABASE_BUCKET || 'game-assets';
const useSupa = (process.env.ASSETS_SOURCE || '').toLowerCase() === 'supabase';
const SPRITES_PREFIX = process.env.SPRITES_PREFIX || 'sprite/';
const BG_CANDIDATES = process.env.BACKGROUNDS_PREFIX
  ? [process.env.BACKGROUNDS_PREFIX]
  : ['backgrounds/', 'Backgrounds/', 'sprite/Backgrounds/'];

const _fetch = global.fetch || ((...args) =>
  import('node-fetch').then(({ default: f }) => f(...args)));

function slugify(text) {
  return (text || 'game').toString().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')
    + '-' + Math.random().toString(16).slice(2, 7);
}
function store() { if (!global._gc8Store) global._gc8Store = { games: {} }; return global._gc8Store; }

async function supaList(prefix) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  const endpoint = `${url}/storage/v1/object/list/${bucket}`;
  const body = { prefix, limit: 1000, sortBy: { column: 'name', order: 'asc' } };
  const r = await _fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!Array.isArray(j)) return [];
  return j.filter(e => /\.(png|jpe?g|webp|gif)$/i.test(e.name)).map(e => ({
    name: e.name,
    url: `${url}/storage/v1/object/public/${bucket}/${prefix}${e.name}`,
  }));
}

async function pickSupabase() {
  let sprites = []; for (const p of [SPRITES_PREFIX]) { const rows = await supaList(p); if (rows.length) { sprites = rows; break; } }
  let bgs = []; for (const p of BG_CANDIDATES) { const rows = await supaList(p); if (rows.length) { bgs = rows; break; } }
  return { sprites, bgs };
}

function pickFs(dir) {
  try {
    const fs = require('fs');
    const files = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
    if (!files.length) return null;
    return files[Math.floor(Math.random() * files.length)];
  } catch { return null; }
}

module.exports = async (req, res) => {
  try {
    if (!global._gc8Queue || !global._gc8Queue.length) {
      return res.status(200).json({ ok: false, error: 'queue empty' });
    }
    const job = global._gc8Queue.shift();

    let art = {};
    if (useSupa) {
      const { sprites, bgs } = await pickSupabase();
      if (!sprites.length || !bgs.length) {
        return res.status(200).json({ ok: false, error: 'assets missing for run-queue' });
      }
      const s = sprites[Math.floor(Math.random() * sprites.length)];
      const b = bgs[Math.floor(Math.random() * bgs.length)];
      art = { sprite: `supabase:${s.url}`, background: `supabase:${b.url}`, sprite_url: s.url, background_url: b.url };
    } else {
      const publicDir = path.join(process.cwd(), 'public');
      const s = pickFs(path.join(publicDir, 'sprite'));
      const b = pickFs(path.join(publicDir, 'backgrounds'));
      if (!s || !b) return res.status(200).json({ ok: false, error: 'assets missing for run-queue' });
      art = { sprite: 'sprite/' + s, background: 'backgrounds/' + b };
    }

    const slug = slugify(job.prompt || 'game');
    const st = store();
    st.games[slug] = { slug, prompt: job.prompt, art, created_at: new Date().toISOString() };

    if (job.redirect) {
      res.writeHead(302, { Location: `/play.html?slug=${slug}` });
      return res.end();
    }
    return res.status(200).json({ ok: true, slug, redirected: false });
  } catch (err) {
    return res.status(200).json({ ok: false, error: String(err?.message || err) });
  }
};

module.exports.config = { runtime: 'nodejs' };
