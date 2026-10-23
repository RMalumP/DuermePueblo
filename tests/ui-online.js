// Narrador + 5 jugadores en navegadores distintos, con servidor de señalización local.
// Requiere (con NODE_PATH): playwright, peer, peerjs. Uso: node tests/ui-online.js
const {chromium}=require('playwright');
const {PeerServer}=require('peer');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const PEERJS=fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let fallos=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c){fallos++;process.exitCode=1;}};
const until=async(fn,ms=20000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await fn())return true;}catch(e){/* reintenta */}await wait(300);}return false;};

(async()=>{
  const ps=PeerServer({port:9311,path:'/pueblo',host:'127.0.0.1'});
  const web=http.createServer((q,r)=>{
    let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));
    if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
    if(!f.startsWith(root)||!fs.existsSync(f)){r.writeHead(404);r.end();return;}
    r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(fs.readFileSync(f));
  }).listen(9312,'127.0.0.1');
  const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--no-sandbox','--disable-features=WebRtcHideLocalIpsWithMdns']});
  const errs=[];
  const nuevaPagina=async(nombre)=>{
    const ctx=await b.newContext({viewport:{width:400,height:900}});
    await ctx.route(/cdn\.jsdelivr\.net|unpkg\.com|fonts\.g|aaldeiadormece|steamusercontent/,r=>/peerjs/.test(r.request().url())?r.fulfill({contentType:'text/javascript',body:PEERJS}):r.abort());
    await ctx.addInitScript(()=>{window.PUEBLO_TURN_PROXY='';window.PUEBLO_PEER_SERVER={host:'127.0.0.1',port:9311,path:'/pueblo',secure:false};});
    const pg=await ctx.newPage();
    pg.on('pageerror',e=>{errs.push(nombre+': '+e.message);});
    pg.on('dialog',d=>d.accept(d.type()==='prompt'?d.defaultValue():undefined));
    await pg.goto('http://127.0.0.1:9312/index.html');
    return{ctx,pg};
  };
  const entrar=async(pg,nombre,modo)=>{
    await pg.click('text=🌐 Jugar online');
    await pg.fill('#olName',nombre);await pg.fill('#olRoom','Sala test');await pg.fill('#olPass','clave1');
    await pg.click(modo==='crear'?'#olCrear':'#olUnir');
  };
  const activa=(pg,id)=>pg.evaluate(id=>document.getElementById(id).classList.contains('active'),id);

  const H=await nuevaPagina('host');
  await entrar(H.pg,'Narrador','crear');
  ok(await until(()=>activa(H.pg,'scr-lobby')),'el narrador crea la sala y ve el lobby');
  const P=[];
  for(let i=1;i<=5;i++){const x=await nuevaPagina('P'+i);P.push(x);await entrar(x.pg,'Jugador'+i,'unir');}
  ok(await until(async()=>(await Promise.all(P.map(x=>activa(x.pg,'scr-lobby')))).every(Boolean)),'los 5 jugadores entran en el lobby');
  ok(await until(async()=>(await H.pg.locator('#lbList .alg-player').count())===6),'el narrador ve 6 conexiones (él y 5 jugadores)');
  ok(await until(async()=>!(await H.pg.evaluate(()=>document.getElementById('lbStart').disabled))),'el botón de repartir se activa con 5 jugadores');
  ok((await H.pg.textContent('#lbList')).includes('🟢'),'se muestran los jugadores conectados');

  if(process.env.SHOTS){await wait(800);await H.pg.screenshot({path:process.env.SHOTS+'/lobby-narrador.png'});await P[0].pg.screenshot({path:process.env.SHOTS+'/lobby-jugador.png'});}
  // opciones de partida: desplegable dentro del lobby (no otra pantalla)
  ok(await H.pg.evaluate(()=>!!document.querySelector('#lbOptsBody #panelWolves')&&!!document.querySelector('#lbOptsBody #rolesCollap')&&!!document.querySelector('#lbOptsBody #panelMode')),'las opciones están dentro del lobby');
  ok(await H.pg.evaluate(()=>!document.getElementById('lbOpts').classList.contains('open')),'el desplegable empieza cerrado');
  await H.pg.click('#lbOpts > .head');
  ok(await H.pg.evaluate(()=>document.getElementById('lbOpts').classList.contains('open'))&&await H.pg.isVisible('#lbOptsBody #panelMode'),'el desplegable se abre');
  await H.pg.click('#lbOptsBody #mode2');
  await H.pg.click('#lbOptsBody #rolesCollap > .head');
  await H.pg.locator('#lbOptsBody .role-chk',{hasText:'Vidente'}).click();
  await H.pg.click('#btnNinaRemota');
  ok(await H.pg.evaluate(()=>cfg.optional.vidente===true&&cfg.mode===2&&cfg.ninaRemota===true),'cartas, modo y Niña a distancia se ajustan desde el desplegable');
  ok(await until(async()=>(await H.pg.textContent('#lbOptsSum')).includes('Niña a distancia')),'el resumen del desplegable se actualiza');
  // móvil compartido: el jugador 1 comparte su móvil con un invitado
  await H.pg.locator('#lbList .alg-player',{hasText:'Jugador1'}).locator('button',{hasText:'+1'}).click();
  ok(await until(async()=>(await H.pg.locator('#lbList .alg-player').count())===7),'el narrador añade un invitado a un móvil (7 filas con el narrador)');
  ok(await until(async()=>(await P[2].pg.locator('#lbList .alg-player').count())===7),'los demás jugadores ven al invitado');
  // orden de la mesa: subir/bajar
  const nombres=async()=>H.pg.evaluate(()=>seatsParaTest());
  await H.pg.evaluate(()=>{window.seatsParaTest=()=>Array.from(document.querySelectorAll('#lbList .ap-name')).map(e=>e.textContent);});
  const antesOrden=await nombres();
  await H.pg.locator('#lbList .alg-player',{hasText:'Jugador3'}).locator('button',{hasText:'▲'}).click();
  ok(await until(async()=>{const n=await nombres();return n.findIndex(x=>x.includes('Jugador3'))<antesOrden.findIndex(x=>x.includes('Jugador3'));}),'subir a un jugador cambia el orden de la mesa');
  ok(await H.pg.evaluate(()=>cfg.players===6&&cfg.names.length===6),'la configuración sigue el número de asientos (6)');
  ok(await H.pg.evaluate(()=>cfg.wolves===2),'los lobos siguen la recomendación (2) sin tocarlos');
  await H.pg.click('#lbStart');
  ok(await until(()=>activa(H.pg,'scr-guided')),'el narrador entra en el modo guiado');
  ok(await until(async()=>(await Promise.all(P.map(x=>activa(x.pg,'scr-jugador')))).every(Boolean)),'cada móvil pasa a su pantalla de partida');
  ok(await H.pg.evaluate(()=>game.assigned.length===6),'la partida tiene 6 jugadores (5 móviles, uno compartido)');
  const pids=[];for(const x of P)pids.push(await x.pg.evaluate(()=>Online._estado.uid));
  const esperado=await H.pg.evaluate(ps=>ps.map(pid=>game.assigned.filter(p=>p.pid===pid).map(p=>cardsOf(p))),pids);
  ok(await until(async()=>{
    for(let i=0;i<5;i++){const vs=await P[i].pg.evaluate(()=>Online._estado.vistas.map(v=>v.cartas));if(JSON.stringify(vs)!==JSON.stringify(esperado[i]))return false;}return true;
  }),'cada móvil recibe exactamente las cartas de sus asientos');
  const compartido=esperado.findIndex(x=>x.length===2);
  ok(compartido>=0,'hay un móvil con 2 asientos');
  // privacidad
  const roles=await H.pg.evaluate(()=>game.assigned.map(p=>cardsOf(p)));
  let fuga=false;
  for(let i=0;i<5;i++){
    const est=await P[i].pg.evaluate(()=>JSON.stringify(Online._estado.pub));
    roles.forEach(r=>{if(r[0]!=='aldeano'&&r[0]!=='nina'&&est.includes('"'+r[0]+'"'))fuga=true;});
  }
  ok(!fuga,'el estado público no filtra roles de jugadores vivos');
  // móvil compartido: pasar el móvil
  const PC=P[compartido];
  ok((await PC.pg.textContent('#pjEstado')).includes('Móvil compartido'),'el móvil compartido lo indica');
  const tit1=await PC.pg.textContent('#pjTitle');
  await PC.pg.click('text=Pasar el móvil a');
  const tit2=await PC.pg.textContent('#pjTitle');
  ok(tit1!==tit2,'al pasar el móvil cambia de jugador ('+tit1+' → '+tit2+')');
  ok(await PC.pg.evaluate(()=>!document.querySelector('#pjCards .flip').classList.contains('is-flipped')),'la carta del siguiente jugador empieza oculta');
  await PC.pg.click('text=Pasar el móvil a');
  const lobos=await H.pg.evaluate(()=>game.assigned.filter(p=>Engine.isWolf(p)).map(p=>p.idx));
  const l0=lobos[0];
  const pidDe=await H.pg.evaluate(i=>game.assigned[i].pid,l0);
  const Pl=P[pids.indexOf(pidDe)];
  // si el lobo comparte móvil, se pasa hasta su asiento
  for(let k=0;k<3&&await Pl.pg.evaluate(i=>Online._estado.vista.idx!==i,l0);k++)await Pl.pg.click('text=Pasar el móvil a');
  await Pl.pg.click('#pjCards .flip');
  ok(await until(async()=>{const v=await Pl.pg.evaluate(()=>Online._estado.vista);return v&&v.lobo&&v.lobos&&v.lobos.length===1&&(await Pl.pg.textContent('#pjEstado')).includes('Tu manada');}),'los lobos saben quiénes son sus compañeros (al mostrar su carta)');
  ok(await Pl.pg.evaluate(()=>document.querySelector('#pjCards .flip').classList.contains('is-flipped')),'tocar la carta la muestra');

  // Niña a distancia: solo puede espiar en el paso de la manada y una vez por noche
  const nina=await H.pg.evaluate(()=>{const p=game.assigned.find(p=>p.roles.includes('nina'));return p?{idx:p.idx,pid:p.pid,lobo:Engine.isWolf(p)}:null;});
  ok(!!nina&&!nina.lobo,'hay una Niña (aldea) en la partida');
  const PN=P[pids.indexOf(nina.pid)];
  const irSeat=async()=>{for(let k=0;k<3&&await PN.pg.evaluate(i=>Online._estado.vista.idx!==i,nina.idx);k++)await PN.pg.click('text=Pasar el móvil a');if(!await PN.pg.evaluate(()=>Online._estado.revelado))await PN.pg.click('#pjCards .flip');};
  await irSeat();
  ok(!(await PN.pg.isVisible('#pjEstado button:has-text("Espiar a los lobos")')),'fuera del paso de la manada la Niña no puede espiar');
  for(let i=0;i<40&&!(await H.pg.textContent('#stTitle')).includes('La manada');i++)await H.pg.click('#scr-guided .nav-steps .btn-primary');
  await PN.pg.waitForTimeout(600);await irSeat();
  ok(await until(()=>PN.pg.isVisible('#pjEstado button:has-text("Espiar a los lobos")')),'en el paso de la manada aparece el botón de espiar');
  await PN.pg.click('#pjEstado button:has-text("Espiar a los lobos")');
  ok(await until(async()=>(await PN.pg.textContent('#pjEstado')).includes('Has espiado')),'la Niña ve el nombre de un lobo');
  const visto=await PN.pg.evaluate(()=>Online._estado.ninaVio.lobo);
  const nomLobos=await H.pg.evaluate(()=>game.assigned.filter(p=>Engine.isWolf(p)).map(p=>p.name));
  ok(nomLobos.includes(visto),'el nombre que ve es de un lobo de verdad ('+visto+')');
  ok(await H.pg.evaluate(()=>game.ninaEspioNoche===game.night),'el narrador registra que espió');
  ok((await H.pg.textContent('#extraStepUI')).includes('La Niña ha espiado'),'el narrador lo ve en el paso de la manada');
  await PN.pg.waitForTimeout(500);
  ok(!(await PN.pg.isVisible('#pjEstado button:has-text("Espiar a los lobos")')),'no puede espiar dos veces la misma noche');

  // una muerte y una victoria
  const idxAld=await H.pg.evaluate(()=>game.assigned.find(p=>!Engine.isWolf(p)&&!p.roles.includes('cazador')&&!p.roles.includes('nina')).idx);
  await H.pg.evaluate(i=>{Engine.kill(game,i,'noche');afterAct();},idxAld);
  const pidAld=await H.pg.evaluate(i=>game.assigned[i].pid,idxAld),PA=P[pids.indexOf(pidAld)];
  ok(await until(async()=>(await P[(pids.indexOf(pidAld)+1)%5].pg.evaluate(i=>Online._estado.pub.jug[i].v,idxAld))===0),'todos ven que el jugador ha muerto');
  ok(await until(async()=>(await PA.pg.evaluate(i=>Online._estado.vistas.find(v=>v.idx===i).vivo,idxAld))===false),'el muerto lo sabe en su vista');
  await H.pg.evaluate(ls=>{ls.forEach(i=>Engine.kill(game,i,'voto'));afterAct();},lobos);
  ok(await until(async()=>(await Promise.all(P.map(x=>x.pg.evaluate(()=>document.getElementById('pjWin').classList.contains('show'))))).every(Boolean)),'la victoria aparece en todos los móviles');

  // el narrador recarga la página: recupera la partida y los jugadores siguen conectados
  const idxGame=await H.pg.evaluate(()=>JSON.stringify(game.assigned.map(p=>[p.name,p.vivo,p.pid])));
  await H.pg.close();
  const H2=await H.ctx.newPage();H2.on('pageerror',e=>errs.push('host2: '+e.message));H2.on('dialog',d=>d.accept(d.type()==='prompt'?d.defaultValue():undefined));
  await H2.goto('http://127.0.0.1:9312/index.html');
  ok(await until(()=>activa(H2,'scr-guided'),30000),'el narrador recarga y vuelve a su partida');
  {const rec=await H2.evaluate(()=>JSON.stringify(game.assigned.map(p=>[p.name,p.vivo,p.pid])));ok(rec===idxGame,'la partida recuperada es idéntica');if(rec!==idxGame){console.log('   antes:  ',idxGame);console.log('   después:',rec);}}
  ok(await until(async()=>(await H2.evaluate(()=>Online._estado.jug.filter(j=>j.conectado&&!j.esAnfitrion).length))===5,40000),'los 5 jugadores se reconectan solos');
  ok(await P[0].pg.evaluate(()=>document.getElementById('pjWin').classList.contains('show')),'los jugadores mantienen la pantalla de victoria');

  // nueva partida: vuelta al lobby con los mismos jugadores
  await H2.evaluate(()=>Online.alLobby());
  ok(await until(async()=>(await Promise.all(P.map(x=>activa(x.pg,'scr-lobby')))).every(Boolean)),'todos vuelven al lobby');
  ok(await P[0].pg.evaluate(()=>Online._estado.vistas.length)===0,'las cartas anteriores se borran');
  // cerrar sala
  await H2.evaluate(()=>Online.salir());
  ok(await until(async()=>(await Promise.all(P.map(x=>activa(x.pg,'scr-config')))).every(Boolean)),'al cerrar la sala todos vuelven al inicio');
  console.log(errs.length?'Errores de JS:\n'+errs.join('\n'):'sin errores de JS');if(errs.length){fallos++;process.exitCode=1;}
  await b.close();web.close();
  process.exit(fallos?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
