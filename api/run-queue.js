// api/run-queue.js — pops queue, picks assets (Supabase), saves game, redirects if requested.
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
    if (!global._gc8Queue || !global._gc8Queue.length) {
      return res.status(200).json({ ok:false, error:'queue empty' });
    }
    const job = global._gc8Queue.shift();

    if (ASSETS_SOURCE !== 'supabase' || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(200).json({ ok:false, error:'Supabase not configured' });
    }

    const sprites = await supaList(SPRITES_PREFIX);
    let bgs = []; for (const cand of BG_CANDIDATES) { const rows = await supaList(cand); if (rows.length) { bgs=rows; break; } }
    if (!sprites.length || !bgs.length) return res.status(200).json({ ok:false, error:'assets missing for run-queue' });

    const s = sprites[Math.floor(Math.random()*sprites.length)];
    const b = bgs[Math.floor(Math.random()*bgs.length)];

    const slug = slugify(job.prompt || 'game');
    const st = store();
    st.games[slug] = { slug, prompt:job.prompt, art:{ sprite:`supabase:${s.url}`, background:`supabase:${b.url}`, sprite_url:s.url, background_url:b.url }, created_at:new Date().toISOString() };

    if (job.redirect) { res.writeHead(302, { Location: `/play.html?slug=${slug}` }); return res.end(); }
    return res.status(200).json({ ok:true, slug, redirected:false });
  } catch (err) {
    return res.status(200).json({ ok:false, error:String(err?.message || err) });
  }
};
