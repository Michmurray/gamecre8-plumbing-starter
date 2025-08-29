// api/prompt-create.js — create a game from explicit asset URLs (no scanning).
function store(){ if(!global._gc8Store) global._gc8Store={games:{}}; return global._gc8Store; }
function slugify(text){ return (text||'game').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)+/g,'')+'-'+Math.random().toString(16).slice(2,7); }

module.exports = async (req, res) => {
  try {
    let body = {};
    try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch {}
    const prompt = (body.prompt || '').toString().trim();
    const sprite_url = (body.sprite_url || '').toString().trim();
    const background_url = (body.background_url || '').toString().trim();
    if (!prompt || !sprite_url || !background_url) {
      return res.status(400).json({ ok:false, error:'prompt, sprite_url, background_url are required' });
    }
    const slug = slugify(prompt);
    const st = store();
    st.games[slug] = { slug, prompt, art:{ sprite:`supabase:${sprite_url}`, background:`supabase:${background_url}`, sprite_url, background_url }, created_at:new Date().toISOString() };
    res.writeHead(302, { Location: `/play.html?slug=${slug}` });
    return res.end();
  } catch (err) {
    return res.status(500).json({ ok:false, error:String(err?.message||err) });
  }
};
