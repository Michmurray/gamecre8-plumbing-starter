// api/prompt-to-play.js — convenience wrapper: prompt → one-shot redirect.
module.exports = async (req, res) => {
  const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.writeHead(302, { Location: `/api/one-shot${q}` });
  res.end();
};
