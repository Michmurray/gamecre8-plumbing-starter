// api/save-game.js — upsert a game (used by debug/testing).
function store(){ if(!global._gc8Store) global._gc8Store={games:{}}; return global._gc8Store; }

module.exports = async (req, res) => {
  try {
    let body = {};
    try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch {}
    const slug = (body.slug || '').trim();
    const game = body.game;
    if (!slug || !game) return res.status(400).json({ ok:false, error:'slug and game required' });
    const st = store();
    st.games[slug] = game;
    return res.status(200).json({ ok:true, saved:true });
  } catch (err) {
    return res.status(500).json({ ok:false, error:String(err?.message||err) });
  }
};
