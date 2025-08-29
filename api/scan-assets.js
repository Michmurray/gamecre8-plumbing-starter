// api/scan-assets.js
// Counts sprites/backgrounds from Supabase (if ASSETS_SOURCE=supabase) or /public fallback.
// Node runtime only (works on Vercel Serverless).
const path = require('path');

const useSupa = (process.env.ASSETS_SOURCE || '').toLowerCase() === 'supabase';
const bucket = process.env.SUPABASE_BUCKET || 'game-assets';
const SPRITES_PREFIX = process.env.SPRITES_PREFIX || 'sprite/';
const BACKGROUNDS_PREFIX_ENV = process.env.BACKGROUNDS_PREFIX; // may be undefined
const BG_CANDIDATES = BACKGROUNDS_PREFIX_ENV ? [BACKGROUNDS_PREFIX_ENV] : ['backgrounds/', 'Backgrounds/', 'sprite/Backgrounds/'];

// dynamic fetch for Node 16 safety
const _fetch = global.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

async function supaList(prefix) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return { rows: [], note: 'missing supabase env' };

  const endpoint = `${url}/storage/v1/object/list/${bucket}`;
  const body = { prefix, limit: 1000, sortBy: { column: 'name', order: 'asc' } };

  const r = await _fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  return { rows: Array.isArray(j) ? j.filter(e => /\.(png|jpe?g|webp|gif)$/i.test(e.name)) : [], note: 'supabase scan' };
}

async function countSupabase(prefixes) {
  for (const p of prefixes) {
    const { rows } = await supaList(p);
    if (rows.length) return { count: rows.length, picked: p };
  }
  return { count: 0, picked: prefixes[0] };
}

function fsCount(dir) {
  try { return require('fs').readdirSync(dir).filter(f => !f.startsWith('.')).length; }
  catch { return 0; }
}

module.exports = async (req, res) => {
  try {
    let sprites = 0, backgrounds = 0, notes = '';

    if (useSupa) {
      const s = await countSupabase([SPRITES_PREFIX]);
      const b = await countSupabase(BG_CANDIDATES);
      sprites = s.count; backgrounds = b.count;
      notes = `supabase scan succeeded (sprites:${s.count}@${s.picked} bg:${b.count}@${b.picked})`;
    } else {
      const publicDir = path.join(process.cwd(), 'public');
      sprites = fsCount(path.join(publicDir, 'sprite'));
      backgrounds = fsCount(path.join(publicDir, 'backgrounds'));
      notes = 'filesystem scan succeeded';
    }

    return res.status(200).json({ ok: true, counts: { sprites, backgrounds }, notes });
  } catch (err) {
    return res.status(200).json({ ok: false, error: String(err?.message || err) }); // never hard-crash
  }
};

module.exports.config = { runtime: 'nodejs' };
