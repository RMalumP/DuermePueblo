// Comprueba la PWA: manifest, iconos, service worker, caché y arranque sin conexión. Uso: node tests/pwa.js (necesita Playwright + Chromium)
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
let fallos=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c){fallos++;process.exitCode=1;}};
const tipos={'.html':'text/html','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
(async()=>{
  const web=http.createServer((q,r)=>{
    let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));
    if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
    if(!f.startsWith(root)||!fs.existsSync(f)){r.writeHead(404);r.end();return;}
    r.writeHead(200,{'content-type':tipos[path.extname(f)]||'application/octet-stream','service-worker-allowed':'/'});r.end(fs.readFileSync(f));
  }).listen(9322,'127.0.0.1');
  const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
  ok(m.name&&m.short_name&&m.start_url&&m.display==='standalone','manifest con nombre, start_url y display standalone');
  ok(m.icons.some(i=>i.sizes==='192x192')&&m.icons.some(i=>i.sizes==='512x512')&&m.icons.some(i=>i.purpose==='maskable'),'iconos 192, 512 y maskable declarados');
  for(const i of m.icons){const f=path.join(root,i.src);ok(fs.existsSync(f),'existe '+i.src);
    if(i.src.endsWith('.png')){const b=fs.readFileSync(f);const w=b.readUInt32BE(16),h=b.readUInt32BE(20);ok(i.sizes===w+'x'+h,i.src+' mide realmente '+w+'x'+h);}}
  const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
  const ctx=await b.newContext({viewport:{width:400,height:850}});
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
  const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto('http://127.0.0.1:9322/index.html');
  ok(await pg.evaluate(()=>!!document.querySelector('link[rel=manifest]')&&!!document.querySelector('meta[name=theme-color]')&&!!document.querySelector('link[rel=apple-touch-icon]')),'la página enlaza manifest, theme-color y apple-touch-icon');
  const reg=await pg.evaluate(async()=>{const r=await navigator.serviceWorker.ready;return !!r.active;});
  ok(reg,'el service worker se registra y se activa');
  const cached=await pg.evaluate(async()=>{const ks=await caches.keys();const c=await caches.open(ks.find(k=>k.startsWith('aldea-shell')));return (await c.keys()).map(r=>new URL(r.url).pathname);});
  for(const f of ['/index.html','/js/app.js','/js/engine.js','/js/data.js','/js/online.js','/js/transport-peer.js','/manifest.webmanifest','/icons/icon-192.png'])ok(cached.includes(f),'en caché: '+f);
  await pg.reload();await pg.waitForTimeout(500);
  ok(await pg.evaluate(()=>!!navigator.serviceWorker.controller),'la página recargada está controlada por el service worker');
  // sin conexión: la app arranca y el modo local funciona
  await ctx.setOffline(true);
  const off=await ctx.newPage();off.on('pageerror',e=>errs.push('offline: '+e.message));
  await off.goto('http://127.0.0.1:9322/index.html');
  ok(await off.evaluate(()=>document.getElementById('scr-config').classList.contains('active')),'sin conexión: la app abre');
  await off.click('text=▶ Jugar');
  ok(await off.evaluate(()=>document.getElementById('scr-reveal').classList.contains('active')&&game.assigned.length===8),'sin conexión: se puede empezar una partida local');
  await ctx.setOffline(false);
  ok(await pg.evaluate(()=>typeof instalarApp==='function'&&!!document.getElementById('btnInstalar')),'el botón de instalar existe');
  console.log(errs.length?'Errores de JS:\n'+errs.join('\n'):'sin errores de JS');if(errs.length){fallos++;process.exitCode=1;}
  await b.close();web.close();process.exit(fallos?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
