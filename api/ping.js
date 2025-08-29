module.exports = (req, res) => {
  res.status(200).json({
    ok: true,
    node: process.versions.node,
    runtime_hint: typeof require === 'function' ? 'node' : 'edge',
    env_seen: {
      ASSETS_SOURCE: process.env.ASSETS_SOURCE || null,
      SUPABASE_URL: process.env.SUPABASE_URL ? "set" : "missing",
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? "set" : "missing",
      SUPABASE_BUCKET: process.env.SUPABASE_BUCKET || null,
      SPRITES_PREFIX: process.env.SPRITES_PREFIX || null,
      BACKGROUNDS_PREFIX: process.env.BACKGROUNDS_PREFIX || null
    }
  });
};
