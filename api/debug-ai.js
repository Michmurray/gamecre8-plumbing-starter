// api/debug-ai.js — simple env echo for diagnostics.
module.exports = async (req, res) => {
  const mask = (k) => (!k ? null : (k.length < 8 ? k : `${k.slice(0,4)}…${k.slice(-4)}`));
  return res.status(200).json({
    ok: true,
    env: {
      ASSETS_SOURCE: process.env.ASSETS_SOURCE || null,
      SUPABASE_URL: process.env.SUPABASE_URL || null,
      SUPABASE_ANON_KEY: mask(process.env.SUPABASE_ANON_KEY || ''),
      SUPABASE_BUCKET: process.env.SUPABASE_BUCKET || null,
      SPRITES_PREFIX: process.env.SPRITES_PREFIX || null,
      BACKGROUNDS_PREFIX: process.env.BACKGROUNDS_PREFIX || null
    }
  });
};
