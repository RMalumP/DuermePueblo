// Narrador humano + 5 móviles con «acciones desde los móviles»: noche y votación respondidas en cada teléfono.
// Requiere (con NODE_PATH): playwright, peer, peerjs. Uso: node tests/ui-moviles.js
const {chromium}=require('playwright');
const {PeerServer}=require('peer');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const PEERJS=fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let fallos=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c){fallos++;process.exitCode=1;}};
const until=async(fn,ms=20000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await fn())return true;}catch(e){/* reintenta */}await wait(250);}return false;};
(async()=>{
  const ps=PeerServer({port:9341,path:'/pueblo',host:'127.0.0.1'});
  const web=http.createServer((q,r)=>{
    let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));
    if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
    if(!f.startsWith(root)||!fs.existsSync(f)){r.writeHead(404);r.end();return;}
    r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(fs.readFileSync(f));
  }).listen(9342,'127.0.0.1');
  const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--disable-features=WebRtcHideLocalIpsWithMdns']});
  const errs=[];
  const nueva=async(n)=>{
    const ctx=await b.newContext({viewport:{width:400,height:900}});
    await ctx.route(/cdn\.jsdelivr\.net|unpkg\.com|fonts\.g|aaldeiadormece|steamusercontent/,r=>/peerjs/.test(r.request().url())?r.fulfill({contentType:'text/javascript',body:PEERJS}):r.abort());
    await ctx.addInitScript(()=>{window.PUEBLO_TURN_PROXY='';window.PUEBLO_PEER_SERVER={host:'127.0.0.1',port:9341,path:'/pueblo',secure:false};});
    const pg=await ctx.newPage();pg.on('pageerror',e=>errs.push(n+': '+e.message));
    pg.on('dialog',d=>d.accept(d.type()==='prompt'?d.defaultValue():undefined));
    await pg.goto('http://127.0.0.1:9342/index.html');return{ctx,pg};
  };
  const entrar=async(pg,nombre,modo)=>{await pg.click('text=🌐 Jugar online');await pg.fill('#olName',nombre);await pg.fill('#olRoom','Sala moviles');await pg.fill('#olPass','clave1');await pg.click(modo==='crear'?'#olCrear':'#olUnir');};
  const activa=(pg,id)=>pg.evaluate(id=>document.getElementById(id).classList.contains('active'),id);

  const H=await nueva('host');await entrar(H.pg,'Narrador','crear');
  ok(await until(()=>activa(H.pg,'scr-lobby')),'el narrador crea la sala');
  const P=[];for(let i=1;i<=5;i++){const x=await nueva('P'+i);P.push(x);await entrar(x.pg,'Jug'+i,'unir');}
  ok(await until(async()=>(await H.pg.locator('#lbList .alg-player').count())===6),'entran los 5 jugadores');
  // opciones: acciones desde los móviles + Bruja y Vidente
  await H.pg.click('#lbOpts > .head');
  await H.pg.click('#lbOptsBody #btnAccionesMovil');
  await H.pg.click('#lbOptsBody #rolesCollap > .head');
  await H.pg.locator('#lbOptsBody .role-chk').filter({has:H.pg.locator('.rn',{hasText:/^Vidente$/})}).click();
  await H.pg.locator('#lbOptsBody .role-chk').filter({has:H.pg.locator('.rn',{hasText:/^Bruja$/})}).click();
  ok(await H.pg.evaluate(()=>cfg.accionesMovil&&cfg.mode===2&&cfg.optional.vidente&&cfg.optional.bruja),'acciones en móviles activadas (modo guiado) con Vidente y Bruja');
  await H.pg.click('#lbStart');
  ok(await until(()=>activa(H.pg,'scr-guided')),'empieza la partida guiada');
  // reparto a medida: 0 lobo, 1 vidente, 2 bruja, 3-4 aldeanos
  await H.pg.evaluate(()=>{const r=['lobo','vidente','bruja','aldeano','aldeano'];game.assigned.forEach((p,i)=>{p.roles=[r[i]];});game.deck=r.slice();game.initialWolves=1;game.pasoKey=null;Online.sync(true);renderStep();});
  const pids=[];for(const x of P)pids.push(await x.pg.evaluate(()=>Online._estado.uid));
  const pidSeat=await H.pg.evaluate(()=>game.assigned.map(p=>p.pid));
  const ph=s=>P[pids.indexOf(pidSeat[s])];
  const irA=async t=>{for(let i=0;i<30&&!(await H.pg.textContent('#stTitle')).includes(t);i++)await H.pg.click('#scr-guided .nav-steps .btn-primary');return (await H.pg.textContent('#stTitle')).includes(t);};
  const elegir=async(x,txt)=>{await x.pg.locator('#pjAccion .pm',{hasText:txt}).first().click();};
  const confirmar=async x=>x.pg.click('#pjAccion button:has-text("Confirmar")');

  // manada
  ok(await irA('La manada'),'el narrador llega a la manada');
  ok(await until(()=>ph(0).pg.isVisible('#pjAccion')),'el lobo recibe su pregunta en el móvil');
  ok(!(await ph(3).pg.isVisible('#pjAccion')),'los aldeanos no reciben nada');
  ok((await ph(0).pg.textContent('#pjAccion')).includes('La manada'),'la pregunta es de la manada');
  await elegir(ph(0),await H.pg.evaluate(()=>game.assigned[3].name));
  await confirmar(ph(0));
  ok(await until(()=>H.pg.evaluate(()=>game.acts.manada===3)),'la víctima elegida por el lobo llega al narrador');
  ok(await until(async()=>!(await ph(0).pg.isVisible('#pjAccion'))),'al responder, la pregunta desaparece del móvil');
  ok((await H.pg.textContent('#extraStepUI')).includes('ya han respondido'),'el narrador ve quién ha respondido');
  // intento de suplantación: un aldeano responde por el lobo
  await ph(3).pg.evaluate(()=>Online._estado.T.enviar('host',{tipo:'accion',id:'x',seat:0,vals:{victima:4}}));
  await wait(400);ok(await H.pg.evaluate(()=>game.acts.manada===3),'no se puede responder por otro jugador');
  // bruja
  ok(await irA('Bruja'),'llega a la Bruja');
  ok(await until(()=>ph(2).pg.isVisible('#pjAccion')),'la Bruja recibe su pregunta');
  const tb=await ph(2).pg.textContent('#pjAccion');
  ok(tb.includes(await H.pg.evaluate(()=>game.assigned[3].name))&&tb.includes('devorado'),'la Bruja ve a quién han devorado');
  await elegir(ph(2),'No envenenar');await ph(2).pg.locator('#pjAccion .pk-label',{hasText:'Poción de vida'}).waitFor();
  await ph(2).pg.locator('#pjAccion .pm').filter({hasText:await H.pg.evaluate(()=>game.assigned[3].name)}).first().click();
  await confirmar(ph(2));
  ok(await until(()=>H.pg.evaluate(()=>game.acts.brujaCura===3)),'la cura de la Bruja llega al narrador');
  // vidente
  ok(await irA('Vidente'),'llega a la Vidente');
  ok(await until(()=>ph(1).pg.isVisible('#pjAccion')),'la Vidente recibe su pregunta');
  await elegir(ph(1),await H.pg.evaluate(()=>game.assigned[0].name));
  await confirmar(ph(1));
  ok(await until(async()=>(await ph(1).pg.textContent('#pjEstado')).includes('es LOBO')),'la Vidente ve en privado que es LOBO');
  ok(!(await ph(3).pg.textContent('#pjEstado')).includes('LOBO'),'nadie más lo ve');
  // despertar
  ok(await irA('El pueblo despierta'),'llega al despertar');
  await H.pg.click('text=Resolver la noche');
  ok(await H.pg.evaluate(()=>game.assigned.every(p=>p.vivo)),'la Bruja salvó a la víctima: no muere nadie');
  ok(await until(async()=>(await ph(3).pg.textContent('#pjAnuncios')).includes('Nadie ha muerto')),'el anuncio público llega a los móviles');
  // votación desde los móviles
  ok(await irA('Votación'),'llega a la votación');
  ok(await until(async()=>(await Promise.all([0,1,2,3,4].map(s=>ph(s).pg.isVisible('#pjAccion')))).every(Boolean)),'los 5 reciben su voto');
  const nombreLobo=await H.pg.evaluate(()=>game.assigned[0].name);
  for(const s of [1,2,3,4]){await elegir(ph(s),nombreLobo);await confirmar(ph(s));}
  await elegir(ph(0),await H.pg.evaluate(()=>game.assigned[1].name));await confirmar(ph(0));
  ok(await until(()=>H.pg.evaluate(()=>Object.keys(game.votosDia).length===5)),'los 5 votos llegan');
  await H.pg.click('text=Abrir la votación');
  ok((await H.pg.textContent('#voteBody')).includes('Han votado 5 de 5'),'el narrador ve «han votado 5 de 5»');
  ok(await H.pg.evaluate(()=>game.vote.counts[0]===4),'los votos vienen precargados (4 al lobo)');
  await H.pg.click('text=Linchar a '+nombreLobo);
  ok(await until(()=>H.pg.evaluate(()=>!!game.winner&&game.winner.t==='Los Aldeanos ganan')),'la aldea gana al linchar al lobo');
  ok(await until(async()=>(await ph(3).pg.evaluate(()=>document.getElementById('pjWin').classList.contains('show')))),'los móviles muestran la victoria');
  ok((await ph(3).pg.textContent('#pjPuntos')).includes('Puntuación'),'y la puntuación');
  console.log(errs.length?'Errores de JS:\n'+errs.join('\n'):'sin errores de JS');if(errs.length){fallos++;process.exitCode=1;}
  await b.close();web.close();process.exit(fallos?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
