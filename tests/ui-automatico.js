// Narrador automático: el anfitrión juega como uno más y la app dirige noche, debate y votación. Uso: node tests/ui-automatico.js
const {chromium}=require('playwright');
const {PeerServer}=require('peer');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const PEERJS=fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let fallos=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c){fallos++;process.exitCode=1;}};
const until=async(fn,ms=25000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await fn())return true;}catch(e){/* reintenta */}await wait(250);}return false;};
(async()=>{
  const ps=PeerServer({port:9351,path:'/pueblo',host:'127.0.0.1'});
  const web=http.createServer((q,r)=>{
    let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));
    if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
    if(!f.startsWith(root)||!fs.existsSync(f)){r.writeHead(404);r.end();return;}
    r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(fs.readFileSync(f));
  }).listen(9352,'127.0.0.1');
  const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--disable-features=WebRtcHideLocalIpsWithMdns']});
  const errs=[];
  const nueva=async(n)=>{
    const ctx=await b.newContext({viewport:{width:400,height:900}});
    await ctx.route(/cdn\.jsdelivr\.net|unpkg\.com|fonts\.g|aaldeiadormece|steamusercontent/,r=>/peerjs/.test(r.request().url())?r.fulfill({contentType:'text/javascript',body:PEERJS}):r.abort());
    await ctx.addInitScript(()=>{window.PUEBLO_PEER_SERVER={host:'127.0.0.1',port:9351,path:'/pueblo',secure:false};});
    const pg=await ctx.newPage();pg.on('pageerror',e=>errs.push(n+': '+e.message));
    pg.on('dialog',d=>d.accept(d.type()==='prompt'?d.defaultValue():undefined));
    await pg.goto('http://127.0.0.1:9352/index.html');return{ctx,pg};
  };
  const entrar=async(pg,nombre,modo)=>{await pg.click('text=🌐 Jugar online');await pg.fill('#olName',nombre);await pg.fill('#olRoom','Sala auto');await pg.fill('#olPass','clave1');await pg.click(modo==='crear'?'#olCrear':'#olUnir');};
  const activa=(pg,id)=>pg.evaluate(id=>document.getElementById(id).classList.contains('active'),id);
  const H=await nueva('host');await entrar(H.pg,'Anfi','crear');
  ok(await until(()=>activa(H.pg,'scr-lobby')),'el anfitrión crea la sala');
  const P=[];for(let i=1;i<=4;i++){const x=await nueva('P'+i);P.push(x);await entrar(x.pg,'Jug'+i,'unir');}
  ok(await until(async()=>(await H.pg.locator('#lbList .alg-player').count())===5),'entran 4 jugadores (5 conexiones con el anfitrión)');
  // narrador automático: el anfitrión se sienta en la mesa
  await H.pg.click('#lbOpts > .head');
  await H.pg.click('#lbOptsBody #btnNarradorAuto');
  ok(await H.pg.evaluate(()=>cfg.narradorAuto&&cfg.accionesMovil&&cfg.mode===2),'narrador automático activado (implica acciones en móviles y modo guiado)');
  ok(await until(async()=>(await H.pg.locator('#lbList .alg-player').count())===5&&(await H.pg.textContent('#lbRol')).includes('Narrador automático')),'el lobby indica que el anfitrión también juega');
  ok(await H.pg.evaluate(()=>cfg.players===5),'son 5 jugadores en la mesa (incluido el anfitrión)');
  // reparto fijo: anfitrión=Vidente, Jug1=lobo, resto aldeanos
  await H.pg.evaluate(()=>{
    cfg.tiempos={noche:3,debate:2,voto:3};
    const orig=Engine.createGame;
    Engine.createGame=(c,r)=>{const g=orig(c,r);const roles=['vidente','lobo','aldeano','aldeano','aldeano'];g.assigned.forEach((p,i)=>{p.roles=[roles[i]];});g.deck=roles.slice();g.initialWolves=1;return g;};
    cfg.optional.vidente=true;
  });
  await H.pg.click('#lbStart');
  ok(await until(()=>activa(H.pg,'scr-jugador')),'el anfitrión ve su pantalla de jugador, no el panel del narrador');
  ok(await until(()=>H.pg.isVisible('#pjMod')),'y tiene el botón de moderación');
  ok(await until(async()=>(await Promise.all(P.map(x=>activa(x.pg,'scr-jugador')))).every(Boolean)),'los jugadores pasan a su pantalla');
  const seatNombres=await H.pg.evaluate(()=>game.assigned.map(p=>p.name));
  const idxLobo=1,nomLobo=seatNombres[idxLobo];
  const pidSeat=await H.pg.evaluate(()=>game.assigned.map(p=>p.pid));
  const pids=[];for(const x of P)pids.push(await x.pg.evaluate(()=>Online._estado.uid));
  const ph=s=>P[pids.indexOf(pidSeat[s])];
  ok(await H.pg.evaluate(()=>Online._estado.vista&&Online._estado.vista.cartas[0]==='vidente'),'el anfitrión juega como Vidente y solo ve su carta');
  ok(await until(async()=>(await H.pg.textContent('#pjFase')).length>0),'se muestra la fase actual a todos');
  // noche 1: el lobo elige víctima; la Vidente (el anfitrión) mira al lobo
  ok(await until(()=>ph(1).pg.isVisible('#pjAccion')),'el lobo recibe su pregunta cuando le toca');
  ok(!(await ph(2).pg.isVisible('#pjAccion')),'los aldeanos esperan');
  const victima=seatNombres[4];
  await ph(1).pg.locator('#pjAccion .pm',{hasText:victima}).first().click();await ph(1).pg.click('#pjAccion button:has-text("Confirmar")');
  // chat: de noche solo habla la manada
  ok(await until(()=>ph(1).pg.isVisible('#pjChat')),'el chat aparece en el móvil del lobo');
  await ph(1).pg.locator('#pjChatTabs button',{hasText:'Lobos'}).click();
  await ph(1).pg.fill('#pjChatIn','aullido nocturno');await ph(1).pg.click('#pjChatSend');
  ok(await until(async()=>(await ph(1).pg.textContent('#pjChatLog')).includes('aullido nocturno')),'el lobo escribe en el chat de lobos');
  ok(!(await ph(2).pg.textContent('#pjChat')).includes('aullido'),'los demás no lo ven');
  ok(!(await H.pg.textContent('#pjChat')).includes('aullido'),'ni el anfitrión (que es la Vidente)');
  await ph(2).pg.evaluate(()=>Online._estado.T.enviar('host',{tipo:'chat',seat:2,canal:'dia',texto:'hola de noche'}));
  await wait(500);ok(!(await ph(3).pg.textContent('#pjChat')).includes('hola de noche'),'de noche el pueblo no puede hablar');
  ok(await until(()=>H.pg.isVisible('#pjAccion')),'la Vidente (anfitrión) recibe su pregunta');
  await H.pg.locator('#pjAccion .pm',{hasText:nomLobo}).first().click();await H.pg.click('#pjAccion button:has-text("Confirmar")');
  ok(await until(async()=>(await H.pg.textContent('#pjEstado')).includes('es LOBO')),'el anfitrión ve en privado que es LOBO');
  // pausa
  await H.pg.click('#pjMod');await H.pg.click('#modPausa');
  ok(await H.pg.evaluate(()=>game.auto.pausa===true),'la pausa detiene el reloj');
  ok(await until(async()=>(await P[0].pg.textContent('#pjFase')).includes('En pausa')),'los jugadores ven «en pausa»');
  const rest=await H.pg.evaluate(()=>game.auto.rest);await wait(1500);
  ok(await H.pg.evaluate(r=>game.auto.rest===r,rest),'en pausa el tiempo no baja');
  await H.pg.click('#modPausa');await H.pg.evaluate(()=>document.getElementById('modModal').classList.remove('open'));
  ok(await H.pg.evaluate(()=>!game.auto.pausa),'se puede reanudar');
  // amanece: muere la víctima, anuncio público
  ok(await until(async()=>(await H.pg.evaluate(i=>!game.assigned[i].vivo,4))),'amanece y muere la víctima de la manada');
  ok(await until(async()=>(await ph(2).pg.textContent('#pjAnuncios')).includes(victima)),'el anuncio de la mañana llega a todos');
  ok(!(await ph(2).pg.textContent('#pjAnuncios')).toLowerCase().includes('lobo'),'el anuncio no explica la causa');
  // día: debate automático y votación en los móviles
  // debate: habla el pueblo; los muertos no
  ok(await until(async()=>(await ph(2).pg.evaluate(()=>Online._estado.pub.momento))==='dia'&&!(await ph(2).pg.isDisabled('#pjChatIn'))),'de día se habilita el chat del pueblo');
  await ph(2).pg.fill('#pjChatIn','yo sospecho de Jug1');await ph(2).pg.click('#pjChatSend');
  ok(await until(async()=>(await H.pg.textContent('#pjChatLog')).includes('yo sospecho')),'el mensaje del pueblo llega a todos');
  ok(await ph(4).pg.isDisabled('#pjChatIn'),'el muerto no puede escribir');
  ok(await until(async()=>(await Promise.all([H,ph(1),ph(2),ph(3)].map(x=>x.pg.isVisible('#pjAccion')))).every(Boolean),30000),'tras el debate los 4 vivos reciben su voto');
  ok(!(await ph(4).pg.isVisible('#pjAccion')),'el muerto no vota');
  await H.pg.locator('#pjAccion .pm',{hasText:nomLobo}).first().click();await H.pg.click('#pjAccion button:has-text("Confirmar")');
  for(const s of [2,3]){await ph(s).pg.locator('#pjAccion .pm',{hasText:nomLobo}).first().click();await ph(s).pg.click('#pjAccion button:has-text("Confirmar")');}
  await ph(1).pg.locator('#pjAccion .pm',{hasText:seatNombres[2]}).first().click();await ph(1).pg.click('#pjAccion button:has-text("Confirmar")');
  ok(await until(()=>H.pg.evaluate(()=>!!game.winner&&game.winner.t==='Los Aldeanos ganan')),'los votos linchan al lobo y la aldea gana');
  ok(await until(async()=>(await Promise.all(P.map(x=>x.pg.evaluate(()=>document.getElementById('pjWin').classList.contains('show'))))).every(Boolean)),'todos ven la victoria');
  ok(await H.pg.evaluate(()=>document.getElementById('pjWin').classList.contains('show')),'también el anfitrión');
  ok((await ph(2).pg.textContent('#pjPuntos')).includes('Puntuación'),'y la puntuación');
  ok(await H.pg.evaluate(()=>!Online._estado.ctrl||!Online._estado.ctrl.activo()),'el narrador automático se detiene al terminar');
  console.log(errs.length?'Errores de JS:\n'+errs.join('\n'):'sin errores de JS');if(errs.length){fallos++;process.exitCode=1;}
  await b.close();web.close();process.exit(fallos?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
