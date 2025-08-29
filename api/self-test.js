// api/self-test.js
// E2E diagnostic: env → Supabase list → counts → one-shot redirect → get-game → queue flow.
// Uses Node https (no fetch). Always returns JSON. Compatible with Vercel Serverless (Node).

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
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(data),
          ...headers
        }
      };
      const req = https.request(opts, (res) => {
        let buf = '';
        res.on('data', (d) => (buf += d));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(buf || 'null'); } catch { /* noop */ }
          resolve({ status: res.statusCode, json, text: buf });
        });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    } catch (e) { reject(e); }
  });
}

function getJSON(urlStr, headers) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(urlStr);
      const opts = { method: 'GET', hostname: u.hostname, path: u.pathname + (u.search || ''), port: 443, headers: headers || {} };
      const req = https.request(opts, (res) => {
        let buf = '';
        res.on('data', (d) => (buf += d));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(buf || 'null'); } catch { /* noop */ }
          resolve({ status: res.statusCode, json, text: buf, headers: res.headers });
        });
      });
      req.on('error', reject);
      req.end();
    } catch (e) { reject(e); }
  });
}

module.exports = async (req, res) => {
  const out = { ok: false, summary: {}, details: {} };
  const now = Date.now();

  const ASSETS_SOURCE = (process.env.ASSETS_SOURCE || '').toLowerCase();
  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
  const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'game-assets';
  const SPRITES_PREFIX = process.env.SPRITES_PREFIX || 'sprite/';
  const BG_CANDIDATES = process.env.BACKGROUNDS_PREFIX
    ? [process.env.BACKGROUNDS_PREFIX]
    : ['Backgrounds/', 'backgrounds/', 'sprite/Backgrounds/'];

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const base = `https://${host}`;

  function mask(k){ if(!k) return ''; return k.length<9 ? k : `${k.slice(0,4)}…${k.slice(-4)}`; }

  function set(step, ok, data){ out.summary[step] = !!ok; out.details[step] = data; }

  try {
    // 0) env
    const envOk = ASSETS_SOURCE==='supabase' && !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
    set('env', envOk, {
      ASSETS_SOURCE, SUPABASE_URL_HOST: SUPABASE_URL.replace('https://',''),
      SUPABASE_ANON_KEY_MASKED: mask(SUPABASE_ANON_KEY),
      SUPABASE_BUCKET, SPRITES_PREFIX, BG_CANDIDATES
    });
    if (!envOk) { out.ok = false; out.summary.reason = 'env_missing_or_wrong'; return res.status(200).json(out); }

    // 1) list via Supabase Storage
    const listEndpoint = `${SUPABASE_URL}/storage/v1/object/list/${SUPABASE_BUCKET}`;
    async function supaList(prefix){
      const { status, json, text } = await postJSON(
        listEndpoint,
        { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}` , 'content-type':'application/json' },
        { prefix, limit: 1000, sortBy: { column: 'name', order: 'asc' } }
      );
      if (!Array.isArray(json)) return { status, rows: [], raw: text };
      const rows = json.filter(e => /\.(png|jpe?g|webp|gif)$/i.test(e.name));
      return { status, rows };
    }

    const s1 = await supaList(SPRITES_PREFIX);
    let bgRows = [], usedBg = BG_CANDIDATES[0];
    for (const cand of BG_CANDIDATES) {
      const r = await supaList(cand);
      if (r.rows.length) { bgRows = r.rows; usedBg = cand; break; }
    }
    const countsOk = s1.rows.length>0 && bgRows.length>0;
    set('asset_counts', countsOk, { sprites: s1.rows.length, backgrounds: bgRows.length, bgPrefixUsed: usedBg });
    if (
