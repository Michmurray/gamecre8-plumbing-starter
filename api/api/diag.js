// api/diag.js
// End-to-end health check with optional auto-fix for DB schema.

import { createClient } from "@supabase/supabase-js";

const SITE = process.env.PUBLIC_SITE_URL; // e.g. https://your-app.vercel.app
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } }
);

// small helper to shape step results
const step = (ok, what, details = null) => ({ ok, what, details });

export default async function handler(req, res) {
  const autoFix = (req.query.fix === "1" || req.query.fix === "true");
  const report = { ts: new Date().toISOString(), autoFix, steps: [] };

  try {
    // 1) ENV VARS
    report.steps.push(checkEnv());

    // 2) DB CONNECTIVITY & SCHEMA (auto-fix if ?fix=1)
    report.steps.push(await ensureSchema(autoFix));

    // 3) ASSET URL reachability (optional)
    report.steps.push(...(await checkAssets()));

    // 4) AI KEY presence (no spend)
    report.steps.push(step(!!process.env.OPENAI_API_KEY, "OPENAI_API_KEY present",
      process.env.OPENAI_API_KEY ? null : "Generator will use fallback"));

    // 5) END-TO-END: generatr → save-game → get-game → play.html
    report.steps.push(...(await runE2E()));

    const ok = report.steps.every(s => s.ok);
    res.status(ok ? 200 : 500).json({ ok, ...report });
  } catch (err) {
    report.steps.push(step(false, "Diag crashed", String(err?.message || err)));
    res.status(500).json({ ok: false, ...report });
  }
}

/* ---------------- helpers ---------------- */

function checkEnv() {
  const missing = [];
  for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE", "PUBLIC_SITE_URL"]) {
    if (!process.env[k]) missing.push(k);
  }
  return missing.length
    ? step(false, "Env vars", `Missing: ${missing.join(", ")}`)
    : step(true, "Env vars");
}

async function ensureSchema(autoFix) {
  // probe table
  const probe = await supabase.from("game_saves").select("id").limit(1);
  if (!probe.error) return step(true, "DB: game_saves ok");

  // auto-fix: call util.ensure_game_schema() (installed via SQL bootstrap)
  if (autoFix) {
    const rpc = await supabase.rpc("ensure_game_schema");
    if (!rpc.error) {
      const again = await supabase.from("game_saves").select("id").limit(1);
      return (!again.error)
        ? step(true, "DB fixed: game_saves ensured", rpc.data || null)
        : step(false, "DB still broken", again.error.message);
    }
    return step(false, "Auto-fix failed", rpc.error.message);
  }

  return step(false, "DB missing/broken", probe.error.message);
}

async function checkAssets() {
  const results = [];
  for (const [label] of [["DEFAULT_SPRITE_URL"], ["DEFAULT_BG_URL"]]) {
    const url = process.env[label];
    if (!url) { results.push(step(true, `Asset: ${label}`, "Not set (ok)")); continue; }
    try {
      const r = await fetch(url, { method: "HEAD" });
      results.push(step(r.ok, `Asset reachable: ${label}`, r.ok ? null : `status=${r.status}`));
    } catch (e) {
      results.push(step(false, `Asset reachable: ${label}`, String(e)));
    }
  }
  return results;
}

async function runE2E() {
  const out = [];

  // 1) generate
  const gen = await postJSON("/api/generatr", { prompt: "diag run: pastel sky slow gravity" });
  if (!gen.ok) { out.push(step(false, "Generate failed", gen.err)); return out; }
  out.push(step(true, "Generate ok", gen.json.engine || "engine:unknown"));

  // 2) save
  const save = await postJSON("/api/save-game", { prompt: gen.json.prompt, game: gen.json });
  if (!save.ok) { out.push(step(false, "Save failed", save.err)); return out; }
  out.push(step(true, "Save ok", save.json.slug));

  // 3) read
  const slug = save.json.slug;
  const read = await getJSON(`/api/get-game?slug=${encodeURIComponent(slug)}`);
  if (!read.ok) { out.push(step(false, "Read failed", read.err)); return out; }
  out.push(step(true, "Read ok"));

  // 4) play page loads (HTML)
  const playUrl = `${SITE}/play.html?slug=${encodeURIComponent(slug)}`;
  try {
    const r = await fetch(playUrl);
    const ok = r.ok && (r.headers.get("content-type") || "").includes("text/html");
    out.push(step(ok, "Play page loads", playUrl));
  } catch (e) {
    out.push(step(false, "Play page loads", String(e)));
  }

  return out;
}

async function postJSON(path, body) {
  try {
    const r = await fetch(abs(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const json = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, json } : { ok: false, err: json?.error || r.statusText };
  } catch (e) {
    return { ok: false, err: String(e) };
  }
}

async function getJSON(path) {
  try {
    const r = await fetch(abs(path));
    const json = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, json } : { ok: false, err: json?.error || r.statusText };
  } catch (e) {
    return { ok: false, err: String(e) };
  }
}

function abs(p) {
  if (p.startsWith("http")) return p;
  if (!SITE) throw new Error("PUBLIC_SITE_URL missing");
  return `${SITE}${p}`;
}
