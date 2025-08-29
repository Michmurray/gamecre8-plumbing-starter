// Counts files under /public/sprite and /public/backgrounds
const fs = require('fs');
const path = require('path');

function safeCount(dir) {
  try { return fs.readdirSync(dir).filter(f => !f.startsWith('.')).length; }
  catch { return 0; }
}

module.exports = (req, res) => {
  const redirect = (req.query.redirect || '0') === '1';
  const publicDir = path.join(process.cwd(), 'public');
  const spriteDir = path.join(publicDir, 'sprite');
  const bgDir = path.join(publicDir, 'backgrounds');

  const payload = {
    ok: true,
    counts: { sprites: safeCount(spriteDir), backgrounds: safeCount(bgDir) },
    notes: 'tolerant scan succeeded'
  };

  if (redirect && payload.counts.sprites > 0 && payload.counts.backgrounds > 0) {
    res.writeHead(302, { Location: '/' });
    return res.end();
  }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};
