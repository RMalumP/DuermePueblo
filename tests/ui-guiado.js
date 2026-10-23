// Requiere Playwright (NODE_PATH con playwright) y Chromium. Uso: node tests/ui-guiado.js
const {chromium}=require('playwright');
const path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:420,height:900}});
  const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  await pg.route(/^https?:\/\//,r=>r.abort());
  await pg.goto('file://'+path.resolve(__dirname,'../pueblo_duerme_2.html'));
  const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
  for(const lm of ['externo','intercambio']){
    await pg.evaluate(m=>{show('scr-config');cfg.optional.ladron=true;cfg.ladronMode=m;cfg.optional.policia=true;cfg.optional.vidente=true;cfg.narrator='random';cfg.mode=2;renderRoles();},lm);
    await pg.click('text=▶ Jugar');
    const n=await pg.evaluate(()=>game.revealList.length);
    for(let i=0;i<n;i++){await pg.click('#rvNext');if(i<n-1){await pg.click('#rvNext');await pg.waitForTimeout(500);}}
    await pg.click('#rvStart');
    ok(await pg.evaluate(()=>document.getElementById('scr-guided').classList.contains('active')),lm+': pantalla guiada');
    // avanzar pasos hasta el Ladrón y resolverlo
    const ladronHolder=await pg.evaluate(()=>!!Engine.ladronPlayer(game));
    for(let i=0;i<4;i++){
      if(await pg.isVisible('#ladronModal.open')){
        if(lm==='externo'){await pg.locator('#ladronBody .lad-card').first().click();}
        else{await pg.locator('#ladronBody .pm').first().click();}
      }else{await pg.click('#scr-guided .nav-steps .btn-primary');await pg.waitForTimeout(500);}
    }
    ok(await pg.evaluate(()=>game.ladronChosen),lm+': Ladrón resuelto (titular='+ladronHolder+')');
    // recorrer toda la noche 1 hasta pasar a la noche 2
    await pg.evaluate(()=>{game.assigned.forEach(p=>{p.inmune=true;});});
    for(let i=0;i<40&&(await pg.evaluate(()=>game.night))===1;i++){
      if(await pg.isVisible('#ladronModal.open'))await pg.evaluate(()=>closeLadronModal());
      await pg.click('#scr-guided .nav-steps .btn-primary');
    }
    ok(await pg.evaluate(()=>game.night===2&&game.day===1&&game.assigned.every(p=>!p.inmune)),lm+': pasa a noche 2 y se limpia la inmunidad');
  }
  console.log(errs.length?errs.join('\n'):'sin errores de JS');if(errs.length)process.exitCode=1;
  await b.close();
})();
