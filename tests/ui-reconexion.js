// Reconexión a mitad de partida (narrador automático): un jugador recarga con una pregunta abierta y el anfitrión recarga y la partida sigue.
// Requiere (con NODE_PATH): playwright, peer, peerjs. Uso: node tests/ui-reconexion.js
const {chromium}=require('playwright');
const {PeerServer}=require('peer');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const PEERJS=fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let fallos=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c){fallos++;process.exitCode=1;}};
const until=async(fn,ms=30000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await fn())return true;}catch(e){/* reintenta */}await wait(250);}return false;};
(async()=>{
  const ps=PeerServer({port:9361,path:'/pueblo',host:'127.0.0.1'});
  const web=http.createServer((q,r)=>{
    let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));
    if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
    if(!f.startsWith(root)||!fs.existsSync(f)){r.writeHead(404);r.end();return;}
    r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(fs.readFileSync(f));
  }).listen(9362,'127.0.0.1');
  const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--disable-features=WebRtcHideLocalIpsWithMdns']});
  const errs=[];
  const pagina=async(ctx,n)=>{const pg=await ctx.newPage();pg.on('pageerror',e=>errs.push(n+': '+e.message));pg.on('dialog',d=>d.accept(d.type()==='prompt'?d.defaultValue():undefined));await pg.goto('http://127.0.0.1:9362/index.html');return pg;};
  const nueva=async(n)=>{
    const ctx=await b.newContext({viewport:{width:400,height:900}});
    await ctx.route(/cdn\.jsdelivr\.net|unpkg\.com|fonts\.g|aaldeiadormece|steamusercontent/,r=>/peerjs/.test(r.request().url())?r.fulfill({contentType:'text/javascript',body:PEERJS}):r.abort());
    await ctx.addInitScript(()=>{window.PUEBLO_TURN_PROXY='';window.PUEBLO_PEER_SERVER={host:'127.0.0.1',port:9361,path:'/pueblo',secure:false};});
    return{ctx,pg:await pagina(ctx,n)};
  };
  const entrar=async(pg,nombre,modo)=>{await pg.click('text=🌐 Jugar online');await pg.fill('#olName',nombre);await pg.fill('#olRoom','Sala rec');await pg.fill('#olPass','clave1');await pg.click(modo==='crear'?'#olCrear':'#olUnir');};
  const activa=(pg,id)=>pg.evaluate(id=>document.getElementById(id).classList.contains('active'),id);
  const H=await nueva('host');await entrar(H.pg,'Anfi','crear');
  await until(()=>activa(H.pg,'scr-lobby'));
  const P=[];for(let i=1;i<=4;i++){const x=await nueva('P'+i);P.push(x);await entrar(x.pg,'Jug'+i,'unir');}
  await until(async()=>(await H.pg.locator('#lbList .alg-player').count())===5);
  await H.pg.click('#lbOpts > .head');await H.pg.click('#lbOptsBody #btnNarradorAuto');
  await H.pg.evaluate(()=>{
    cfg.tiempos={noche:20,debate:2,voto:3};cfg.optional.vidente=true;
    const orig=Engine.createGame;
    Engine.createGame=(c,r)=>{const g=orig(c,r);const roles=['vidente','lobo','aldeano','aldeano','aldeano'];g.assigned.forEach((p,i)=>{p.roles=[roles[i]];});g.deck=roles.slice();g.initialWolves=1;return g;};
  });
  await H.pg.click('#lbStart');
  await until(()=>activa(H.pg,'scr-jugador'));
  const nombres=await H.pg.evaluate(()=>game.assigned.map(p=>p.name)),pidSeat=await H.pg.evaluate(()=>game.assigned.map(p=>p.pid));
  const pids=[];for(const x of P)pids.push(await x.pg.evaluate(()=>Online._estado.uid));
  const idxP=s=>pids.indexOf(pidSeat[s]);
  // 1) un jugador recarga con su pregunta abierta
  ok(await until(()=>P[idxP(1)].pg.isVisible('#pjAccion')),'el lobo tiene su pregunta abierta');
  const antes=await P[idxP(1)].pg.evaluate(()=>Online._estado.vista.prompt.id);
  await P[idxP(1)].pg.close();
  P[idxP(1)].pg=await pagina(P[idxP(1)].ctx,'P-lobo2');
  ok(await until(()=>activa(P[idxP(1)].pg,'scr-jugador'),30000),'el jugador recarga y vuelve a la partida');
  ok(await until(()=>P[idxP(1)].pg.isVisible('#pjAccion')),'su pregunta sigue abierta tras recargar');
  ok(await P[idxP(1)].pg.evaluate(a=>Online._estado.vista.prompt.id===a,antes),'es la misma pregunta');
  // 2) el anfitrión recarga a mitad de la noche
  const night0=await H.pg.evaluate(()=>game.night);
  await H.pg.evaluate(()=>guardarEstado&&0);
  await H.pg.close();
  H.pg=await pagina(H.ctx,'host2');
  ok(await until(()=>activa(H.pg,'scr-jugador'),40000),'el anfitrión recarga y vuelve a su pantalla de jugador');
  ok(await H.pg.evaluate(()=>game.assigned.length===5&&Online._estado.partida),'la partida se recupera');
  ok(await until(async()=>(await H.pg.evaluate(()=>Online._estado.jug.filter(j=>j.conectado).length))===5,40000),'todos se reconectan solos');
  ok(await H.pg.evaluate(()=>Online._estado.ctrl&&Online._estado.ctrl.activo()),'el narrador automático se reanuda');
  // 3) la partida sigue: el lobo responde (con la pregunta reabierta) y amanece
  ok(await until(()=>P[idxP(1)].pg.isVisible('#pjAccion')),'el lobo recibe la pregunta de nuevo');
  await P[idxP(1)].pg.locator('#pjAccion .pm',{hasText:nombres[4]}).first().click();await P[idxP(1)].pg.click('#pjAccion button:has-text("Confirmar")');
  ok(await until(async()=>{const v=await H.pg.evaluate(()=>Online._estado.vista);return v&&v.prompt;}),'la Vidente (anfitrión) recibe su pregunta tras recargar');
  await H.pg.locator('#pjAccion .pm',{hasText:nombres[1]}).first().click();await H.pg.click('#pjAccion button:has-text("Confirmar")');
  ok(await until(()=>H.pg.evaluate(()=>!game.assigned[4].vivo)),'la partida continúa y amanece con la víctima');
  ok(await until(async()=>(await P[idxP(2)].pg.textContent('#pjAnuncios')).includes(nombres[4])),'los jugadores reciben el anuncio');
  console.log(errs.length?'Errores de JS:\n'+errs.join('\n'):'sin errores de JS');if(errs.length){fallos++;process.exitCode=1;}
  await b.close();web.close();process.exit(fallos?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
