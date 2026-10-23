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
    await ctx.addInitScript(()=>{window.PUEBLO_PEER_SERVER={host:'127.0.0.1',port:9311,path:'/pueblo',secure:false};});
    const pg=await ctx.newPage();
    pg.on('pageerror',e=>{errs.push(nombre+': '+e.message);});
    pg.on('dialog',d=>d.accept());
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
  // el narrador configura y reparte
  await H.pg.evaluate(()=>{cfg.mode=2;cfg.wolves=2;cfg.optional.vidente=true;cfg.optional.cazador=true;renderRoles();});
  await H.pg.click('#lbStart');
  ok(await until(()=>activa(H.pg,'scr-guided')),'el narrador entra en el modo guiado');
  ok(await until(async()=>(await Promise.all(P.map(x=>activa(x.pg,'scr-jugador')))).every(Boolean)),'cada jugador pasa a su pantalla de partida');
  const roles=await H.pg.evaluate(()=>game.assigned.map(p=>cardsOf(p)));
  ok(await until(async()=>{
    for(let i=0;i<5;i++){const v=await P[i].pg.evaluate(()=>Online._estado.vista);if(!v||JSON.stringify(v.cartas)!==JSON.stringify(roles[i]))return false;}return true;
  }),'cada jugador recibe exactamente su carta');
  // privacidad: ningún jugador conoce las cartas de los demás ni los lobos ajenos
  let fuga=false;
  for(let i=0;i<5;i++){
    const est=await P[i].pg.evaluate(()=>JSON.stringify(Online._estado.pub));
    const v=await P[i].pg.evaluate(()=>Online._estado.vista);
    roles.forEach((r,j)=>{if(j!==i&&r[0]!=='aldeano'&&est.includes('"'+r[0]+'"'))fuga=true;});
    if(!v.lobo&&v.lobos)fuga=true;
  }
  ok(!fuga,'el estado público no filtra roles de jugadores vivos');
  const lobos=await H.pg.evaluate(()=>game.assigned.filter(p=>Engine.isWolf(p)).map(p=>p.idx));
  const l0=lobos[0];
  ok(await until(async()=>{const v=await P[l0].pg.evaluate(()=>Online._estado.vista);return v&&v.lobo&&v.lobos&&v.lobos.length===1;}),'los lobos saben quiénes son sus compañeros');
  await P[0].pg.click('#pjCards .flip');
  ok(await P[0].pg.evaluate(()=>document.querySelector('#pjCards .flip').classList.contains('is-flipped')),'tocar la carta la muestra');

  if(process.env.SHOTS){await P[0].pg.click('#pjCards .flip');await wait(900);await P[l0].pg.click('#pjCards .flip');await wait(900);await P[0].pg.screenshot({path:process.env.SHOTS+'/jugador.png'});await P[l0].pg.screenshot({path:process.env.SHOTS+'/jugador-lobo.png'});}
  // una muerte y una victoria
  const idxAld=await H.pg.evaluate(()=>game.assigned.find(p=>!Engine.isWolf(p)&&!p.roles.includes('cazador')).idx);
  await H.pg.evaluate(i=>{Engine.kill(game,i,'noche');afterAct();},idxAld);
  ok(await until(async()=>(await P[(idxAld+1)%5].pg.evaluate(i=>Online._estado.pub.jug[i].v,idxAld))===0),'todos ven que el jugador ha muerto');
  ok(await until(async()=>(await P[idxAld].pg.evaluate(()=>Online._estado.vista.vivo))===false),'el muerto lo sabe en su vista');
  ok((await P[idxAld].pg.textContent('#pjEstado')).includes('Has muerto'),'y se lo dice la pantalla');
  await H.pg.evaluate(ls=>{ls.forEach(i=>Engine.kill(game,i,'voto'));afterAct();},lobos);
  ok(await until(async()=>(await Promise.all(P.map(x=>x.pg.evaluate(()=>document.getElementById('pjWin').classList.contains('show'))))).every(Boolean)),'la victoria aparece en todos los móviles');

  // el narrador recarga la página: recupera la partida y los jugadores siguen conectados
  const idxGame=await H.pg.evaluate(()=>JSON.stringify(game.assigned.map(p=>[p.name,p.vivo,p.pid])));
  await H.pg.close();
  const H2=await H.ctx.newPage();H2.on('pageerror',e=>errs.push('host2: '+e.message));H2.on('dialog',d=>d.accept());
  await H2.goto('http://127.0.0.1:9312/index.html');
  ok(await until(()=>activa(H2,'scr-guided'),30000),'el narrador recarga y vuelve a su partida');
  {const rec=await H2.evaluate(()=>JSON.stringify(game.assigned.map(p=>[p.name,p.vivo,p.pid])));ok(rec===idxGame,'la partida recuperada es idéntica');if(rec!==idxGame){console.log('   antes:  ',idxGame);console.log('   después:',rec);}}
  ok(await until(async()=>(await H2.evaluate(()=>Online._estado.jug.filter(j=>j.conectado&&!j.esAnfitrion).length))===5,40000),'los 5 jugadores se reconectan solos');
  ok(await P[0].pg.evaluate(()=>document.getElementById('pjWin').classList.contains('show')),'los jugadores mantienen la pantalla de victoria');

  // nueva partida: vuelta al lobby con los mismos jugadores
  await H2.evaluate(()=>Online.alLobby());
  ok(await until(async()=>(await Promise.all(P.map(x=>activa(x.pg,'scr-lobby')))).every(Boolean)),'todos vuelven al lobby');
  ok(await P[0].pg.evaluate(()=>Online._estado.vista)===null,'las cartas anteriores se borran');
  // cerrar sala
  await H2.evaluate(()=>Online.salir());
  ok(await until(async()=>(await Promise.all(P.map(x=>activa(x.pg,'scr-config')))).every(Boolean)),'al cerrar la sala todos vuelven al inicio');
  console.log(errs.length?'Errores de JS:\n'+errs.join('\n'):'sin errores de JS');if(errs.length){fallos++;process.exitCode=1;}
  await b.close();web.close();
  process.exit(fallos?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
