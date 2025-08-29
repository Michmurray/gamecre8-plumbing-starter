// api/auto-enqueue.js — enqueue N prompts quickly for testing.
module.exports = async (req, res) => {
  try {
    if (!global._gc8Queue) global._gc8Queue = [];
    const url = new URL(req.url, 'http://x');
    const n = Math.max(1, Math.min(50, parseInt(url.searchParams.get('n') || '5', 10)));
    const base = url.searchParams.get('base') || 'demo';
    for (let i=0; i<n; i++) {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      global._gc8Queue.push({ id, prompt: `${base} ${i+1}`, redirect: 0, createdAt: Date.now() });
    }
    return res.status(200).json({ ok:true, queued:n, depth: global._gc8Queue.length });
  } catch (err) {
    return res.status(500).json({ ok:false, error:String(err?.message||err) });
  }
};
