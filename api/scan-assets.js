// api/scan-assets.js — crash-proof counts via Supabase using Node https.
const https = require('https');

function postJSON(urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(urlStr);
      const data = JSON.stringify(body || {});
      const opts = {
        method: 'POST',
        hostname: u.hostname,
        path: u.pathname + (u.search || ''),
        port: 443,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), ...headers }
      };
      const req = https.request(opts, (res) => {
        let buf = '';
        res.on('data', (d) => (buf += d));
        res.on('end', () => {
          let json = null; try { json = JSON.parse(buf || 'null'); } catch {}
          resolve({ status: res.statusCode, json, text: buf });
        });
      });
      req.on('error', reject);
      req.write(data); req.end();
    } catch (e) { reject(e); }
  });
}

module.exports = async (req, res) => {
  try {
    const ASSETS_SOURCE = (process.env.ASSETS_SOURCE || '').toLowerCase();
    if (ASSETS_SOURCE !== 'supabase') return res.status(200).json({ ok:false, error:'ASSETS_SOURCE must be "supabase"' });

    const url  = process.env.SUPABASE_URL;
    const key  = process.env.SUPABASE_ANON_KEY;
    const bucket = process.env.SUPABASE_BUCKET || 'game-assets';
    const SPRITES_PREFIX = process.env.SPRITES_PREFIX || 'sprite/';
    const BG_CANDIDATES = process.env.BACKGROUNDS_PREFIX ? [process.env.BACKGROUNDS_PREFIX] : ['Backgrounds/','backgrounds/','sprite/Backgrounds/'];

    if (!url || !key) return res.status(200).json({ ok:false, error:'missing_supabase_env' });

    const endpoint = `${url}/storage/v1/object/list/${bucket}`;
    async function list(prefix){
      const { json } = await postJSON(endpoint, { apikey:key, authorization:`Bearer ${key}` }, { prefix, limit:1000, sortBy:{column:'name',order:'asc'} });
      if (!Array.isArray(json)) return [];
      return json.filter(e => /\.(png|jpe?g|webp|gif)$/i.test(e.name));
    }

    const s = await list(SPRITES_PREFIX);
    let b = [], used = BG_CANDIDATES[0];
    for (const cand of BG_CANDIDATES) { const r = await list(cand); if (r.length) { b=r; used=cand; break; } }

    return res.status(200).json({ ok:true, counts:{ sprites:s.length, backgrounds:b.length }
