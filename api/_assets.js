// api/_assets.js — list sprite/background assets from Supabase.
const https = require('https');

const BUCKET = process.env.SUPABASE_BUCKET || 'game-assets';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SPRITES_PREFIX = process.env.SPRITES_PREFIX || 'sprite/';
const BG_CANDIDATES = process.env.BACKGROUNDS_PREFIX
  ? [process.env.BACKGROUNDS_PREFIX]
  : ['Backgrounds/', 'backgrounds/', 'sprite/Backgrounds/'];

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
        let buf = ''; res.on('data', d => buf += d);
        res.on('end', () => { let j=null; try{ j=JSON.parse(buf||'null'); }catch{} resolve({ status:res.statusCode, json:j, text:buf }); });
      });
      req.on('error', reject); req.write(data); req.end();
    } catch (e) { reject(e); }
  });
}

async function supaList(prefix) {
  const endpoint = `${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`;
  const { json } = await postJSON(endpoint,
    { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    { prefix, limit: 1000, sortBy: { column: 'name', order: 'asc' } }
  );
  if (!Array.isArray(json)) return [];
  return json
    .filter(e => /\.(png|jpe?g|webp|gif)$/i.test(e.name))
    .map(e => ({ name: e.name, url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${prefix}${e.name}` }));
}

module.exports = async (req, res) => {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(200).json({ ok:false, error:'Supabase env missing' });
    }
    const sprites = await supaList(SPRITES_PREFIX);
    let bgs = [], used = BG_CANDIDATES[0];
    for (const cand of BG_CANDIDATES) { const rows = await supaList(cand); if (rows.length) { bgs=rows; used=cand; break; } }
    return res.status(200).json({ ok:true, counts:{ sprites:sprites.length, backgrounds:bgs.length }, prefixes:{ sprites:SPRITES_PREFIX, backgrounds:used }, sprites, backgrounds:bgs });
  } catch (err) {
    return res.status(200).json({ ok:false, error:String(err?.message||err) });
  }
};
