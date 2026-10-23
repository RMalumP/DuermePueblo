// Puntuación al terminar, ajustes manuales y marcador acumulado. Uso: node tests/ui-puntos.js (Playwright + Chromium)
const {chromium}=require('playwright');
const path=require('path');
let fallos=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c){fallos++;process.exitCode=1;}};
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:400,height:900}});
  const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('dialog',d=>d.accept());
  await pg.route(/^https?:\/\//,r=>r.abort());
  await pg.goto('file://'+path.resolve(__dirname,'../index.html'));
  await pg.evaluate(()=>{cfg.narrator='none';cfg.narratorEnabled=false;cfg.optional.cazador=true;aplicarCfgUI();});
  await pg.click('text=▶ Jugar');
  await pg.evaluate(()=>{
    const r=['cazador','aldeano','aldeano','lobo','aldeano','aldeano','aldeano','aldeano'];
    game.assigned.forEach((p,i)=>{p.roles=[r[i]];p.name=['Ana','Beto','Carla','Dani','Eva','Fer','Gus','Hugo'][i];});
    game.deck=r.slice();game.initialWolves=1;show('scr-game');renderGameInfo();
    Engine.kill(game,0,'noche');Engine.resolvePending(game,'cazador',3);   // el Cazador se lleva al lobo: +5
    afterAct();
  });
  await pg.click('text=🏁 Fin');
  ok((await pg.textContent('#finBody')).includes('Los Aldeanos ganan'),'el cartel de victoria de la aldea');
  const txt=await pg.textContent('#puntosBox');
  ok(txt.includes('Puntuación')&&txt.includes('Ana')&&txt.includes('Beto'),'aparece la tabla de puntuación');
  const t=await pg.evaluate(()=>Object.fromEntries(Engine.puntuar(game,Engine.checkWin(game)).map(r=>[r.name,r.total])));
  ok(t.Ana===7&&t.Beto===3&&t.Dani===0,'Cazador muerto con un lobo = 5+2, aldeano vivo = 3, lobo muerto cuando gana la aldea = 0 ('+JSON.stringify(t)+')');
  await pg.locator('#puntosBox .res-row',{hasText:'Beto'}).locator('button',{hasText:'+'}).click();
  ok(await pg.evaluate(()=>game.ajustes[1]===1),'el botón + ajusta los puntos');
  ok((await pg.textContent('#puntosBox')).includes('ajuste manual'),'el ajuste aparece en el detalle');
  await pg.click('text=➕ Sumar al marcador');
  ok(await pg.evaluate(()=>game.sumado&&leerMarcador().partidas===1&&leerMarcador().tot.Beto===4),'se suma al marcador (Beto 4)');
  ok(await pg.isDisabled('#puntosBox button:has-text("Sumado al marcador")'),'no se puede sumar dos veces');
  await pg.evaluate(()=>{closeFinModal();show('scr-config');});
  await pg.click('text=🏆 Marcador');
  ok((await pg.textContent('#marcadorBody')).includes('Beto')&&(await pg.textContent('#marcadorBody')).includes('4'),'el marcador muestra a Beto con 4');
  await pg.click('text=Borrar el marcador');
  ok(await pg.evaluate(()=>leerMarcador().partidas===0),'se puede borrar el marcador');
  console.log(errs.length?'Errores de JS:\n'+errs.join('\n'):'sin errores de JS');if(errs.length){fallos++;process.exitCode=1;}
  await b.close();process.exit(fallos?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
