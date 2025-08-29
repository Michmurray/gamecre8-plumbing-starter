// api/get-game.js — return a game by slug from in-memory store.
function store(){ if(!global._gc8Store) global._gc8Store={games:{}}; return global._gc8Store; }
module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const slug = (url.searchParams.get('slug') || '').trim();
  if (!slug) return res.status(400).json({ ok:false, error:'missing slug' });
  const st = store();
  const game = st.games[slug];
  if (!game) return res.status(404).json({ ok:false, error:'not found' });
  return res.status(200).json({ ok:true, game });
};
