// api/seed-demo.js
// Bulk-create demo games: generates -> saves -> returns slugs.
// Use GET for default prompts or POST with your own {prompts:[], useOlli:boolean}

const SITE = process.env.PUBLIC_SITE_URL;

export default async function handler(req, res) {
  try {
    const useOlli = req.method === "POST"
      ? !!(await readBody(req)).useOlli
      : true;

    const prompts = req.method === "POST"
      ? (await readBody(req)).prompts || []
      : defaultPrompts();

    if (!prompts.length) return res.status(400).json({ error: "No prompts supplied" });

    const results = [];
    // simple concurrency limit
    const chunkSize = 3;
    for (let i = 0; i < prompts.length; i += chunkSize) {
      const batch = prompts.slice(i, i + chunkSize).map(p => createOne(p, useOlli));
      const settled = await Promise.allSettled(batch);
      settled.forEach(r => results.push(r.status === "fulfilled" ? r.value : { ok:false, error:String(r.reason) }));
    }

    const created = results.filter(r => r.ok);
    const failed  = results.filter(r => !r.ok);
    res.status(created.length ? 200 : 500).json({ ok: failed.length === 0, created, failed });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e) });
  }
}

async function createOne(prompt, useOlli) {
  // 1) (optional) Olli brief
  let brief = null;
  if (useOlli) {
    try {
      const r = await fetch(abs("/api/olli-brief"), {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ answers: { theme: prompt, vibe: "", pace: "medium", jump: "normal", goal: "" } })
      });
      brief = await r.json();
    } catch {}
  }

  // 2) Generate
  const genRes = await fetch(abs("/api/generatr"), {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(brief ? { prompt, brief } : { prompt })
  });
  const game = await genRes.json();
  if (!genRes.ok) throw new Error(game.error || "generate failed");

  // 3) Save (store engine/brief too)
  const saveRes = await fetch(abs("/api/save-game"), {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ prompt: game.prompt, game, engine: game.engine || null, brief })
  });
  const saved = await saveRes.json();
  if (!saveRes.ok) throw new Error(saved.error || "save failed");

  return { ok:true, prompt, slug: saved.slug, engine: game.engine || "unknown" };
}

function defaultPrompts() {
  return [
    "pastel cloud jumper",
    "galaxy defense blaster",
    "forest fox runner",
    "lava cavern escape",
    "retro neon city dash",
    "underwater coral surfer",
    "ice peak slider",
    "desert dune hop",
    "candy land bouncer",
    "cyber grid dodger",
    "pumpkin patch jumper",
    "space minefield drift",
    "sky island glide",
    "haunted mist runner",
    "jungle vine swing"
  ];
}

async function readBody(req) {
  const bufs = [];
  for await (const chunk of req) bufs.push(chunk);
  try { return JSON.parse(Buffer.concat(bufs).toString("utf8") || "{}"); }
  catch { return {}; }
}
function abs(p){ return p.startsWith("http") ? p : `${SITE}${p}`; }
