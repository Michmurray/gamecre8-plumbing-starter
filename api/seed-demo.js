// api/seed-demo.js — create several demo slugs quickly.
function store(){ if(!global._gc8Store) global._gc8Store={games:{}}; return global._gc8Store; }
function slugify(text){ return (text||'game').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)+/g,'')+'-'+Math.random().toString(16).slice(2,7); }

module.exports = async (_req, res) => {
  const st = store();
  const demos = ['shmup canyon', 'retro runner', 'cloudscape', 'forest platformer'];
  demos.forEach(p => {
    const slug = slugify(p);
    st.games[slug] = { slug, prompt:p, art:{ sprite:null, background:null }, created_at:new Date().toISOString() };
  });
  return res.status(200).json({ ok:true, added:demos.length });
};
