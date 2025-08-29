// api/scan-assets.js
// Crash-proof counts from Supabase. Node serverless only (no node-fetch, no FS).
module.exports = async (req, res) => {
  try {
    // Require Supabase mode (matches your setup)
    const ASSETS_SOURCE = (process.env.ASSETS_SOURCE || '').toLowerCase();
    if (ASSETS_SOURCE !== 'supabase') {
      return res.status(200).json({ ok: false, error: 'ASSETS_SOURCE must be "supabase"' });
    }

    const url   = process.env.SUPABASE_URL;                // e.g. https://xxxx.supabase.co
    const key   = process.env.SUPABASE_ANON_KEY;           // anon public key
    const bucket= process.env.SUPABASE_BUCKET || 'game-assets';
    const SPRITES_PREFIX = process.env.SPRITES_PREFIX || 'sprite/';
    const BG_CANDIDATES  = process.env.BACKGROUNDS_PREFIX
      ? [process.env.BACKGROUNDS_PREFIX]                  // e.g. Backgrounds/
      : ['Backgrounds/', 'backgrounds/', 'sprite/Backgrounds/'];

    if (!url || !key) {
      return res.status(200).json({ ok: false, error: 'missing_supabase_env (SUPABASE_URL or SUPABASE_ANON_KEY)' });
    }
    if (typeof fetch !== 'function') {
      return res.status(200).json({ ok: false, error: 'fetch_unavailable_in_runtime' });
    }

    async function list(prefix) {
      const r = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ prefix, limit: 1000, sortBy: { column: 'name', order: 'asc' } })
      });
      const j = await r.json();
      if (!Array.isArray(j)) return [];
      return j.filter(e => /\.(png|jpe?g|webp|gif)$/i.test(e.name));
    }

    const spriteRows = await list(SPRITES_PREFIX);

    let bgRows = [];
    let pickedBgPrefix = BG_CANDIDATES[0];
    for (const cand of BG_CANDIDATES) {
      const rows = await list(cand);
      if (rows.length) { bgRows = rows; pickedBgPrefix = cand; break; }
    }

    return res.status(200).json({
      ok: true,
      counts: { sprites: spriteRows.length, backgrounds: bgRows.length },
      notes: `supabase scan succeeded (bgPrefix=${pickedBgPrefix})`
    });
  } catch (err) {
    // Never hard-crash: always return JSON
    return res.status(200).json({ ok: false, error: String(err?.message || err) });
  }
};

// Force Node serverless runtime
module.exports.config = { runtime: 'nodejs18.x' };
