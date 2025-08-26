export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    ts: new Date().toISOString(),
    url: req.url
  });
}
