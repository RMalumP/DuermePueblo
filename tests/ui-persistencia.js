// La configuración y la partida local sobreviven a recargar o reabrir la app. Uso: node tests/ui-persistencia.js (Playwright + Chromium)
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
    r.writeHead(200,{'content-type':tipos[path.extname(f)]||'application/octet-stream'});r.end(fs.readFileSync(f));
  }).listen(9332,'127.0.0.1');
  const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
  const ctx=await b.newContext({viewport:{width:400,height:900}});
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
  const errs=[];
  const abrir=async()=>{const pg=await ctx.newPage();pg.on('pageerror',e=>errs.push(e.message));pg.on('dialog',d=>d.accept());await pg.goto('http://127.0.0.1:9332/index.html');return pg;};
  const reabrir=async pg=>{await pg.evaluate(()=>guardarEstado());await pg.close();return abrir();};
  const activa=(pg,id)=>pg.evaluate(id=>document.getElementById(id).classList.contains('active'),id);

  let pg=await abrir();
  // 1) configuración
  await pg.evaluate(()=>{changePlayers(1);changePlayers(1);changeWolves(1);});          // 10 jugadores, 3 lobos
  await pg.click('#rolesCollap > .head');
  await pg.locator('.role-chk',{hasText:'Vidente'}).click();
  await pg.locator('.role-chk',{hasText:'Cupido'}).click();
  await pg.click('#mode2');
  await pg.click('#narToggle');
  await pg.click('#btnNinaRemota');
  await pg.evaluate(()=>{const i=document.querySelector('#namesBox input');i.value='Ana';i.dispatchEvent(new Event('input'));});
  pg=await reabrir(pg);
  const c=await pg.evaluate(()=>({p:cfg.players,w:cfg.wolves,v:cfg.optional.vidente,cu:cfg.optional.cupido,m:cfg.mode,ne:cfg.narratorEnabled,nr:cfg.ninaRemota,n0:cfg.names[0]}));
  ok(c.p===10&&c.w===3&&c.v&&c.cu&&c.m===2&&!c.ne&&c.nr&&c.n0==='Ana','la configuración se conserva en cfg tras reabrir');
  ok(await pg.evaluate(()=>document.getElementById('numPlayers').textContent==='10'&&document.getElementById('numWolves').textContent==='3'),'los contadores muestran 10 jugadores y 3 lobos');
  ok(await pg.evaluate(()=>document.getElementById('mode2').classList.contains('on')&&!document.getElementById('mode1').classList.contains('on')),'el modo guiado sigue marcado');
  ok(await pg.evaluate(()=>document.getElementById('narToggle').classList.contains('off')&&document.getElementById('narToggle').textContent.includes('SIN narrador')),'«sin narrador» sigue activo');
  ok(await pg.evaluate(()=>document.querySelector('#namesBox input').value==='Ana'),'el nombre escrito sigue ahí');
  ok(await pg.evaluate(()=>document.getElementById('btnNinaRemota').classList.contains('on')),'la Niña a distancia sigue activada');
  ok(await pg.evaluate(()=>[...document.querySelectorAll('.role-chk.on .rn')].map(e=>e.textContent).join().includes('Vidente')),'las cartas elegidas siguen marcadas');

  // 2) reparto a medias
  await pg.evaluate(()=>{cfg.narratorEnabled=true;cfg.narrator='random';aplicarCfgUI();});
  await pg.click('text=▶ Jugar');
  for(let i=0;i<2;i++){await pg.click('#rvNext');await pg.click('#rvNext');await pg.waitForTimeout(520);}
  const antes=await pg.evaluate(()=>({roles:JSON.stringify(game.assigned.map(p=>p.roles)),idx:game.reveal.idx}));
  pg=await reabrir(pg);
  ok(await activa(pg,'scr-reveal'),'tras recargar sigue el reparto de cartas');
  const desp=await pg.evaluate(()=>({roles:JSON.stringify(game.assigned.map(p=>p.roles)),idx:game.reveal.idx,flip:game.reveal.flipped}));
  ok(desp.roles===antes.roles,'las cartas repartidas son las mismas');
  ok(desp.idx===antes.idx&&desp.flip===false,'continúa por el mismo jugador y con la carta tapada ('+desp.idx+')');
  ok((await pg.textContent('#rvName'))===(await pg.evaluate(()=>game.revealList[game.reveal.idx].name)),'se muestra el nombre del jugador que toca');

  // 3) modo guiado con progreso, muerte y Cazador pendiente
  await pg.evaluate(()=>{game.assigned.filter(p=>!p.isNar).forEach((p,k)=>{p.roles=[k===0?'lobo':(k===1?'cazador':'aldeano')];});game.deck=['lobo','cazador','aldeano','vidente','cupido'];game.initialWolves=1;show('scr-guided');game.stepIdx=0;renderStep();renderPlayersMini();});
  for(let i=0;i<3;i++)await pg.click('#scr-guided .nav-steps .btn-primary');
  const paso=await pg.evaluate(()=>game.stepIdx);
  await pg.evaluate(()=>{const n=game.assigned.filter(p=>!p.isNar);Engine.kill(game,n[1].idx,'noche');afterAct();}); // muere el Cazador: queda el disparo pendiente
  ok(await pg.evaluate(()=>document.getElementById('cazadorModal').classList.contains('open')),'el Cazador pide su disparo');
  pg=await reabrir(pg);
  ok(await activa(pg,'scr-guided'),'tras recargar sigue el modo guiado');
  ok(await pg.evaluate(p=>game.stepIdx===p,paso),'en el mismo paso ('+paso+')');
  ok(await pg.evaluate(()=>game.assigned.filter(p=>!p.vivo).length>=1),'las muertes se conservan');
  ok(await pg.evaluate(()=>document.getElementById('cazadorModal').classList.contains('open')),'el disparo pendiente del Cazador vuelve a abrirse');
  await pg.locator('#cazadorGrid .alg-player').first().click();
  // 4) victoria
  await pg.evaluate(()=>{game.assigned.filter(p=>Engine.isWolf(p)&&p.vivo).forEach(p=>Engine.kill(game,p.idx,'voto'));afterAct();});
  ok(await pg.evaluate(()=>!!game.winner),'hay un ganador');
  pg=await reabrir(pg);
  ok(await pg.evaluate(()=>document.getElementById('winBanner2').classList.contains('show')),'el cartel de victoria sigue visible');
  // 5) volver al inicio borra la partida
  await pg.evaluate(()=>confirmHome());
  pg=await reabrir(pg);
  ok(await activa(pg,'scr-config'),'tras volver al inicio y recargar se abre la configuración');
  ok(await pg.evaluate(()=>!game.assigned.length),'ya no hay partida guardada');
  ok(await pg.evaluate(()=>cfg.players===10&&cfg.mode===2),'pero la configuración sigue');
  console.log(errs.length?'Errores de JS:\n'+errs.join('\n'):'sin errores de JS');if(errs.length){fallos++;process.exitCode=1;}
  await b.close();web.close();process.exit(fallos?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
