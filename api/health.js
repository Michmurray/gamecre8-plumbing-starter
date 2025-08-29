// api/health.js — simple healthcheck.
module.exports = async (_req, res) => res.status(200).json({ ok: true, status: 'healthy' });
