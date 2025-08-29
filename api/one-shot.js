// api/one-shot.js — pick random sprite/background (Supabase), save game, redirect to /play.html?slug=...
const https = require('https');

const BUCKET = process.env.SUPABASE_BUCKET || 'game-assets';
const ASSETS_SOURCE = (process.env.ASSETS_SOURCE || '').toLowerCase();
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SPRITES_PREFIX = process.env.SPRITES_PREFIX || 'sprite/';
const BG_CANDIDATES = process.env.BACKGROUNDS_PREFIX ? [process.env.BACKGROUNDS_PREFIX] : ['Backgrounds/','backgrounds/','sprite/Backgrounds/'];

function postJSON(urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const data = JSON.stringify(body || {});
    const opts = { method:'POST', hostname:u.hostname, path:u.pathname+(u.search||''), port:443,
      headers:{ 'content-type':'application/json', 'content-length':Buffer.byteLength(data), ...headers } };
    const req = https.request(opts, (res)=>{ let buf=''; res.on('data',d=>buf+=d); res.on('end',()=>{ let j=null; try{ j=JSON.parse(buf||'null'); }catch{} resolve({status:res.statusCode,json:j,text:buf}); });});
    req.on('error', reject); req.write(data); req.end();
  });
}
async function supaList(prefix){
  const endpoint = `${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`;
  const { json } = await postJSON(endpoint, { apikey:SUPABASE_ANON_KEY, authorization:`Bearer ${SUPABASE_ANON_KEY}` }, { prefix, limit:1000, sortBy:{ column:'name', order:'asc' } });
  if (!Array.isArray(json)) return [];
  return json.filter(e => /\.(png|jpe?g|webp|gif)$/i.test(e.name)).map(e => ({
    name: e.name,
    url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${prefix}${e.name}`
  }));
}
function slugify(text){ return (text||'game').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)+/g,'')+'-'+Math.random().toString(16).slice(2,7); }
function store(){ if(!global._gc8Store) global._gc8Store={games:{}}; return global._gc8Store; }

module.exports = async (req, res) => {
  try {
    const prompt = (req.query.prompt || '').toString().trim();
    if (!prompt) return res.status(400).json({ ok:false, error:'Missing prompt' });

    if (ASSETS_SOURCE !== 'supabase' || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(200).json({ ok:false, error:'Supabase not configured' });
    }

    const sprites = await supaList(SPRITES_PREFIX);
    let bgs = []; for (const cand of BG_CANDIDATES) { const rows = await supaList(cand); if (rows.length) { bgs=rows; break; } }
    if (!sprites.length || !bgs.length) return res.status(200).json({ ok:false, error:'Assets missing', counts:{ sprites:sprites.length, backgrounds:bgs.length } });

    const s = sprites[Math.floor(Math.random()*sprites.length)];
    const b = bgs[Math.floor(Math.random()*bgs.length)];

    const slug = slugify(prompt);
    const st = store();
    st.games[slug] = { slug, prompt, art:{ sprite:`supabase:${s.url}`, background:`supabase:${b.url}`, sprite_url:s.url, background_url:b.url }, created_at:new Date().toISOString() };

    res.writeHead(302, { Location: `/play.html?slug=${slug}` });
    return res.end();
  } catch (err) {
    return res.status(200).json({ ok:false, error:String(err?.message || err) });
  }
};
