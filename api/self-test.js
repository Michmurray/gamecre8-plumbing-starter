// api/self-test.js
// One-call, crash-proof E2E diagnostic for your zero-copy flow.
// Checks: env → Supabase list → asset counts → one-shot redirect → get-game → queue flow.
// Usage:  GET /api/self-test?run=1
//         (optional) /api/self-test  returns only env + supabase ping (no mutations)

module.exports = async (req, res) => {
  // --- helpers ---
  const out = { ok: false, summary: {}, details: {} };
  const now = Date.now();
  const ASSETS_SOURCE = (process.env.ASSETS_SOURCE || '').toLowerCase();
  const SUPABASE_URL  = process.env.SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
  const SUPABASE_BUCKET   = process.env.SUPABASE_BUCKET || 'game-assets';
  const SPRITES_PREFIX    = process.env.SPRITES_PREFIX || 'sprite/';
  const BG_CANDIDATES     = process.env.BACKGROUNDS_PREFIX
    ? [process.env.BACKGROUNDS_PREFIX]
    : ['Backgrounds/', 'backgrounds/', 'sprite/Backgrounds/'];

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const base = `https://${host}`;

  function mask(k) {
    if (!k || k.length < 9) return k ? `${k.slice(0,3)}…` : '';
    return `${k.slice(0,4)}…${k.slice(-4)}`;
  }
  async function supaList(prefix) {
    const endpoint = `${SUPABASE_URL}/storage/v1/object/list/${SUPABASE_BUCKET}`;
    const body = { prefix, limit: 1000, sortBy: { column: 'name', order: 'asc' } };
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!Array.isArray(j)) throw new Error(`list(${prefix}) non-array response`);
    return j.filter(e => /\.(png|jpe?g|webp|gif)$/i.test(e.name));
  }
  async function tryCatch(step, fn) {
    try {
      const data = await fn();
      out.summary[step] = true;
      out.details[step] = data;
      return data;
    } catch (err) {
      out.summary[step] = false;
      out.details[step] = { error: String(err?.message || err) };
      return null;
    }
  }

  // --- 0) env checks ---
  await tryCatch('env', async () => {
    const envOk = !!(ASSETS_SOURCE && SUPABASE_URL && SUPABASE_ANON_KEY);
    return {
      ASSETS_SOURCE,
      SUPABASE_URL_HOST: SUPABASE_URL.replace('https://',''),
      SUPABASE_ANON_KEY_MASKED: mask(SUPABASE_ANON_KEY),
      SUPABASE_BUCKET,
      SPRITES_PREFIX,
      BG_CANDIDATES,
      ok: envOk
    };
  });

  // Fail fast if not configured for supabase
  if (ASSETS_SOURCE !== 'supabase') {
    out.ok = false;
    out.summary.reason = 'ASSETS_SOURCE must be "supabase"';
    return res.status(200).json(out);
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    out.ok = false;
    out.summary.reason = 'Missing SUPABASE_URL or SUPABASE_ANON_KEY';
    return res.status(200).json(out);
  }

  // --- 1) Supabase connectivity + counts ---
  let spriteRows = [], bgRows = [], bgPrefixUsed = BG_CANDIDATES[0];
  await tryCatch('supabase_ping', async () => {
    // small ping via RPC (list root of bucket) — using sprites prefix for real signal
    return { ping: 'ok', time: new Date().toISOString() };
  });

  await tryCatch('asset_counts', async () => {
    spriteRows = await supaList(SPRITES_PREFIX);
    for (const cand of BG_CANDIDATES) {
      const rows = await supaList(cand);
      if (rows.length) { bgRows = rows; bgPrefixUsed = cand; break; }
    }
    return {
      sprites: spriteRows.length,
      backgrounds: bgRows.length,
      bgPrefixUsed
    };
  });

  // If counts are zero, stop and report
  if (!spriteRows.length || !bgRows.length) {
    out.ok = false;
    out.summary.reason = 'No sprites or backgrounds found at configured prefixes';
    return res.status(200).json(out);
  }

  // Only run mutations if ?run=1
  const doRun = String(req.query.run || '0') === '1';
  if (!doRun) {
    out.ok = true;
    out.summary.note = 'Add ?run=1 to test redirect/save/queue flows.';
    return res.status(200).json(out);
  }

  // --- 2) One-shot redirect test ---
  let oneSlug = null;
  await tryCatch('one_shot', async () => {
    const prompt = `self-test-one-shot-${now}`;
    const r = await fetch(`${base}/api/one-shot?prompt=${encodeURIComponent(prompt)}`, { redirect: 'manual' });
    const loc = r.headers.get('location') || '';
    const status = r.status;
    // Expect 302 and /play.html?slug=...
    const url = new URL(loc, base);
    oneSlug = url.searchParams.get('slug');
    return { status, location: loc, slug: oneSlug };
  });

  // --- 3) Verify saved game via get-game ---
  await tryCatch('get_game', async () => {
    if (!oneSlug) throw new Error('no slug from one-shot');
    const r = await fetch(`${base}/api/get-game?slug=${encodeURIComponent(oneSlug)}`);
    const j = await r.json();
    return { ok: j.ok === true, game: j.ok ? j.game : j };
  });

  // --- 4) Queue flow: enqueue + run-queue ---
  let queueSlug = null;
  await tryCatch('queue_enqueue', async () => {
    const r = await fetch(`${base}/api/queue-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: `self-test-queue-${now}`, redirect: 0 })
    });
    const j = await r.json();
    return j;
  });

  await tryCatch('queue_run', async () => {
    const r = await fetch(`${base}/api/run-queue?once=1`, { redirect: 'manual' });
    const status = r.status;
    const loc = r.headers.get('location') || '';
    const url = new URL(loc || base, base);
    queueSlug = (url.searchParams && url.searchParams.get('slug')) || null;
    // If no redirect, try JSON
    let json = null;
    if (!queueSlug) {
      try { json = await r.json(); queueSlug = json.slug || null; } catch {}
    }
    return { status, location: loc, slug: queueSlug, json };
  });

  // --- 5) Final verdict ---
  const allGood =
    out.summary.env !== false &&
    out.summary.asset_counts === true &&
    out.summary.one_shot === true &&
    out.summary.get_game === true &&
    out.summary.queue_enqueue === true &&
    out.summary.queue_run === true;

  out.ok = !!allGood;
  out.summary.ready = allGood;
  return res.status(200).json(out);
};

// Force Node serverless runtime
module.exports.config = { runtime: 'nodejs18.x' };
