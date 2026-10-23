// Prueba de extremo a extremo del transporte PeerJS con un servidor de señalización local y navegadores reales.
// Requiere (con NODE_PATH): playwright, peer, peerjs. Uso: node tests/transport.js
const {chromium}=require('playwright');
const {PeerServer}=require('peer');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const PEERJS=fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let fallos=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c){fallos++;process.exitCode=1;}};

(async()=>{
  const ps=PeerServer({port:9301,path:'/pueblo',host:'127.0.0.1'});
  const web=http.createServer((q,r)=>{
    const f=path.join(root,decodeURIComponent(q.url.split('?')[0]));
    if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(f.endsWith('blank')?200:404);r.end('<html></html>');return;}
    r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(fs.readFileSync(f));
  }).listen(9302,'127.0.0.1');
  const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--no-sandbox','--disable-features=WebRtcHideLocalIpsWithMdns']});
  const nuevo=async()=>{
    const ctx=await b.newContext();
    await ctx.route(/cdn\.jsdelivr\.net|unpkg\.com/,r=>r.fulfill({contentType:'text/javascript',body:PEERJS}));
    await ctx.addInitScript(()=>{window.PUEBLO_TURN_PROXY='';window.PUEBLO_PEER_SERVER={host:'127.0.0.1',port:9301,path:'/pueblo',secure:false};});
    return ctx;
  };
  const abrir=async ctx=>{
    const pg=await ctx.newPage();
    pg.on('pageerror',e=>console.log('pageerror:',e.message));if(process.env.DEBUG_PAGES)pg.on('console',m=>console.log('   [consola]',m.text().slice(0,200)));
    await pg.goto('http://127.0.0.1:9302/blank');
    await pg.evaluate(async()=>{
      const m=await import('/js/transport-peer.js');window.T=m.default;window.msgs=[];window.lista=[];window.con=[];
      T.alRecibir(x=>window.msgs.push(x));T.alCambiarJugadores(l=>{window.lista=l;});T.alConexion(c=>window.con.push(c));
    });
    return pg;
  };
  const pc={};for(const n of ['host','b','c','d']){pc[n]=await nuevo();}
  const H=await abrir(pc.host),B=await abrir(pc.b),Cc=await abrir(pc.c),D=await abrir(pc.d);
  const err=async(pg,f,...a)=>pg.evaluate(async([f,a])=>{try{await T[f](...a);return null;}catch(e){return (e.code||'?')+'|'+(e.message||e);}},[f,a]);

  const rh=await H.evaluate(()=>T.crearSala('sala prueba','clave1','Anfi'));
  ok(rh.esAnfitrion&&rh.transporte==='peer','el anfitrión crea la sala');
  ok((await err(B,'unirse','sala prueba','otra clave','Beto')).startsWith('sala-no-encontrada'),'contraseña incorrecta rechazada');
  const rb=await B.evaluate(()=>T.unirse('sala prueba','clave1','Beto'));
  const rc=await Cc.evaluate(()=>T.unirse('Sala Prueba','clave1','Carla'));   // mayúsculas: mismo nombre normalizado
  ok(!rb.esAnfitrion&&!rc.esAnfitrion,'dos jugadores entran (nombre de sala sin distinguir mayúsculas)');
  {const e=await err(D,'unirse','sala prueba','clave1','beto');ok(e.startsWith('nombre-repetido'),'nombre repetido rechazado ('+e+')');}
  await wait(2500);
  const lh=await H.evaluate(()=>window.lista);
  ok(lh.length===3&&lh.filter(x=>x.conectado).length===3,'el anfitrión ve a los 3 conectados');
  console.log('   tipos de conexión:',JSON.stringify(lh.map(x=>[x.nombre,x.net])));
  ok(lh.filter(x=>!x.esAnfitrion).every(x=>x.net==='local'||x.net==='internet'),'se mide el tipo de conexión de cada jugador');
  ok(await B.evaluate(()=>window.lista.length)===3,'los jugadores reciben la lista');

  await H.evaluate(()=>T.enviar('todos',{tipo:'estado',phase:'lobby',x:1}));
  await wait(500);
  ok(await B.evaluate(()=>window.msgs.some(m=>m.tipo==='estado'&&m.x===1))&&await Cc.evaluate(()=>window.msgs.some(m=>m.tipo==='estado'&&m.x===1)),'el estado público llega a todos');
  const idB=rb.uid,idC=rc.uid;
  await H.evaluate(id=>T.enviar(id,{tipo:'rol',carta:'vidente'}),idB);
  await wait(400);
  ok(await B.evaluate(()=>window.msgs.some(m=>m.tipo==='rol'&&m.carta==='vidente')),'la vista privada llega a su jugador');
  ok(!await Cc.evaluate(()=>window.msgs.some(m=>m.tipo==='rol'&&m.carta==='vidente')),'y NO a los demás');
  await H.evaluate(id=>T.enviar([id],{tipo:'evento',chat:'aullido'}),idC);
  await wait(400);
  ok(await Cc.evaluate(()=>window.msgs.some(m=>m.tipo==='evento'&&m.chat==='aullido'))&&!await B.evaluate(()=>window.msgs.some(m=>m.chat==='aullido')),'el evento a un grupo solo llega al grupo');
  await B.evaluate(()=>T.enviar('host',{tipo:'accion',objetivo:3}));
  await B.evaluate(()=>T.enviar('host',{tipo:'estado',phase:'hack'}).catch(()=>{}));
  await wait(500);
  const ms=await H.evaluate(()=>window.msgs);
  ok(ms.some(m=>m.tipo==='accion'&&m.objetivo===3&&m.de===idB),'la acción del jugador llega con su remitente verdadero');
  ok(!ms.some(m=>m.phase==='hack'),'un jugador no puede enviar estado');
  const est=await B.evaluate(()=>window.msgs.filter(m=>m.tipo==='estado').pop());
  ok(est.phase==='lobby','el estado público no cambió');

  // reconexión del jugador tras recargar la página (misma identidad por token)
  await B.close();const B2=await abrir(pc.b);
  const r2=await B2.evaluate(roomId=>T.reanudar({roomId}),rb.roomId);
  ok(r2.reanudada&&r2.uid===idB,'el jugador recarga y recupera su identidad');
  await wait(800);
  ok(await B2.evaluate(()=>window.msgs.some(m=>m.tipo==='rol'&&m.carta==='vidente')&&window.msgs.some(m=>m.tipo==='estado')),'y recupera su vista privada y el estado');

  // el anfitrión guarda el estado del juego y recarga
  await H.evaluate(()=>T.guardarExtra({noche:2,vivos:[1,2,3]}));
  await wait(500);
  await H.close();const H2=await abrir(pc.host);
  const rr=await H2.evaluate(roomId=>T.reanudar({roomId}),rh.roomId);
  ok(rr.esAnfitrion&&rr.reanudada,'el anfitrión recarga y recupera la sala');
  ok(JSON.stringify(await H2.evaluate(()=>T.leerExtra()))===JSON.stringify({noche:2,vivos:[1,2,3]}),'recupera el estado del motor');
  const t0=Date.now();let n=0;
  while(Date.now()-t0<60000){n=(await H2.evaluate(()=>window.lista)).filter(x=>x.conectado).length;if(n===3)break;await wait(1000);}
  ok(n===3,'los jugadores se reconectan solos al anfitrión recargado ('+n+'/3 en '+Math.round((Date.now()-t0)/1000)+' s)');

  // expulsar y cierre
  await H2.evaluate(id=>T.expulsar(id),idC);
  await wait(600);
  ok(await Cc.evaluate(()=>window.msgs.some(m=>m.tipo==='expulsado')),'el jugador expulsado lo sabe');
  await H2.evaluate(()=>T.cerrarSala());
  await wait(600);
  ok(await B2.evaluate(()=>window.msgs.some(m=>m.tipo==='sala-cerrada')),'al cerrar la sala los jugadores lo saben');
  // servidor de relé: credenciales repartidas por un Worker (simulado); si falla, se sigue solo con STUN
  const worker=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'application/json','access-control-allow-origin':'*'});r.end(JSON.stringify([{urls:'stun:stun.relay.example:80'},{urls:'turn:relay.example:443',username:'u',credential:'c'},{urls:'http://malo'}]));}).listen(9303,'127.0.0.1');
  const ctxR=await nuevo(),R1=await abrir(ctxR);
  await R1.evaluate(()=>{globalThis.PUEBLO_TURN_PROXY='http://127.0.0.1:9303/';});
  const rr1=await R1.evaluate(()=>T.crearSala('sala rele','clave1','Rele'));
  ok(!rr1.avisos.length,'con el Worker disponible no hay avisos');
  const ice=await R1.evaluate(()=>T.iceActual());
  ok(ice.some(x=>[].concat(x.urls).some(u=>u.startsWith('turn:'))&&x.username==='u'),'las credenciales TURN del Worker se usan');
  ok(!ice.some(x=>[].concat(x.urls).some(u=>u.startsWith('http'))),'se descartan entradas que no son stun/turn');
  const ctxM=await nuevo(),R2=await abrir(ctxM);
  await R2.evaluate(()=>{globalThis.PUEBLO_TURN_PROXY='http://127.0.0.1:9399/';});
  const rr2=await R2.evaluate(()=>T.crearSala('sala sin rele','clave1','SinRele'));
  ok(rr2.esAnfitrion&&rr2.avisos.length>0,'si el Worker no responde la sala se crea igual y se avisa');
  ok(!(await R2.evaluate(()=>T.iceActual())).some(x=>[].concat(x.urls).some(u=>u.startsWith('turn:'))),'y se usa solo STUN');
  worker.close();
  await b.close();web.close();ps.close&&ps.close();
  console.log(fallos?`${fallos} fallo(s)`:'todo correcto');
  process.exit(fallos?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
