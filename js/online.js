/* js/online.js — Modo online «híbrido» de La aldea se duerme.
   El anfitrión es el NARRADOR (no juega): crea la sala, reparte y dirige la noche con el modo guiado.
   Cada jugador entra desde su móvil, ve solo su carta y el estado público. El transporte (PeerJS, solo STUN) se carga bajo demanda:
   abriendo el HTML con doble clic (file://) el modo local sigue funcionando y «Jugar online» avisa de que necesita https. */
const Online=(function(){
const O={activo:false,host:false,T:null,uid:null,nombre:'',sala:'',pass:'',jug:[],pub:{},vista:null,vistas:[],seat:0,revelado:false,ninaVio:null,net:null,conectado:true,
  partida:false,syncT:null,ultimoSync:'',flipT:null,cartasKey:'',ses:null,cfgN:-1,selId:null,sel:{},enviado:false,chatTab:'dia',chatT:{}};
const $=id=>document.getElementById(id);
const SES='pueblo.online.sesion';
function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,v);}catch(e){/* sin almacenamiento */}}
function lsDel(k){try{localStorage.removeItem(k);}catch(e){/* nada */}}
function parse(s,fb){try{const v=JSON.parse(s);return v===undefined?fb:v;}catch(e){return fb;}}
function mk(tag,cls,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html!==undefined)e.innerHTML=html;return e;}
const hayJuego=()=>typeof game!=='undefined'&&!!game&&!!game.assigned;
const netTxt=n=>n==='local'?'📶 red local':(n==='internet'?'🌐 internet':(n==='relay'?'🔁 relé':''));

/* ===== entrar / salir ===== */
function activo(){return O.activo;}
function esAnfitrion(){return O.activo&&O.host;}
function partidaEnCurso(){return O.activo&&O.host&&O.partida;}
// Evita que el móvil apague la pantalla durante la partida (si el navegador lo permite).
let wl=null;
async function pantalla(on){
  try{
    if(on&&'wakeLock' in navigator&&!wl){wl=await navigator.wakeLock.request('screen');wl.addEventListener('release',()=>{wl=null;});}
    else if(!on&&wl){await wl.release();wl=null;}
  }catch(e){/* no disponible */}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&O.activo)pantalla(true);});
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
  if(r.esAnfitrion&&!O.cfgPrev)O.cfgPrev=JSON.parse(JSON.stringify(cfg)); // para devolver la configuración local al salir de la sala
  cfg.lobosManual=false;
  Object.assign(O,{activo:true,host:r.esAnfitrion,uid:r.uid,nombre:d.nombre,sala:d.sala,pass:d.pass,vista:null,vistas:[],seat:0,revelado:false,ninaVio:null,pub:{},partida:false,net:null,conectado:true,cartasKey:'',ultimoSync:'',cfgN:-1});
  if(r.avisos&&r.avisos.length)setTimeout(()=>toast(r.avisos[0]),600);
  lsSet(SES,JSON.stringify({roomId:r.roomId,host:O.host,nombre:d.nombre,sala:d.sala,t:Date.now()}));
  pantalla(true);
  if(O.host){
    montarOpciones();
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
  if(cfg.narradorAuto){toast('Partida recuperada');iniciarAuto();return;}
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
  clearTimeout(O.syncT);clearTimeout(O.flipT);pararAuto();
  Object.assign(O,{activo:false,host:false,jug:[],pub:{},vista:null,vistas:[],seat:0,revelado:false,ninaVio:null,partida:false,net:null,cfgN:-1});
  lsDel(SES);pantalla(false);
  devolverOpciones();
  if(O.cfgPrev){const c=O.cfgPrev;O.cfgPrev=null;['players','names','wolves','narrator','narratorEnabled','lobosManual'].forEach(k=>{if(k in c)cfg[k]=c[k];else delete cfg[k];});aplicarCfgUI();}
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
    case 'estado':{const {tipo,...r}=m;O.pub=Object.assign(O.pub,r);if(!O.host||O.auto)route();else if(enLobby())renderLobby();break;}
    case 'rol':{
      O.vistas=Array.isArray(m.vs)?m.vs.filter(Boolean):(m.v?[m.v]:[]);
      if(O.seat>=O.vistas.length)O.seat=0;
      O.vista=O.vistas[O.seat]||null; // las cartas solo se reconstruyen si cambian (clave en renderJugador): una actualización no debe taparlas
      if(!O.host)route();break;}
    case 'evento':if(m.k==='error'){O.enviado=false;toast(m.texto||'No se pudo enviar');renderJugador();}else if(m.k==='nina'){O.ninaVio={seat:m.seat,lobo:m.lobo,error:m.error,noche:m.noche};renderJugador();}break;
    case 'accion':if(O.host)hostAccion(m);break;
    case 'chat':if(O.host)hostChat(m);break;
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

/* ===== asientos: jugadores reales + invitados que comparten móvil (como en El Impostor) ===== */
function jugadoresSala(){return O.jug.filter(j=>!j.esAnfitrion);}
// Con narrador automático el anfitrión juega como uno más: se sienta en la mesa como cualquier jugador.
function participantes(){return cfg.narradorAuto?O.jug:jugadoresSala();}
function extra(){const e=parse(O.pub.extra,{});return{g:Array.isArray(e.g)?e.g:[],a:(e.a&&typeof e.a==='object')?e.a:{},o:Array.isArray(e.o)?e.o:[]};}
// Un asiento = una persona que juega. Cada móvil lleva un asiento propio y hasta 2 invitados (id 'g:<móvil>:<k>').
function seats(){
  const ex=extra(),out=[];
  participantes().forEach(p=>{
    out.push({id:p.id,nombre:ex.a[p.id]||p.nombre,owner:p.id,conectado:p.conectado,net:p.net,yo:!!p.yo,guest:false});
    ex.g.filter(x=>x.o===p.id).sort((a,b)=>a.k-b.k).forEach(g=>out.push({id:'g:'+p.id+':'+g.k,nombre:g.n,owner:p.id,k:g.k,conectado:p.conectado,net:null,yo:false,guest:true}));
  });
  if(ex.o.length){const pos=id=>{const i=ex.o.indexOf(id);return i<0?1e6:i;};out.sort((a,b)=>pos(a.id)-pos(b.id));}
  return out;
}
const enLobby=()=>(O.pub.phase||'lobby')==='lobby';
function hostSetExtra(fn){
  if(!O.host||!enLobby())return;
  const ex=extra();fn(ex);
  const txt=JSON.stringify(ex);
  if(txt.length>2800){toast('Demasiados invitados o cambios de nombre');return;}
  O.T.enviar('todos',{tipo:'estado',extra:txt}).catch(e=>toast(e.message));
}
function nombreLibre(n,exceptoId){return !seats().some(x=>x.id!==exceptoId&&x.nombre.toLowerCase()===n.toLowerCase());}
function hostAnadirInvitado(owner){
  if(seats().length>=25){toast('La sala está llena (máximo 25 jugadores)');return;}
  const n=(prompt('Nombre del jugador que compartirá este móvil:','Jugador '+(seats().length+1))||'').trim().slice(0,24);
  if(!n)return;
  if(!nombreLibre(n)){toast('Ya hay un jugador con ese nombre');return;}
  hostSetExtra(ex=>{const k=ex.g.reduce((m,x)=>Math.max(m,x.k||0),0)+1;ex.g.push({o:owner,n,k});});
}
function hostQuitarInvitado(owner,k){hostSetExtra(ex=>{ex.g=ex.g.filter(x=>!(x.o===owner&&(k===undefined||x.k===k)));});}
function hostMover(id,dir){
  hostSetExtra(ex=>{const ids=seats().map(x=>x.id),i=ids.indexOf(id),j=i+dir;if(i<0||j<0||j>=ids.length)return;[ids[i],ids[j]]=[ids[j],ids[i]];ex.o=ids;});
}
function hostRenombrar(st){
  const n=(prompt('Nuevo nombre:',st.nombre)||'').trim().slice(0,24);
  if(!n||n===st.nombre)return;
  if(!nombreLibre(n,st.id)){toast('Ya hay un jugador con ese nombre');return;}
  hostSetExtra(ex=>{if(st.guest){const g=ex.g.find(x=>x.o===st.owner&&x.k===st.k);if(g)g.n=n;}else ex.a[st.id]=n;});
}
function expulsar(st){
  if(!confirm('¿Expulsar a '+st.nombre+' de la sala?'))return;
  O.T.expulsar(st.owner).then(()=>hostQuitarInvitado(st.owner)).catch(e=>toast(e.message));
}

/* ===== opciones de partida: el desplegable del lobby reutiliza los paneles de la configuración ===== */
const OPT_IDS=['panelWolves','rolesCollap','panelMode'];
function montarOpciones(){
  const box=$('lbOptsBody');
  if(!box.dataset.escucha){box.dataset.escucha='1';box.addEventListener('click',()=>setTimeout(renderLobby,0));} // el resumen sigue a los cambios
  OPT_IDS.forEach(id=>{const el=$(id);if(!el||box.contains(el))return;const ph=document.createElement('div');ph.dataset.ph=id;el.replaceWith(ph);box.appendChild(el);});
}
function devolverOpciones(){document.querySelectorAll('[data-ph]').forEach(ph=>{const el=$(ph.dataset.ph);if(el)ph.replaceWith(el);});}
// El número de jugadores y los nombres salen de la sala: la configuración (lobos, cartas recomendadas…) se ajusta a ellos.
function sincronizarCfg(){
  const ss=seats(),n=ss.length;
  cfg.players=Math.max(n,2);cfg.names=ss.map(x=>x.nombre);cfg.narrator='none';cfg.narratorEnabled=false;
  if(O.cfgN!==n){
    O.cfgN=n;
    if(!cfg.lobosManual)cfg.wolves=recWolvesFor(Math.max(n,5)); // los lobos siguen la recomendación mientras el narrador no los toque
    $('numPlayers').textContent=cfg.players;$('recWolves').textContent=recWolvesFor(cfg.players);
    clampWolves();syncWolfWarn();renderRoles();checkRoleCapacity();
  }
}
function resumenOpciones(){
  const e=Engine.selOpt(cfg).length;
  return `${cfg.wolves} lobo${cfg.wolves===1?'':'s'} · ${e} carta${e===1?'':'s'} opcional${e===1?'':'es'} · ${cfg.mode===2?'Guiado':'Reparto'}`+(cfg.ninaRemota?' · Niña a distancia':'');
}

/* ===== lobby ===== */
function renderLobby(){
  if(!O.activo)return;
  $('lbTitle').textContent=O.sala||'Sala';
  $('lbRol').textContent=O.host?(cfg.narradorAuto?'🤖 Narrador automático: tú también juegas':'📖 Eres el narrador'):'🎮 Jugadores en la sala';
  const box=$('lbList');box.innerHTML='';
  const host=cfg.narradorAuto?null:O.jug.find(j=>j.esAnfitrion);
  if(host){const r=mk('div','alg-player');r.append(mk('div','ap-num','📖'),mk('div','ap-name',esc(host.nombre)+(host.yo?' (tú)':'')+' · narrador'),mk('div','ap-cur',host.conectado?'🟢':'🔴'));box.appendChild(r);}
  const ss=seats(),ex=extra();
  ss.forEach((st,i)=>{
    const row=mk('div','alg-player wrap');
    row.append(mk('div','ap-num',String(i+1)),mk('div','ap-name',(st.guest?'↳ ':'')+esc(st.nombre)+(st.guest?' 👥':'')+(st.yo?' (tú)':'')),
      mk('div','ap-cur',(st.conectado?'🟢':'🔴')+(st.net?' '+netTxt(st.net):'')));
    if(O.host&&enLobby()){
      const ctl=mk('div','seat-ctl');
      const b=(t,title,fn)=>{const x=mk('button','iconbtn',t);x.type='button';x.title=title;x.onclick=fn;ctl.appendChild(x);};
      b('▲','Subir en el orden de la mesa',()=>hostMover(st.id,-1));b('▼','Bajar en el orden de la mesa',()=>hostMover(st.id,1));
      b('✏️','Cambiar nombre',()=>hostRenombrar(st));
      if(st.guest)b('Quitar','Quitar al invitado',()=>hostQuitarInvitado(st.owner,st.k));
      else{
        if(!cfg.accionesMovil&&ex.g.filter(x=>x.o===st.owner).length<2)b('👥 +1','Otro jugador comparte este móvil',()=>hostAnadirInvitado(st.owner));
        if(st.owner!==O.uid)b('Expulsar','Expulsar de la sala',()=>expulsar(st));
      }
      row.appendChild(ctl);
    }
    box.appendChild(row);
  });
  $('lbNet').textContent=!O.host&&O.net?'Tu conexión con el narrador: '+netTxt(O.net):'';
  $('lbHost').style.display=O.host?'block':'none';
  $('lbPlayer').style.display=O.host?'none':'block';
  if(O.host){
    sincronizarCfg();
    const n=ss.length,sinCon=jugadoresSala().filter(j=>!j.conectado).length,cap=Engine.capacity(cfg);
    let t=`<b>${n}</b> jugador${n===1?'':'es'} · ${cfg.wolves} lobo${cfg.wolves===1?'':'s'} (recomendado ${Engine.recWolvesFor(n)})`;
    if(ss.some(x=>x.guest)&&!cfg.accionesMovil)t+='<br>👥 Hay móviles compartidos: cada persona verá su carta al «pasar el móvil».';
    if(cfg.accionesMovil&&ss.some(x=>x.guest))t+='<br>⚠️ Con acciones desde los móviles no se pueden compartir móviles: quita a los invitados.';
    if(cfg.accionesMovil&&cfg.mode!==2)t+='<br>⚠️ Las acciones desde los móviles requieren el modo Guiado.';
    if(sinCon)t+=`<br>⚠️ ${sinCon} sin conexión`;
    if(n<5)t+='<br>Hacen falta al menos 5 jugadores.';
    else if(!cap.ok)t+='<br>⚠️ '+esc(cap.msg);
    $('lbCheck').innerHTML=t;
    $('lbOptsSum').textContent=resumenOpciones();
    $('lbStart').disabled=n<5||!cap.ok||(cfg.accionesMovil&&ss.some(x=>x.guest));$('lbStart').style.opacity=$('lbStart').disabled?.5:1;
  }
}

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
  const ss=seats();
  if(ss.length<5){toast('Hacen falta al menos 5 jugadores');return;}
  if(participantes().filter(j=>!j.yo).some(j=>!j.conectado)&&!confirm('Hay jugadores sin conexión. ¿Repartir igualmente? Verán su carta al reconectar.'))return;
  if(cfg.accionesMovil&&ss.some(x=>x.guest)){toast('Quita a los invitados: con acciones desde los móviles no se comparte móvil');return;}
  sincronizarCfg();
  cfg.wolves=Math.max(1,Math.min(Engine.maxWolves(cfg),cfg.wolves));
  const cap=Engine.capacity(cfg);
  if(!cap.ok){toast(cap.msg);return;}
  if(!startOnlineGame(ss.map(x=>x.owner),ss.map(x=>x.id)))return;
  O.partida=true;
  if(cfg.narradorAuto){iniciarAuto();return;}
  sync(true);
}
function iniciarAuto(){
  O.auto=true;O.seat=0;O.vistas=[];O.cartasKey='';
  show('scr-jugador');
  O.ctrl=Auto.crear({game:()=>game,cfg:()=>cfg,sync:()=>sync(),onFin:()=>{sync(true);},tick:250});
  sync(true);O.ctrl.iniciar();
}
function pararAuto(){if(O.ctrl){O.ctrl.detener();O.ctrl=null;}O.auto=false;}
function modAbrir(){
  const g=hayJuego()?game:null,en=!!(g&&g.auto&&g.auto.pausa);
  $('modPausa').textContent=en?'▶ Reanudar':'⏸ Pausar';
  $('modModal').classList.add('open');
}
function modPausa(){if(!O.ctrl)return;const en=!(game.auto&&game.auto.pausa);O.ctrl.pausa(en);modAbrir();toast(en?'Partida en pausa':'Partida reanudada');}
function modSaltar(){if(O.ctrl){O.ctrl.saltar();$('modModal').classList.remove('open');toast('Paso saltado');}}
function modTerminar(){if(confirm('¿Terminar la partida y volver al lobby?')){$('modModal').classList.remove('open');alLobby();}}
function alLobby(){
  pararAuto();
  O.partida=false;
  jugadoresSala().forEach(j=>O.T.enviar(j.id,{tipo:'rol',vs:null}).catch(()=>{}));
  O.T.enviar('todos',{tipo:'estado',phase:'lobby',jug:null,ganador:null,puntos:null,noche:1,dia:0}).catch(()=>{});
  if(O.T.guardarExtra)O.T.guardarExtra({});
  show('scr-lobby');renderLobby();
}

/* ===== sincronización del anfitrión: estado público + vista privada de cada jugador ===== */
function sync(ya){
  if(!O.activo||!O.host||!O.partida||!hayJuego())return;
  clearTimeout(O.syncT);
  O.syncT=setTimeout(difundir,ya?0:150);
}
const FLOW_ACC=['ladron','modelo','amor','manada','rojo','judas','bruja','vidente','zorra','policia','inquisidor','careto'];
// El narrador entra en un paso: se abren las preguntas de ese paso en los móviles de quien debe responder.
function paso(){
  if(!O.activo||!O.host||!O.partida||!hayJuego()||!fasePhones())return;
  const st=game.steps&&game.steps[game.stepIdx];if(!st)return;
  const key=game.night+':'+game.stepIdx+':'+st.action;
  if(game.pasoKey===key)return;
  game.pasoKey=key;
  game.prompts={};game.accionAbierta=null;game.preguntados=[];
  if(FLOW_ACC.includes(st.action))game.preguntados=Flow.abrir(game,cfg,st.action);
  else if(st.action==='votacion'){game.vote=null;game.preguntados=Flow.abrirVoto(game,cfg);}
  else if(st.action==='medium')Flow.infoMedium(game);
  if(game.pending&&game.pending.length)Flow.abrirPendientes(game);
  sync(true);
}
// ¿Es de noche? (antes del paso «El pueblo despierta»). De noche solo habla la manada; de día, el pueblo.
function esNoche(){
  if(!hayJuego()||!game.steps||!game.steps.length)return false;
  const i=game.steps.findIndex(st=>st.action==='despierta');
  return i<0?false:game.stepIdx<i;
}
function hostChat(m){
  if(!O.host||!O.partida||!hayJuego()||!cfg.accionesMovil)return;
  const p=game.assigned[m.seat];if(!p||p.pid!==m.de||!p.vivo)return;
  const texto=String(m.texto||'').trim().slice(0,200);if(!texto)return;
  const t=Date.now();if(O.chatT[m.seat]&&t-O.chatT[m.seat]<700)return;O.chatT[m.seat]=t;
  const msg={n:p.name,t:texto,ts:t};
  if(m.canal==='lobos'){
    if(!Engine.isWolf(p)||!esNoche())return;
    (game.chatLobos=game.chatLobos||[]).push(msg);if(game.chatLobos.length>40)game.chatLobos.shift();
  }else if(m.canal==='dia'){
    if(esNoche()||p.preso)return; // los arrestados no se pueden comunicar
    (game.chatDia=game.chatDia||[]).push(msg);if(game.chatDia.length>40)game.chatDia.shift();
  }else return;
  sync(true);
}
function pasoActual(){const st=hayJuego()&&game.steps&&game.steps[game.stepIdx];return st?st.action:null;}
// La Niña a distancia solo puede espiar mientras la manada está despierta (paso «manada» del modo guiado).
function ninaDisponible(p){return !!cfg.ninaRemota&&cfg.mode===2&&pasoActual()==='manada'&&!game.nightResolved&&Engine.ninaPuede(game,p.idx);}
function vistaDe(p){
  const lobo=Engine.isWolf(p);
  const pareja=p.amor?game.assigned.find(o=>o.amor&&o.idx!==p.idx):null;
  const modelo=p.roles.includes('ninoSalvaje')&&!p.lobo?game.assigned.find(o=>o.modelo):null;
  return{idx:p.idx,nombre:p.name,cartas:cardsOf(p),vivo:p.vivo,lobo,
    lobos:lobo?game.assigned.filter(o=>Engine.isWolf(o)&&o.idx!==p.idx).map(o=>o.name):null,
    amor:pareja?pareja.name:null,modelo:modelo?modelo.name:null,nina:ninaDisponible(p),
    prompt:(game.prompts&&game.prompts[p.idx])||null,
    chatLobos:lobo?(game.chatLobos||[]).slice(-30):null,preso:!!p.preso,
    infectado:(lobo&&game.infected!==null&&game.infected!==undefined&&game.assigned[game.infected])?game.assigned[game.infected].name:null,
    res:(game.res&&game.res[p.idx]&&game.res[p.idx].noche===game.night)?game.res[p.idx].t:null,
    robado:!!p.robado};
}
function difundir(){
  if(!O.activo||!O.host||!O.partida||!hayJuego())return;
  const w=game.winner;
  const pts=w?Engine.puntuar(game,w).sort((x,y)=>y.total-x.total).map(r=>({n:r.name,t:r.total,d:[r.equipo&&'equipo '+r.equipo,r.superv&&'superv. '+r.superv,r.poder&&'poder '+r.poder,r.pareja&&'pareja '+r.pareja].filter(Boolean).join(' · ')})):null;
  const pub={phase:w?'fin':'jugando',noche:game.night,dia:game.day,ganador:w?{em:w.em,t:w.t,d:w.d}:null,puntos:pts,anuncios:(game.anuncios||[]).slice(-12),mov:!!cfg.accionesMovil,momento:esNoche()?'noche':'dia',chat:(game.chatDia||[]).slice(-30),
    off:game.assigned.filter(x=>x.pid&&offline(x.pid)).map(x=>x.name),
    auto:game.auto&&game.auto.paso?{em:game.auto.paso.em,t:game.auto.paso.t,rest:Math.max(0,Math.round((game.auto.rest||0)/1000)),pausa:!!game.auto.pausa,et:game.auto.et||''}:null,
    jug:game.assigned.map(p=>({n:p.name,v:p.vivo?1:0,c:p.vivo?null:p.roles.slice()}))};
  const priv={};game.assigned.forEach(p=>{if(p.pid)(priv[p.pid]=priv[p.pid]||[]).push(vistaDe(p));}); // un móvil puede llevar varios asientos
  const clave=JSON.stringify([pub,priv]);
  if(clave!==O.ultimoSync){
    O.ultimoSync=clave;
    O.T.enviar('todos',{tipo:'estado',...pub}).catch(()=>{});
    Object.keys(priv).forEach(id=>{
      if(id===O.uid){O.vistas=priv[id];if(O.seat>=O.vistas.length)O.seat=0;O.vista=O.vistas[O.seat]||null;if(O.auto)renderJugador();} // el anfitrión que juega recibe su vista sin pasar por la red
      else O.T.enviar(id,{tipo:'rol',vs:priv[id]}).catch(()=>{});
    });
  }
  // el motor se guarda aparte: si el narrador recarga, recupera la partida
  try{O.T.guardarExtra({game:JSON.parse(JSON.stringify(game)),cfg:JSON.parse(JSON.stringify(cfg))});}catch(e){console.warn('guardar:',e&&e.message);}
}

/* ===== acciones de los jugadores (jugador → narrador): por ahora, la Niña a distancia ===== */
function trasRespuesta(r){
  if(O.auto){(r.eventos||[]).forEach(t=>{if(r.accion!=='heredera')Flow.anunciar(game,t);});sync(true);return;}
  if(r.accion==='heredera')continuarLinchamiento();
  else if(r.accion==='voto')refreshVotoMovil();
  else if(r.accion==='cazador'||r.accion==='insignia'){afterAct();}
  if(r.accion==='manada'&&game.empateManada)toast('⚖️ Los lobos han empatado');
  refreshGameUI();
  if(document.getElementById('scr-guided').classList.contains('active')){renderStep();renderPlayersMini();}
  actualizarBarraPendiente();
  sync(true);
}
function hostAccion(m){
  if(!O.host||!O.partida||!hayJuego())return;
  const p=game.assigned[m.seat];
  if(!p||p.pid!==m.de)return; // el remitente verdadero lo pone el transporte: no se puede responder por otro
  if(m.id){
    if(!fasePhones())return;
    const r=Flow.responder(game,cfg,m.seat,String(m.id),m.vals);
    if(!r.ok){if(p.pid===O.uid){O.enviado=false;toast(r.error);renderJugador();}else O.T.enviar(p.pid,{tipo:'evento',k:'error',texto:r.error}).catch(()=>{});return;}
    trasRespuesta(r);return;
  }
  if(m.paso==='nina'){
    if(!cfg.ninaRemota||cfg.mode!==2||pasoActual()!=='manada')return;
    const r=Engine.ninaEspia(game,p.idx);
    if(!r.ok){O.T.enviar(p.pid,{tipo:'evento',k:'nina',seat:p.idx,error:r.motivo}).catch(()=>{});return;}
    if(r.vista)game.acts.ninaVista=true; // los lobos la han visto: morirá esta noche (el narrador lo ve marcado y puede corregirlo)
    if(p.pid===O.uid){O.ninaVio={seat:p.idx,lobo:r.lobo,noche:game.night};renderJugador();}else O.T.enviar(p.pid,{tipo:'evento',k:'nina',seat:p.idx,lobo:r.lobo,noche:game.night}).catch(()=>{});
    if(document.getElementById('scr-guided').classList.contains('active'))renderStep();
    sync(true);
  }
}
function espiar(){const v=O.vista;if(!v||!O.T)return;if(O.host){hostAccion({tipo:'accion',paso:'nina',seat:v.idx,de:O.uid});return;}O.T.enviar('host',{tipo:'accion',paso:'nina',seat:v.idx}).catch(e=>toast(e.message));}

/* ===== pantalla del jugador ===== */
function route(){
  if(!O.activo||(O.host&&!O.auto))return;
  const jugando=O.pub.phase==='jugando'||O.pub.phase==='fin';
  if(jugando){show('scr-jugador');renderJugador();}
  else{if(document.getElementById('scr-jugador').classList.contains('active'))show('scr-lobby');renderLobby();}
}
function responderPrompt(pr,v){
  const vals={};
  for(const q of pr.preguntas){const x=O.sel[q.k];vals[q.k]=q.modo==='sino'?x===true:(x===undefined?(q.modo==='multi'?[]:null):x);}
  O.enviado=true;renderAccion(v);
  if(O.host){hostAccion({tipo:'accion',id:pr.id,seat:v.idx,vals,de:O.uid});return;} // el anfitrión que juega responde sin red
  O.T.enviar('host',{tipo:'accion',id:pr.id,seat:v.idx,vals}).catch(e=>{O.enviado=false;toast(e.message);renderAccion(v);});
}
function listoPrompt(pr){
  return pr.preguntas.every(q=>{const x=O.sel[q.k];
    if(q.modo==='sino')return true;
    if(q.modo==='uno')return q.opcional||(x!==undefined&&x!==null);
    return q.opcional?((x||[]).length===0||(x||[]).length===q.n):(x||[]).length===q.n;});
}
function renderAccion(v){
  const box=$('pjAccion'),pr=v&&v.prompt;
  if(!pr){box.style.display='none';box.innerHTML='';O.selId=null;O.enviado=false;return;}
  box.style.display='block';
  if(O.selId!==pr.id){O.selId=pr.id;O.sel={};O.enviado=false;}
  box.innerHTML='';
  box.appendChild(mk('h2','section',esc(pr.titulo)));
  box.appendChild(mk('div','hint',esc(pr.texto)));
  pr.preguntas.forEach(q=>{
    box.appendChild(mk('div','pk-label',esc(q.t)+(q.modo==='multi'?' ('+((O.sel[q.k]||[]).length)+'/'+q.n+')':'')));
    const g=mk('div','players-mini');
    const tile=(txt,sel,fn)=>{const d=mk('div','pm'+(sel?' sel2':''),'<div class="pmn">'+esc(txt)+'</div>');if(!O.enviado)d.onclick=fn;else d.style.opacity=.6;g.appendChild(d);};
    if(q.modo==='sino'){
      tile('No',O.sel[q.k]!==true,()=>{O.sel[q.k]=false;renderAccion(v);});
      tile('Sí',O.sel[q.k]===true,()=>{O.sel[q.k]=true;renderAccion(v);});
    }else if(q.modo==='uno'){
      if(q.opcional)tile(q.vacio||'Nadie',O.sel[q.k]===undefined||O.sel[q.k]===null,()=>{O.sel[q.k]=null;renderAccion(v);});
      q.opciones.forEach(o=>tile(o.t,O.sel[q.k]===o.v,()=>{O.sel[q.k]=o.v;renderAccion(v);}));
    }else{
      q.opciones.forEach(o=>tile(o.t,(O.sel[q.k]||[]).includes(o.v),()=>{const a=(O.sel[q.k]||[]).slice(),i=a.indexOf(o.v);if(i>=0)a.splice(i,1);else if(a.length<q.n)a.push(o.v);O.sel[q.k]=a;renderAccion(v);}));
    }
    box.appendChild(g);
  });
  const b=mk('button','btn btn-primary btn-sm',O.enviado?'⏳ Enviado, esperando…':'✅ Confirmar');
  b.disabled=O.enviado||!listoPrompt(pr);b.style.opacity=b.disabled?.6:1;
  b.onclick=()=>responderPrompt(pr,v);box.appendChild(b);
}
function enviarChat(){
  const v=O.vista,inp=$('pjChatIn');if(!v||!inp)return;
  const texto=inp.value.trim();if(!texto)return;
  inp.value='';
  if(O.host)hostChat({tipo:'chat',seat:v.idx,canal:O.chatTab,texto,de:O.uid});
  else O.T.enviar('host',{tipo:'chat',seat:v.idx,canal:O.chatTab,texto}).catch(e=>toast(e.message));
}
function renderChat(v,p,comp){
  const box=$('pjChat');
  if(!v||!p.mov||comp||p.phase==='lobby'){box.style.display='none';return;}
  box.style.display='block';
  const lobo=!!(v.lobo&&v.chatLobos);
  if(!lobo)O.chatTab='dia';
  const noche=p.momento==='noche';
  const tabs=$('pjChatTabs');tabs.innerHTML='';
  if(lobo){[['dia','💬 Pueblo'],['lobos','🐺 Lobos']].forEach(([k,t])=>{const b=mk('button','iconbtn',t);if(O.chatTab===k){b.style.background='var(--copper)';b.style.color='var(--navy-dd)';}b.onclick=()=>{O.chatTab=k;renderChat(v,p,comp);};tabs.appendChild(b);});}
  const msgs=O.chatTab==='lobos'?(v.chatLobos||[]):(p.chat||[]);
  const log=$('pjChatLog');
  const abajo=log.scrollTop+log.clientHeight>=log.scrollHeight-20;
  log.innerHTML=msgs.length?msgs.map(m=>'<div style="margin:3px 0"><b style="color:var(--copper-l)">'+esc(m.n)+':</b> '+esc(m.t)+'</div>').join(''):'<div class="hint">Aún no hay mensajes.</div>';
  if(abajo)log.scrollTop=log.scrollHeight;
  const inp=$('pjChatIn'),btn=$('pjChatSend');
  let motivo='';
  if(!v.vivo)motivo='Los muertos no pueden hablar';
  else if(O.chatTab==='dia'&&noche)motivo='De noche no se puede hablar con el pueblo';
  else if(O.chatTab==='dia'&&v.preso)motivo='Estás arrestado: hoy no puedes hablar';
  else if(O.chatTab==='lobos'&&!noche)motivo='La manada solo habla de noche';
  inp.disabled=btn.disabled=!!motivo;inp.placeholder=motivo||'Escribe un mensaje…';
}
function pasarMovil(){
  if(O.vistas.length<2)return;
  O.seat=(O.seat+1)%O.vistas.length;O.vista=O.vistas[O.seat];O.revelado=false;O.cartasKey='';clearTimeout(O.flipT);
  renderJugador();
}
function renderJugador(){
  if(!O.activo||(O.host&&!O.auto)||!document.getElementById('scr-jugador').classList.contains('active'))return;
  const v=O.vista=O.vistas[O.seat]||null,p=O.pub,comp=O.vistas.length>1;
  $('pjTitle').textContent=comp&&v?v.nombre:O.nombre;
  $('pjMod').style.display=O.host&&O.auto?'':'none';
  const fz=$('pjFase'),au=p.auto;
  if(au&&p.phase==='jugando'){fz.style.display='block';fz.innerHTML=(au.pausa?'⏸ <b>En pausa</b> · ':'')+esc(au.em+' '+au.t)+(au.et&&au.et!==au.t?' · '+esc(au.et):'')+(au.rest?' · <b>'+au.rest+' s</b>':'')+((p.off&&p.off.length)?'<br>📴 Sin conexión: '+p.off.map(esc).join(', '):'');}else fz.style.display='none';
  $('pjNight').textContent=p.noche||1;$('pjDay').textContent=p.dia||0;
  const wb=$('pjWin');
  if(p.ganador){$('pjWinEm').textContent=p.ganador.em;$('pjWinT').textContent=p.ganador.t;$('pjWinD').textContent=p.ganador.d;wb.classList.add('show');}else wb.classList.remove('show');
  renderAccion(v&&(!comp?v:null)||null);
  renderChat(v,p,comp);
  const pp=$('pjPuntos');
  if(p.puntos&&p.puntos.length){pp.style.display='block';pp.innerHTML='<h2 class="section">Puntuación</h2>'+p.puntos.map(r=>'<div class="res-row"><div class="rnum">'+r.t+'</div><div class="rinfo"><div class="rpn">'+esc(r.n)+'</div><div class="rroles" style="font-size:11.5px;color:var(--muted)">'+(r.d||'—')+'</div></div></div>').join('');}
  else pp.style.display='none';
  const est=$('pjEstado');est.innerHTML='';
  if(!v){est.innerHTML='<div class="hint">Esperando tu carta…</div>';}
  else{
    if(comp)est.appendChild(mk('div','info-box','👥 Móvil compartido: ahora juega <b>'+esc(v.nombre)+'</b>. Toca la carta para verla y, al terminar, pasa el móvil.'));
    est.appendChild(mk('div','',v.vivo?'🟢 <b>Estás vivo</b>':'💀 <b>Has muerto</b>: ya no puedes hablar ni votar, pero puedes mirar.'));
    // en un móvil compartido la información privada solo aparece mientras la carta está a la vista
    if(!comp||O.revelado){
      if(v.res)est.appendChild(mk('div','info-box ok','🔒 '+esc(v.res)));
      if(v.robado)est.appendChild(mk('div','info-box bad','💰 El Ladrón te ha robado la carta: ahora eres Aldeano.'));
      if(v.infectado)est.appendChild(mk('div','info-box bad','🐀 <b>'+esc(v.infectado)+'</b> está infectado por la Rata: esta noche no participa y morirá.'));
      if(v.lobo&&v.lobos)est.appendChild(mk('div','info-box bad','🐺 Eres <b>Lobo</b>.'+(v.lobos.length?' Tu manada: <b>'+v.lobos.map(esc).join(', ')+'</b>':' Estás solo en la manada.')));
      if(v.amor)est.appendChild(mk('div','info-box','💘 Estás enamorado/a de <b>'+esc(v.amor)+'</b>. Si uno muere, el otro muere de pena.'));
      if(v.modelo)est.appendChild(mk('div','info-box','🎯 Tu Modelo es <b>'+esc(v.modelo)+'</b>. Si muere, te conviertes en Lobo.'));
      const nv=O.ninaVio&&O.ninaVio.seat===v.idx&&(O.ninaVio.error||O.ninaVio.noche===p.noche)?O.ninaVio:null;
      if(nv&&nv.lobo)est.appendChild(mk('div','info-box bad','👁 Has espiado: <b>'+esc(nv.lobo)+'</b> es Lobo. Cuidado, pueden haberte visto.'));
      else if(nv&&nv.error)est.appendChild(mk('div','info-box warn2',esc(nv.error)));
      if(v.nina){const b=mk('button','btn btn-dark btn-sm','👁 Espiar a los lobos (pueden descubrirte)');b.onclick=espiar;est.appendChild(b);}
    }
    if(comp){const sig=O.vistas[(O.seat+1)%O.vistas.length];const b=mk('button','btn btn-primary btn-sm','Pasar el móvil a '+esc(sig.nombre)+' ›');b.onclick=pasarMovil;est.appendChild(b);}
  }
  // cartas: solo se reconstruyen si cambian (para no cortar el giro si llega una actualización)
  const key=v?JSON.stringify([O.seat,v.cartas]):'';
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
          clearTimeout(O.flipT);
          const antes=O.revelado;O.revelado=f;
          if(f)O.flipT=setTimeout(()=>{document.querySelectorAll('#pjCards .flip').forEach(x=>x.classList.remove('is-flipped'));O.revelado=false;renderJugador();},10000);
          if(antes!==f)renderJugador();
        };
        wrap.appendChild(flip);
      });
      st.appendChild(wrap);
    }
  }
  const an=$('pjAnuncios');if(an){an.innerHTML=(p.anuncios&&p.anuncios.length)?'<h2 class="section">Anuncios</h2>'+p.anuncios.slice().reverse().map(x=>'<div class="hint" style="margin:3px 0">'+(x.n?'Noche '+x.n+' · ':'')+esc(x.t)+'</div>').join(''):'';}
  const lst=$('pjList');lst.innerHTML='';
  const mias=O.vistas.map(x=>x.idx);
  (p.jug||[]).forEach((j,i)=>{
    const row=mk('div','alg-player');
    row.style.opacity=j.v?1:.55;
    row.append(mk('div','ap-num',String(i+1)),mk('div','ap-name',esc(j.n)+(v&&v.idx===i?' (tú)':(mias.includes(i)?' 📱':''))),
      mk('div','ap-cur',j.v?'':'💀 '+(j.c||[]).map(r=>C[r]?C[r].em+' '+C[r].n:'').join(' · ')));
    lst.appendChild(row);
  });
}

/* ===== arranque ===== */
function initChat(){
  const i=$('pjChatIn'),b=$('pjChatSend');
  if(i&&!i.dataset.ok){i.dataset.ok='1';b.onclick=enviarChat;i.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();enviarChat();}});}
}
function init(){
  initChat();
  if(aplicarEnlace())return;
  recuperar();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();

window.Online={modAbrir,modPausa,modSaltar,modTerminar,paso,activo,esAnfitrion,partidaEnCurso,offline,abrir,volver,conectar,salirConfirm,salir,compartir,qr,repartir,alLobby,sync,recuperar,_estado:O};
return window.Online;
})();
