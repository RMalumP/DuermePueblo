// Requiere Playwright (NODE_PATH con playwright) y Chromium. Uso: node tests/ui-noche.js
const {chromium}=require('playwright');
const path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:420,height:1000}});
  const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  await pg.route(/^https?:\/\//,r=>r.abort());
  pg.on('dialog',d=>d.accept());
  await pg.goto('file://'+path.resolve(__dirname,'../index.html'));
  const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
  await pg.evaluate(()=>{cfg.mode=2;cfg.narrator='none';cfg.optional.vidente=true;cfg.optional.bruja=true;cfg.optional.policia=true;renderRoles();});
  await pg.click('text=▶ Jugar');
  // Montar roles a medida y entrar al modo guiado
  await pg.evaluate(()=>{
    const roles=['loboAlfa','lobo','bruja','vidente','aldeano','aldeano','policia','aldeano'];
    game.assigned.forEach((p,i)=>{p.roles=[roles[i]];});game.deck=roles.slice();game.initialWolves=2;
    show('scr-guided');game.stepIdx=0;renderStep();renderPlayersMini();
  });
  const goTo=async t=>{for(let i=0;i<40;i++){if((await pg.textContent('#stTitle')).includes(t))return true;await pg.click('#scr-guided .nav-steps .btn-primary');}return false;};
  const pickIn=async(label,name)=>{ // pulsa al jugador `name` dentro del bloque cuyo rótulo contiene `label`
    const block=pg.locator('#extraStepUI > div',{has:pg.locator('.pk-label',{hasText:label})}).first();
    await block.locator('.pm',{hasText:name}).first().click();
  };
  ok(await goTo('La manada'),'llega a la manada');
  await pickIn('Víctima de la manada','Jugador 5');
  ok(await pg.evaluate(()=>game.acts.manada===4),'víctima de la manada elegida');
  ok(await pg.locator('#extraStepUI .pm',{hasText:'Jugador 2'}).count()===0,'los lobos no aparecen como víctima posible');
  ok(await goTo('Bruja'),'llega a la Bruja');
  ok((await pg.textContent('#extraStepUI')).includes('Jugador 5'),'la Bruja ve a la víctima');
  await pickIn('Poción de muerte','Jugador 6');
  ok(await pg.evaluate(()=>game.acts.brujaVeneno===5),'veneno elegido');
  ok(await goTo('Vidente'),'llega a la Vidente');
  await pickIn('Jugador que mira','Jugador 2');
  ok((await pg.textContent('#extraStepUI')).includes('LOBO'),'la Vidente ve LOBO');
  ok(await goTo('Policía'),'llega al Policía');
  await pickIn('Arrestar','Jugador 8');
  await pickIn('inmunidad','Jugador 7');
  ok(await goTo('El pueblo despierta'),'llega al despertar');
  await pg.click('text=Resolver la noche');
  const est=await pg.evaluate(()=>({m:game.assigned.map(p=>p.vivo),pre:game.assigned[7].preso,inm:game.assigned[6].inmune}));
  ok(!est.m[4]&&!est.m[5]&&est.m.filter(x=>!x).length===2,'mueren el devorado y el envenenado');
  ok(est.pre&&est.inm,'arrestado e inmune marcados');
  const txt=await pg.textContent('#extraStepUI');
  ok(txt.includes('ha muerto')&&txt.includes('arrestado')&&!/devorad|veneno|lobos/i.test(txt.split('Solo para ti')[0]),'el anuncio no explica causas');
  ok(await goTo('Votación'),'llega a la votación');
  await pg.click('text=Abrir la votación');
  ok(await pg.locator('#voteBody .vote-row.blocked').count()===1,'el inmune aparece bloqueado');
  const fila=pg.locator('#voteBody .vote-row',{hasText:'Jugador 2'});
  await fila.locator('button',{hasText:'+'}).click();await fila.locator('button',{hasText:'+'}).click();
  await pg.click('text=Linchar a Jugador 2');
  ok(await pg.evaluate(()=>!game.assigned[1].vivo&&game.lastLynched===1),'el más votado es linchado');
  ok(await pg.evaluate(()=>game.winner===null),'la partida sigue (queda el Alfa)');
  // siguiente noche: se limpian arresto e inmunidad y la Bruja ya gastó la poción de muerte
  ok(await goTo('El pueblo se duerme'),'llega a dormir');
  await pg.click('#scr-guided .nav-steps .btn-primary');
  ok(await pg.evaluate(()=>game.night===2&&!game.assigned[7].preso&&!game.assigned[6].inmune&&game.brujaMuerteUsada===true),'noche 2: flags limpios y poción gastada');
  ok(await goTo('Bruja'),'noche 2: llega a la Bruja');
  ok((await pg.textContent('#extraStepUI')).includes('Poción de muerte ya usada'),'noche 2: la Bruja no puede envenenar otra vez');
  console.log(errs.length?errs.join('\n'):'sin errores de JS');if(errs.length)process.exitCode=1;
  await b.close();
})();
