/* js/online.js — Modo online «híbrido» de La aldea se duerme.
   El anfitrión es el NARRADOR (no juega): crea la sala, reparte y dirige la noche con el modo guiado.
   Cada jugador entra desde su móvil, ve solo su carta y el estado público. El transporte (PeerJS, solo STUN) se carga bajo demanda:
   abriendo el HTML con doble clic (file://) el modo local sigue funcionando y «Jugar online» avisa de que necesita https. */
const Online=(function(){
const O={activo:false,host:false,T:null,uid:null,nombre:'',sala:'',pass:'',jug:[],pub:{},vista:null,net:null,conectado:true,
  partida:false,syncT:null,ultimoSync:'',flipT:null,cartasKey:'',ses:null};
const $=id=>document.getElementById(id);
const SES='pueblo.online.sesion';
function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,v);}catch(e){/* sin almacenamiento */}}
function lsDel(k){try{localStorage.removeItem(k);}catch(e){/* nada */}}
function parse(s,fb){try{const v=JSON.parse(s);return v===undefined?fb:v;}catch(e){return fb;}}
function mk(tag,cls,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html!==undefined)e.innerHTML=html;return e;}
const hayJuego=()=>typeof game!=='undefined'&&!!game&&!!game.assigned;
const netTxt=n=>n==='local'?'📶 red local':(n==='internet'?'🌐 internet':'');

/* ===== entrar / salir ===== */
function activo(){return O.activo;}
function esAnfitrion(){return O.activo&&O.host;}
function partidaEnCurso(){return O.activo&&O.host&&O.partida;}
function offline(pid){const j=O.jug.find(x=>x.id===pid);return !!j&&!j.conectado;}

function abrir(){
  $('olName').value=lsGet('pueblo.online.nombre')||'';$('olRoom').value=lsGet('pueblo.online.sala')||'';$('olPass').value='';
  aviso('');
  if(location.protocol==='file:')aviso('El modo online solo funciona desde una página https (por ejemplo GitHub Pages). Abriendo el archivo con doble clic usa el modo local.');
  show('scr-online');
}
function volver(){show('scr-config');}
function aviso(msg){const w=$('olWarn');if(!msg){w.style.display='none';return;}w.style.display='flex';w.querySelector('span:last-child').textContent=msg;}
function ocupado(b){['olCrear','olUnir'].forEach(id=>{$(id).disabled=b;$(id).style.opacity=b?.5:1;});}

async function cargarTransporte(){
  if(location.protocol==='file:')throw new Error('El modo online solo funciona desde una página https, no abriendo el archivo con doble clic.');
  if(!O.T){
    const m=await import(new URL('js/transport-peer.js',document.baseURI).href);
    O.T=m.default;O.T.alRecibir(onMsg);O.T.alCambiarJugadores(onJug);O.T.alConexion(onCon);
  }
  return O.T;
}
async function conectar(modo){
  const nombre=$('olName').value.trim(),sala=$('olRoom').value.trim(),pass=$('olPass').value.trim();
  if(!nombre){aviso('Escribe tu nombre.');return;}
  aviso('');ocupado(true);
  try{
    const T=await cargarTransporte();
    const r=await (modo==='crear'?T.crearSala(sala,pass,nombre):T.unirse(sala,pass,nombre));
    lsSet('pueblo.online.nombre',nombre);lsSet('pueblo.online.sala',sala);
    entrar(r,{nombre,sala,pass});
  }catch(e){aviso((e&&e.message)||'No se pudo conectar.');}
  finally{ocupado(false);}
}
function entrar(r,d){
  Object.assign(O,{activo:true,host:r.esAnfitrion,uid:r.uid,nombre:d.nombre,sala:d.sala,pass:d.pass,vista:null,pub:{},partida:false,net:null,conectado:true,cartasKey:'',ultimoSync:''});
  lsSet(SES,JSON.stringify({roomId:r.roomId,host:O.host,nombre:d.nombre,sala:d.sala,t:Date.now()}));
  if(O.host){
    const ex=O.T.leerExtra();
    if(r.reanudada&&ex&&ex.game&&ex.game.assigned){restaurarPartida(ex);return;}
    O.T.enviar('todos',{tipo:'estado',phase:'lobby',ronda:0}).catch(()=>{});
    show('scr-lobby');renderLobby();
  }else{
    show('scr-lobby');renderLobby();
    if(r.reanudada)setTimeout(route,600);
  }
}
// El narrador recarga la página: se recupera la partida guardada y los jugadores se reconectan solos.
function restaurarPartida(ex){
  Object.keys(cfg).forEach(k=>delete cfg[k]);Object.assign(cfg,ex.cfg||{});
  game=ex.game;game.online=true;game.ladronCallback=null;
  O.partida=true;
  showAlguacilBtns();
  if(game.winner)showWinBanner(game.winner);
  if(cfg.mode===1){show('scr-game');renderGameInfo();}else{show('scr-guided');renderStep();renderPlayersMini();}
  toast('Partida recuperada');
  sync(true);
}
async function recuperar(){ // al abrir la página: un jugador que recarga vuelve a su sala; el narrador, a la suya
  const s=parse(lsGet(SES),null);
  if(!s||!s.roomId||Date.now()-(s.t||0)>12*3600*1000)return false;
  if(location.protocol==='file:')return false;
  try{
    const T=await cargarTransporte();
    const r=await T.reanudar({roomId:s.roomId});
    entrar(r,{nombre:s.nombre,sala:s.sala,pass:''});
    return true;
  }catch(e){lsDel(SES);return false;}
}
function limpiar(){
  clearTimeout(O.syncT);clearTimeout(O.flipT);
  Object.assign(O,{activo:false,host:false,jug:[],pub:{},vista:null,partida:false,net:null});
  lsDel(SES);
  $('onlineBanner').style.display='none';
}
async function salir(){
  const T=O.T,host=O.host;
  limpiar();
  try{if(T)await(host?T.cerrarSala():T.salir());}catch(e){/* ya no importa */}
}
function salirConfirm(){
  if(confirm(O.host?'¿Cerrar la sala? Todos los jugadores saldrán.':'¿Salir de la sala?')){salir().then(()=>show('scr-config'));}
}

/* ===== mensajes del transporte ===== */
function onMsg(m){
  if(!O.activo&&m.tipo!=='sala-cerrada')return;
  switch(m.tipo){
    case 'estado':{const {tipo,...r}=m;O.pub=Object.assign(O.pub,r);if(!O.host)route();break;}
    case 'rol':O.vista=m.v||null;if(!O.host)route();break;
    case 'conexion':O.net=m.net;renderLobby();break;
    case 'sala-cerrada':if(O.activo){toast('El narrador ha cerrado la sala');limpiar();show('scr-config');}break;
    case 'expulsado':toast('El narrador te ha expulsado de la sala');limpiar();show('scr-config');break;
    default:break;
  }
}
function onJug(l){
  O.jug=l;
  if(O.host&&O.partida&&hayJuego())refreshGameUI();
  renderLobby();renderJugador();
}
function onCon(c){
  O.conectado=c;
  if(!O.host)toast(c?'✅ Reconectado':'📡 Sin conexión con el narrador… reconectando');
  renderLobby();
}

/* ===== lobby ===== */
function jugadoresSala(){return O.jug.filter(j=>!j.esAnfitrion);}
function renderLobby(){
  if(!O.activo)return;
  $('lbTitle').textContent=O.sala||'Sala';
  $('lbRol').textContent=O.host?'📖 Eres el narrador':'🎮 Jugadores en la sala';
  const box=$('lbList');box.innerHTML='';
  O.jug.slice().sort((a,b)=>(b.esAnfitrion-a.esAnfitrion)||(a.orden-b.orden)).forEach((j,i)=>{
    const row=mk('div','alg-player');
    row.append(mk('div','ap-num',j.esAnfitrion?'📖':String(i)),mk('div','ap-name',esc(j.nombre)+(j.yo?' (tú)':'')+(j.esAnfitrion?' · narrador':'')));
    row.append(mk('div','ap-cur',(j.conectado?'🟢':'🔴')+' '+netTxt(j.net)));
    if(O.host&&!j.esAnfitrion){const x=mk('button','iconbtn','Expulsar');x.style.marginLeft='6px';x.onclick=()=>expulsar(j);row.appendChild(x);}
    box.appendChild(row);
  });
  $('lbNet').textContent=!O.host&&O.net?'Tu conexión con el narrador: '+netTxt(O.net):'';
  $('lbHost').style.display=O.host?'block':'none';
  $('lbPlayer').style.display=O.host?'none':'block';
  if(O.host){
    const n=jugadoresSala().length;
    const w=Math.min(cfg.wolves,Engine.maxWolves(Object.assign({},cfg,{players:Math.max(n,2),narrator:'none',narratorEnabled:false})));
    const sinCon=jugadoresSala().filter(j=>!j.conectado).length;
    const cap=Engine.capacity(Object.assign({},cfg,{players:n,narrator:'none',narratorEnabled:false,wolves:w}));
    let t=`<b>${n}</b> jugador${n===1?'':'es'} · ${w} lobo${w===1?'':'s'} (recomendado ${Engine.recWolvesFor(n)})`;
    if(sinCon)t+=`<br>⚠️ ${sinCon} sin conexión`;
    if(n<5)t+='<br>Hacen falta al menos 5 jugadores.';
    else if(!cap.ok)t+='<br>⚠️ '+esc(cap.msg);
    $('lbCheck').innerHTML=t;
    $('lbStart').disabled=n<5||!cap.ok;$('lbStart').style.opacity=($('lbStart').disabled)?.5:1;
  }
}
function expulsar(j){if(confirm('¿Expulsar a '+j.nombre+'?'))O.T.expulsar(j.id).catch(e=>toast(e.message));}
function ajustes(){
  const b=$('onlineBanner');b.style.display='block';$('onlineBannerTxt').innerHTML='🌐 Sala <b>'+esc(O.sala)+'</b>: los jugadores y sus nombres son los de la sala ('+jugadoresSala().length+'). Ajusta cartas y lobos y vuelve.';
  show('scr-config');
}
function volverSala(){$('onlineBanner').style.display='none';show('scr-lobby');renderLobby();}

/* ===== compartir ===== */
function enlace(){
  const base=location.href.split('#')[0];
  if(confirm('El enlace incluirá la contraseña de la sala (quien lo reciba entrará directamente). ¿Hacerlo así?'))return base+'#s='+encodeURIComponent(O.sala+'\n'+O.pass);
  return base;
}
function compartir(){
  const url=enlace(),texto='Partida de La aldea se duerme: sala «'+O.sala+'»';
  if(navigator.share)navigator.share({title:'La aldea se duerme',text:texto,url}).catch(()=>{});
  else if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(texto+'\n'+url).then(()=>toast('Enlace copiado'),()=>prompt('Copia este enlace:',url));
  else prompt('Copia este enlace:',url);
}
function cargarQR(){
  if(window.qrcode)return Promise.resolve();
  return new Promise((ok,ko)=>{const s=document.createElement('script');s.src='js/qrcode.js';s.onload=ok;s.onerror=()=>ko(new Error('No se pudo cargar el generador de QR.'));document.head.appendChild(s);});
}
function qr(){
  const url=enlace();
  cargarQR().then(()=>{
    const q=window.qrcode(0,'M');q.addData(url);q.make();
    const ov=mk('div');ov.style.cssText='position:fixed;inset:0;z-index:120;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:20px';
    const card=mk('div');card.style.cssText='background:#fff;color:#111;border-radius:16px;padding:18px;text-align:center;max-width:320px;width:100%';
    card.innerHTML='<div style="font-family:var(--disp);letter-spacing:.08em;text-transform:uppercase;color:#555;margin-bottom:8px">Escanea con la cámara</div>'+q.createSvgTag({cellSize:4,margin:2,scalable:true})+'<div style="font-size:12px;color:#555;margin-top:8px">Toca para cerrar</div>';
    const svg=card.querySelector('svg');if(svg){svg.style.width='100%';svg.style.height='auto';}
    ov.appendChild(card);ov.onclick=()=>ov.remove();document.body.appendChild(ov);
  }).catch(e=>toast(e.message));
}
function aplicarEnlace(){
  const m=/^#s=(.+)$/.exec(location.hash||'');if(!m)return false;
  try{history.replaceState(null,'',location.pathname+location.search);}catch(e){/* nada */}
  let p;try{p=decodeURIComponent(m[1]).split('\n');}catch(e){return false;}
  if(!p[0])return false;
  abrir();$('olRoom').value=p[0].slice(0,30);if(p[1])$('olPass').value=p[1].slice(0,30);
  return true;
}

/* ===== el narrador reparte ===== */
function repartir(){
  const lista=jugadoresSala();
  if(lista.length<5){toast('Hacen falta al menos 5 jugadores');return;}
  if(lista.some(j=>!j.conectado)&&!confirm('Hay jugadores sin conexión. ¿Repartir igualmente? Verán su carta al reconectar.'))return;
  cfg.players=lista.length;cfg.names=lista.map(j=>j.nombre);cfg.narrator='none';cfg.narratorEnabled=false;
  cfg.wolves=Math.max(1,Math.min(Engine.maxWolves(cfg),cfg.wolves));
  const cap=Engine.capacity(cfg);
  if(!cap.ok){toast(cap.msg);return;}
  if(!startOnlineGame(lista.map(j=>j.id)))return;
  O.partida=true;sync(true);
}
function alLobby(){
  O.partida=false;
  jugadoresSala().forEach(j=>O.T.enviar(j.id,{tipo:'rol',v:null}).catch(()=>{}));
  O.T.enviar('todos',{tipo:'estado',phase:'lobby',jug:null,ganador:null,noche:1,dia:0}).catch(()=>{});
  if(O.T.guardarExtra)O.T.guardarExtra({});
  show('scr-lobby');renderLobby();
}

/* ===== sincronización del anfitrión: estado público + vista privada de cada jugador ===== */
function sync(ya){
  if(!O.activo||!O.host||!O.partida||!hayJuego())return;
  clearTimeout(O.syncT);
  O.syncT=setTimeout(difundir,ya?0:150);
}
function vistaDe(p){
  const lobo=Engine.isWolf(p);
  const pareja=p.amor?game.assigned.find(o=>o.amor&&o.idx!==p.idx):null;
  const modelo=p.roles.includes('ninoSalvaje')&&!p.lobo?game.assigned.find(o=>o.modelo):null;
  return{idx:p.idx,nombre:p.name,cartas:cardsOf(p),vivo:p.vivo,lobo,
    lobos:lobo?game.assigned.filter(o=>Engine.isWolf(o)&&o.idx!==p.idx).map(o=>o.name):null,
    amor:pareja?pareja.name:null,modelo:modelo?modelo.name:null};
}
function difundir(){
  if(!O.activo||!O.host||!O.partida||!hayJuego())return;
  const w=game.winner;
  const pub={phase:w?'fin':'jugando',noche:game.night,dia:game.day,ganador:w?{em:w.em,t:w.t,d:w.d}:null,
    jug:game.assigned.map(p=>({n:p.name,v:p.vivo?1:0,c:p.vivo?null:p.roles.slice()}))};
  const priv={};game.assigned.forEach(p=>{if(p.pid)priv[p.pid]=vistaDe(p);});
  const clave=JSON.stringify([pub,priv]);
  if(clave!==O.ultimoSync){
    O.ultimoSync=clave;
    O.T.enviar('todos',{tipo:'estado',...pub}).catch(()=>{});
    Object.keys(priv).forEach(id=>O.T.enviar(id,{tipo:'rol',v:priv[id]}).catch(()=>{}));
  }
  // el motor se guarda aparte: si el narrador recarga, recupera la partida
  try{O.T.guardarExtra({game:JSON.parse(JSON.stringify(game)),cfg:JSON.parse(JSON.stringify(cfg))});}catch(e){console.warn('guardar:',e&&e.message);}
}

/* ===== pantalla del jugador ===== */
function route(){
  if(!O.activo||O.host)return;
  const jugando=O.pub.phase==='jugando'||O.pub.phase==='fin';
  if(jugando){show('scr-jugador');renderJugador();}
  else{if(document.getElementById('scr-jugador').classList.contains('active'))show('scr-lobby');renderLobby();}
}
function renderJugador(){
  if(!O.activo||O.host||!document.getElementById('scr-jugador').classList.contains('active'))return;
  const v=O.vista,p=O.pub;
  $('pjTitle').textContent=O.nombre;
  $('pjNight').textContent=p.noche||1;$('pjDay').textContent=p.dia||0;
  const wb=$('pjWin');
  if(p.ganador){$('pjWinEm').textContent=p.ganador.em;$('pjWinT').textContent=p.ganador.t;$('pjWinD').textContent=p.ganador.d;wb.classList.add('show');}else wb.classList.remove('show');
  const est=$('pjEstado');est.innerHTML='';
  if(!v){est.innerHTML='<div class="hint">Esperando tu carta…</div>';}
  else{
    est.appendChild(mk('div','',v.vivo?'🟢 <b>Estás vivo</b>':'💀 <b>Has muerto</b>: ya no puedes hablar ni votar, pero puedes mirar.'));
    if(v.lobo&&v.lobos)est.appendChild(mk('div','info-box bad','🐺 Eres <b>Lobo</b>.'+(v.lobos.length?' Tu manada: <b>'+v.lobos.map(esc).join(', ')+'</b>':' Estás solo en la manada.')));
    if(v.amor)est.appendChild(mk('div','info-box','💘 Estás enamorado/a de <b>'+esc(v.amor)+'</b>. Si uno muere, el otro muere de pena.'));
    if(v.modelo)est.appendChild(mk('div','info-box','🎯 Tu Modelo es <b>'+esc(v.modelo)+'</b>. Si muere, te conviertes en Lobo.'));
  }
  // cartas: solo se reconstruyen si cambian (para no cortar el giro si llega una actualización)
  const key=v?JSON.stringify(v.cartas):'';
  if(key!==O.cartasKey){
    O.cartasKey=key;const st=$('pjCards');st.innerHTML='';
    if(v){
      const wrap=mk('div','flip-multi');
      v.cartas.forEach(rk=>{
        const c=C[rk];if(!c)return;
        const flip=mk('div','flip');
        const back=mk('div','face back'),bi=new Image();bi.src=BACK;bi.alt='';bi.onerror=()=>{back.innerHTML='<div class="fallback"><div class="bm">🌙</div><div class="bt">A Aldeia<br>Adormece</div></div>';};back.appendChild(bi);
        const front=mk('div','face front'),ph=mk('div','photo'),im=new Image();im.src=IMG+c.img[0]+'.png';im.alt=c.n;im.onerror=()=>{ph.innerHTML='<div class="emoji">'+c.em+'</div>';};ph.appendChild(im);
        front.append(ph,mk('div','meta','<div class="rname">'+c.n+'</div><div class="rteam teamtxt-'+c.t+'">'+teamName(c.t)+'</div>'));
        flip.append(back,front);
        flip.onclick=()=>{
          const f=!flip.classList.contains('is-flipped');
          document.querySelectorAll('#pjCards .flip').forEach(x=>x.classList.toggle('is-flipped',f));
          clearTimeout(O.flipT);if(f)O.flipT=setTimeout(()=>document.querySelectorAll('#pjCards .flip').forEach(x=>x.classList.remove('is-flipped')),10000);
        };
        wrap.appendChild(flip);
      });
      st.appendChild(wrap);
    }
  }
  const lst=$('pjList');lst.innerHTML='';
  (p.jug||[]).forEach((j,i)=>{
    const row=mk('div','alg-player');
    row.style.opacity=j.v?1:.55;
    row.append(mk('div','ap-num',String(i+1)),mk('div','ap-name',esc(j.n)+(v&&v.idx===i?' (tú)':'')),
      mk('div','ap-cur',j.v?'':'💀 '+(j.c||[]).map(r=>C[r]?C[r].em+' '+C[r].n:'').join(' · ')));
    lst.appendChild(row);
  });
}

/* ===== arranque ===== */
function init(){
  if(aplicarEnlace())return;
  recuperar();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();

window.Online={activo,esAnfitrion,partidaEnCurso,offline,abrir,volver,conectar,salirConfirm,salir,compartir,qr,ajustes,volverSala,repartir,alLobby,sync,recuperar,_estado:O};
return window.Online;
})();
