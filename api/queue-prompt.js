// api/queue-prompt.js — GET status, POST enqueue. Tolerant JSON. 405-safe.
module.exports = async function handler(req, res) {
  try {
    if (!global._gc8Queue) global._gc8Queue = [];

    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, queue_depth: global._gc8Queue.length, note: 'queue-prompt GET ok' });
    }

    if (req.method === 'POST') {
      let body = {};
      try {
        body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      } catch (_e) {
        return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
      }
      const prompt = (body.prompt || '').toString().trim();
      const redirect = body.redirect ? 1 : 0;
      if (!prompt) return res.status(400).json({ ok: false, error: 'Missing "prompt"' });

      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      global._gc8Queue.push({ id, prompt, redirect, createdAt: Date.now() });

      return res.status(202).json({ ok: true, id, queue_depth: global._gc8Queue.length, note: 'queued' });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
};
