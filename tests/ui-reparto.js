// Requiere Playwright (NODE_PATH con playwright) y Chromium. Uso: node tests/ui-reparto.js
const {chromium}=require('playwright');
const path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:420,height:900}});
  const errs=[];pg.on('pageerror',e=>errs.push('pageerror: '+e.message));
  pg.on('console',m=>{if(m.type()==='error'&&!/net::|Failed to load resource|ERR_/.test(m.text()))errs.push('console: '+m.text());});
  await pg.route(/^https?:\/\//,r=>r.abort());
  await pg.goto('file://'+path.resolve(__dirname,'../index.html'));
  const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
  // nombres con HTML (XSS) y config
  await pg.evaluate(()=>{cfg.names[0]='<img src=x onerror="window.__xss=1">';cfg.optional.cazador=true;cfg.optional.cupido=true;cfg.optional.borracho=true;cfg.narrator='random';renderRoles();});
  await pg.click('text=▶ Jugar');
  ok(await pg.evaluate(()=>document.getElementById('scr-reveal').classList.contains('active')),'pantalla de reparto');
  const n=await pg.evaluate(()=>game.revealList.length);ok(n===8,'8 jugadores ven carta (narrador por carta incluido): '+n);
  // recorrer el reparto: ver / ocultar
  for(let i=0;i<n;i++){
    await pg.click('#rvNext');
    ok(await pg.evaluate(()=>game.reveal.flipped),'carta '+(i+1)+' volteada');
    if(i<n-1){await pg.click('#rvNext');await pg.waitForTimeout(520);}
  }
  ok(await pg.isVisible('#rvStart'),'botón comenzar visible al ver la última carta');
  ok(await pg.evaluate(()=>window.__xss===undefined),'sin XSS por nombres');
  await pg.click('#rvStart');
  ok(await pg.evaluate(()=>document.getElementById('scr-game').classList.contains('active')),'pantalla de partida');
  const cards=await pg.locator('#deathGrid .pm').count();ok(cards===7,'el narrador no aparece entre los jugadores ('+cards+')');
  // montar un caso: Cazador + enamorados
  await pg.evaluate(()=>{const a=game.assigned.filter(p=>!p.isNar);a.forEach(p=>{p.roles=['aldeano'];p.amor=false;p.lobo=false;});
    a[0].roles=['lobo'];a[1].roles=['lobo'];a[2].roles=['cazador'];a[3].roles=['aldeano'];a[2].amor=true;a[3].amor=true;refreshGameUI();window.__ids=a.map(p=>p.idx);});
  // linchar a la pareja (a[3]) -> a[2] Cazador muere de pena -> modal Cazador
  const idxs=await pg.evaluate(()=>window.__ids);
  await pg.locator('#deathGrid .pm').nth(3).click();
  await pg.click('#saVoto');
  await pg.waitForSelector('#cazadorModal.open',{timeout:2000}).then(()=>ok(true,'modal del Cazador por pena de Enamorado'),()=>ok(false,'modal del Cazador por pena de Enamorado'));
  ok(await pg.evaluate(()=>game.assigned.filter(p=>!p.isNar)[2].vivo===false),'el Cazador murió de pena');
  // el Cazador mata a un lobo
  await pg.locator('#cazadorGrid .alg-player').first().click();
  ok(await pg.evaluate(()=>game.pending.length===0),'sin pendientes tras disparar');
  ok(await pg.evaluate(()=>!game.winner),'no gana nadie con 1 lobo y aldeanos vivos');
  // matar al último lobo y al resto
  await pg.evaluate(()=>{const a=game.assigned.filter(p=>!p.isNar&&p.vivo);a.forEach(p=>{if(p.roles[0]==='lobo')p.roles=['aldeano'];});afterAct();});
  ok(await pg.evaluate(()=>game.winner&&game.winner.t==='Los Aldeanos ganan'),'victoria de la aldea detectada');
  // revivir anula el ganador
  await pg.evaluate(()=>{game.assigned.find(p=>!p.isNar&&p.vivo).roles=['lobo'];afterAct();});
  ok(await pg.evaluate(()=>game.winner===null),'ganador se recalcula (ya no gana la aldea)');
  // Borracho: muerte de noche no gana
  await pg.evaluate(()=>{const a=game.assigned.filter(p=>!p.isNar);a.forEach(p=>{p.vivo=true;p.roles=['aldeano'];p.amor=false;});a[0].roles=['lobo'];a[4].roles=['borracho'];game.borrachoWin=null;game.night=1;game.pending=[];afterAct();});
  await pg.locator('#deathGrid .pm').nth(4).click();await pg.click('#saNoche');
  ok(await pg.evaluate(()=>!game.winner),'Borracho muerto de noche NO gana');
  await pg.locator('#deathGrid .pm').nth(4).click();await pg.click('#saRev');
  await pg.locator('#deathGrid .pm').nth(4).click();await pg.click('#saVoto');
  ok(await pg.evaluate(()=>game.winner&&game.winner.t==='El Borracho gana'),'Borracho linchado el día 1 gana');
  // Insignia: sucesión
  await pg.evaluate(()=>{const a=game.assigned.filter(p=>!p.isNar);a.forEach(p=>{p.vivo=true;p.insignia=false;});a[5].insignia=true;game.borrachoWin=null;game.pending=[];a[4].roles=['aldeano'];afterAct();});
  await pg.locator('#deathGrid .pm').nth(5).click();await pg.click('#saNoche');
  await pg.waitForSelector('#alguacilModal.open',{timeout:2000}).then(()=>ok(true,'modal de sucesión de la Insignia'),()=>ok(false,'modal de sucesión de la Insignia'));
  await pg.locator('#alguacilList .alg-player').first().click();
  ok(await pg.evaluate(()=>game.pending.length===0&&game.assigned.some(p=>p.insignia)),'sucesor nombrado');
  console.log(errs.length?errs.join('\n'):'sin errores de JS');
  if(errs.length)process.exitCode=1;
  
  await b.close();
})();
