// api/play.js
export default async function handler(req, res) {
  // Fast OK for health/probing
  if (req.method === 'HEAD') return res.status(200).end();

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>GameCre8 — Play</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:24px;background:#0b0c10;color:#eaeaf0}
    #canvas{width:960px;max-width:100%;height:540px;background:#1a1a1d;border-radius:16px;display:block}
    .thumbs img{border-radius:8px}
  </style>
</head>
<body>
  <h1>Play</h1>
  <div id="status">Loading…</div>
  <canvas id="canvas" width="960" height="540"></canvas>
  <div style="margin:8px 0">Prompt: <span id="promptText"></span></div>
  <div class="thumbs" id="chosenAssets" style="display:flex;gap:12px;align-items:center"></div>

  <script>
  (async () => {
    const params = new URLSearchParams(location.search);
    const slug = params.get('slug');
    const statusEl = document.getElementById('status');
    const outPrompt = document.getElementById('promptText');
    const outAssets = document.getElementById('chosenAssets');
    const cvs = document.getElementById('canvas');
    const ctx = cvs.getContext('2d'); ctx.imageSmoothingEnabled = false;

    if (!slug) { statusEl.textContent = 'Missing slug'; return; }

    try {
      const r = await fetch('/api/get-game?slug=' + encodeURIComponent(slug));
      const j = await r.json();
      if (!j.ok) { statusEl.textContent = 'Error: ' + (j.error || 'Not found'); return; }
      statusEl.textContent = 'Loaded!';
      outPrompt.textContent = j.game?.prompt || '(unknown)';

      outAssets.innerHTML = '';
      if (j.asset_urls?.background_url) { const bg = new Image(); bg.src = j.asset_urls.background_url; bg.width = 96; outAssets.appendChild(bg); }
      if (j.asset_urls?.sprite_url) { const sp = new Image(); sp.src = j.asset_urls.sprite_url; sp.width = 64; outAssets.appendChild(sp); }

      const bgImg = j.asset_urls?.background_url ? await new Promise((ok,err)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>ok(i);i.onerror=err;i.src=j.asset_urls.background_url;}) : null;
      const spImg = j.asset_urls?.sprite_url ? await new Promise((ok,err)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>ok(i);i.onerror=err;i.src=j.asset_urls.sprite_url;}) : null;

      function draw() {
        if (bgImg) ctx.drawImage(bgImg, 0, 0, cvs.width, cvs.height); else { ctx.fillStyle='#1a1a1d'; ctx.fillRect(0,0,cvs.width,cvs.height); }
        const t = performance.now()/800, x = 60 + Math.sin(t)*120, y = 380 + Math.sin(t*2)*10;
        if (spImg) ctx.drawImage(spImg, x, y, 64, 64); else { ctx.fillStyle='#4ab3ff'; ctx.fillRect(x,y,64,64); }
        requestAnimationFrame(draw);
      }
      draw();
    } catch (e) {
      statusEl.textContent = 'Error: ' + (e.message || e);
    }
  })();
  </script>
</body>
</html>`);
}
