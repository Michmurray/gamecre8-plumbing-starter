// One-shot: pick assets, save a game in memory, redirect to /play.html?slug=...
const fs = require('fs');
const path = require('path');

function chooseRandomFile(dir) {
  try {
    const files = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
    if (!files.length) return null;
    return files[Math.floor(Math.random() * files.length)];
  } catch { return null; }
}
function slugify(text) {
  return (text || 'game').toString().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')
    + '-' + Math.random().toString(16).slice(2, 7);
}
function store() {
  if (!global._gc8Store) global._gc8Store = { games: {} };
  return global._gc8Store;
}

module.exports = (req, res) => {
  const prompt = (req.query.prompt || '').toString().trim();
  if (!prompt) {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok:false, error:'Missing prompt' }));
  }

  const publicDir = path.join(process.cwd(), 'public');
  const sprite = chooseRandomFile(path.join(publicDir, 'sprite'));
  const background = chooseRandomFile(path.join(publicDir, 'backgrounds'));
  if (!sprite || !background) {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok:false, error:'Assets missing',
      counts:{ sprites: sprite?1:0, backgrounds: background?1:0 }
    }));
  }

  const slug = slugify(prompt);
  const s = store();
  s.games[slug] = {
    slug, prompt,
    art:{ sprite: 'sprite/' + sprite, background: 'backgrounds/' + background },
    created_at: new Date().toISOString()
  };

  res.writeHead(302, { Location: `/play.html?slug=${slug}` });
  res.end();
};
