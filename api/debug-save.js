// api/debug-save.js — dump in-memory game keys (never sensitive).
function store(){ if(!global._gc8Store) global._gc8Store={games:{}}; return global._gc8Store; }
module.exports = async (req, res) => {
  const st = store();
  return res.status(200).json({ ok:true, count:Object.keys(st.games).length, slugs:Object.keys(st.games).slice(0,50) });
};
