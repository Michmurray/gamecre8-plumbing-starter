// api/_assets.js
import { createClient } from "@supabase/supabase-js";

const BUCKET = "game-assets";
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false }
});

// List of folders we'll scan for sprites (add/remove as you like)
const SPRITE_PREFIXES = ["Spritesheet", "sprite", "Sprites", "PNG"];
const BG_PREFIXES = ["Backgrounds"];

export async function buildManifest() {
  const sprites = await listMany(SPRITE_PREFIXES);
  const bgs     = await listMany(BG_PREFIXES);

  const spriteAssets = sprites
    .filter(isImage)
    .map((p) => toAsset("sprite", p));
  const bgAssets = bgs
    .filter(isImage)
    .map((p) => toAsset("background", p));

  return {
    generatedAt: new Date().toISOString(),
    sprites: spriteAssets,
    backgrounds: bgAssets,
  };
}

function isImage(p) {
  return /\.(png|jpg|jpeg|gif|webp)$/i.test(p);
}

function toAsset(kind, path) {
  const parts = path.split("/").map(s => s.toLowerCase());
  const name = parts[parts.length - 1].replace(/\.[^.]+$/, "");
  const words = [
    ...parts,
    ...name.split(/[\s_\-]+/).map(s => s.toLowerCase())
  ];

  const tags = Array.from(new Set(
    words.map(normalizeTag)
        .filter(Boolean)
  ));

  return { kind, path, url: path, name, tags };
}

function normalizeTag(t) {
  t = t.replace(/[^a-z0-9]/g, "");
  if (!t) return null;
  if (t === "spaceship") t = "ship";
  if (t === "bg" || t === "backgrounds") t = "background";
  if (t === "spritesheet") return null;
  return t;
}

async function listMany(prefixes) {
  const all = [];
  for (const p of prefixes) {
    const items = await listRecursive(p);
    all.push(...items);
  }
  // de-dup
  return Array.from(new Set(all));
}

async function listRecursive(prefix) {
  const out = [];
  await walk(prefix, out);
  return out;
}

async function walk(prefix, out) {
  const { data, error } = await db.storage.from(BUCKET).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" }
  });
  if (error || !data) return;
  for (const item of data) {
    const isFolder = !item.metadata || typeof item.metadata.size !== "number";
    if (isFolder) {
      await walk(`${prefix}/${item.name}`, out);
    } else {
      out.push(`${prefix}/${item.name}`);
    }
  }
}

export function pickBest(assets, wantTags) {
  if (!assets.length) return null;
  const scored = assets.map(a => ({ a, s: score(a.tags, wantTags) }));
  scored.sort((x, y) => y.s - x.s);
  return (scored[0].s > 0) ? scored[0].a : assets[Math.floor(Math.random() * assets.length)];
}

function score(haveTags, wantTags) {
  let s = 0;
  for (const w of wantTags) {
    for (const h of haveTags) {
      if (h === w) s += 3;
      else if (h.includes(w) || w.includes(h)) s += 1;
    }
  }
  return s;
}
