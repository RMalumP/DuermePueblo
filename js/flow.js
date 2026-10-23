/* js/flow.js — Guion de la partida y preguntas a los móviles de «La aldea se duerme». Sin DOM: navegador (script clásico) y Node (tests).
   · pasos(game,cfg): la lista de pasos de la noche y el día (la usa el modo guiado y el narrador automático).
   · abrir(game,cfg,accion): decide qué jugadores deben responder y deja sus preguntas en game.prompts[asiento].
   · responder(game,cfg,asiento,id,vals): valida la respuesta y la aplica al estado (game.acts, motor).
   El estado va todo dentro de `game` (se guarda y se restaura con él): game.prompts, game.resp, game.votosManada, game.votosDia, game.res, game.anuncios. */
const Flow=(function(){
const E=(typeof Engine!=='undefined')?Engine:require('./engine.js');
const _PD=(typeof PD!=='undefined')?PD:require('./data.js');
const C=_PD.C;

/* ===== guion ===== */
function inPlay(game,cfg,rk){if(rk==='apaixonados')return !!cfg.optional['cupido'];return game.deck.includes(rk);}
function pasos(game,cfg){
  const list=[],has=k=>inPlay(game,cfg,k);
  const add=(k,em,t,tx,ac)=>{if(k===null||has(k))list.push({em,title:t,text:tx,action:ac,phase:'norm'});};
  if(game.night===1&&!game.firstNightDone){
    const p=(k,em,t,tx,ac)=>{if(k===null||has(k))list.push({em,title:t,text:tx,action:ac,phase:'prelim'});};
    p(null,"🌙","El pueblo se duerme","Pide a todos que cierren los ojos.",null);
    p("ladron","💰","Ladrón",game.ladronLeftover?"El Ladrón está entre las 2 cartas sobrantes: nadie lo tiene. Haz como si lo despertaras.":(game.ladronChosen?"El Ladrón ya eligió su carta.":"El Ladrón acaba de recibir su asignación."),game.ladronChosen?null:'ladron');
    if(has('ladron')&&cfg.ladronMode==='intercambio'&&game.ladronChosen&&game.ladronStolenCard){
      p(null,"👁","Mostrar carta al jugador robado","Pasa el teléfono al jugador afectado para que vea que ahora es Aldeano.","ladron_robado");
    }
    p("ninoSalvaje","🧒","Niño Salvaje","El Niño Salvaje despierta y señala a su Modelo (solo el narrador y el Niño lo saben).","modelo");
    p("jabali","🐗","Jabalí","El Jabalí levanta la mano. Anota su posición (no abre los ojos).",null);
    p("nina","👧","Niña","La Niña levanta la mano para que la reconozcas.",null);
    p("cupido","💘","Cupido","El Cupido señala a los dos enamorados. Toca la cabeza de cada uno.","amor");
    p("apaixonados","❤️","Los enamorados","Los enamorados se reconocen entre sí.",null);
  }
  add(null,"🐺","La manada","La manada despierta y elige víctima. Si no se deciden, nadie muere.",'manada');
  add("loboAlfa","👑","Víctima del Alfa","Tras dormirse la manada, el Alfa puede levantar la mano para maldecir a la víctima.",'alfa');
  add("loboRojo","🔴","Lobo Rojo","El Lobo Rojo despierta solo y elige otra víctima (si no ha muerto ningún lobo).",'rojo');
  add("loboJudas","🗡️","Lobo Judas","El Lobo Judas despierta solo y puede eliminar a un lobo.",'judas');
  add("bruja","🧙‍♀️","Bruja","Enséñale solo a quien ha sido devorado: pulgar arriba = curar, pulgar abajo = envenenar.",'bruja');
  add("vidente","🔮","Vidente","La Vidente señala a un jugador. Pulgar arriba si es lobo, abajo si es aldeano.",'vidente');
  add("zorra","🦊","Zorra","La Zorra señala el centro de un trío de vecinos. Pulgar arriba si hay algún lobo.",'zorra');
  add("policia","👮","Policía","El Policía puede arrestar (pulgar abajo) y/o dar inmunidad (pulgar arriba). Una vez cada poder.",'policia');
  add("inquisidor","⚖️","Inquisidor","El Inquisidor puede acusar a sus sospechosos (una sola vez en la partida).",'inquisidor');
  if(has('careto')&&(!game.caretoUsed||game.caretoUsedNight===game.night))add("careto","🎭","Careto","El Careto puede intercambiar dos cartas (una sola vez).","careto");
  if(game.night>=2)add("medium","👻","Médium","El alma del último linchado le dibuja una letra en el aire.",'medium');
  add(null,"☀️","El pueblo despierta","Resuelve la noche y anuncia las muertes sin explicar nunca cómo ni por qué.",'despierta');
  add(null,"💬","Debate","La aldea discute y busca a los lobos.",'debate');
  add(null,"🗳️","Votación","La aldea vota. La Insignia vale por dos y decide los empates.",'votacion');
  add(null,"🌙","El pueblo se duerme","Nueva noche; empieza un nuevo turno normal.",null);
  return list;
}

/* ===== preguntas ===== */
const vivos=game=>E.alivePlayers(game);
const optJ=p=>({v:p.idx,t:p.name});
const Q=(k,t,modo,opciones,extra)=>Object.assign({k,t,modo,opciones:opciones||null},extra||{});
const nuevo=(game,seat,accion,titulo,texto,preguntas,extra)=>Object.assign({id:'n'+game.night+'-'+accion+'-'+seat+'-'+((game.promptSeq=(game.promptSeq||0)+1)),accion,titulo,texto,preguntas},extra||{});
const noLobos=game=>vivos(game).filter(p=>!E.isWolf(p));

// Devuelve [{seat,prompt}]: quién debe responder en esta acción y qué se le pregunta.
function construir(game,cfg,accion){
  const out=[],push=(seat,pr)=>{if(pr)out.push({seat,prompt:pr});};
  const A=role=>E.actor(game,role);
  switch(accion){
    case 'ladron':{
      const l=E.ladronPlayer(game);if(!l||game.ladronChosen)break;
      if(cfg.ladronMode==='intercambio'){
        push(l.idx,nuevo(game,l.idx,accion,'💰 Eres el Ladrón','Puedes robar la carta de otro jugador (pasará a ser Aldeano).',
          [Q('robar','¿A quién robas la carta?','uno',vivos(game).filter(p=>p.idx!==l.idx).map(optJ),{opcional:true})]));
      }else{
        const obligado=E.ladronMustChoose(game);
        push(l.idx,nuevo(game,l.idx,accion,'💰 Eres el Ladrón','Las dos cartas sobrantes son estas. '+(obligado?'Ambas son Lobo: debes quedarte con una.':'Puedes cambiar tu carta por una de ellas.'),
          [Q('carta','Carta que eliges','uno',game.ladronCards.map((rk,i)=>({v:i,t:(C[rk]?C[rk].n:rk)+(C[rk]?' · '+(C[rk].t==='lobo'?'Lobos':'Aldea'):'')})),{opcional:!obligado,vacio:'Quedarme con la mía'})]));
      }
      break;}
    case 'modelo':{
      const n=A('ninoSalvaje');if(!n||game.assigned.some(p=>p.modelo))break;
      push(n.idx,nuevo(game,n.idx,accion,'🧒 Eres el Niño Salvaje','Elige a tu Modelo. Mientras viva eres Aldeano; si muere, te conviertes en Lobo.',
        [Q('modelo','Tu Modelo','uno',vivos(game).filter(p=>p.idx!==n.idx).map(optJ))]));
      break;}
    case 'amor':{
      const c=A('cupido');if(!c||game.assigned.some(p=>p.amor))break;
      push(c.idx,nuevo(game,c.idx,accion,'💘 Eres Cupido','Elige a los dos enamorados (puedes elegirte a ti).',
        [Q('amor','Los dos enamorados','multi',vivos(game).map(optJ),{n:2})]));
      break;}
    case 'manada':{
      const infectado=game.infected;
      vivos(game).filter(p=>E.isWolf(p)&&p.idx!==infectado).forEach(w=>{
        const preg=[Q('victima','Víctima de la manada','uno',noLobos(game).map(optJ),{opcional:true,vacio:'Nadie esta noche'})];
        if(w.roles.includes('loboAlfa')&&E.alfaDisponible(game))preg.push(Q('maldecir','¿Maldecir a la víctima en lugar de matarla? (una sola vez)','sino',null,{opcional:true}));
        push(w.idx,nuevo(game,w.idx,accion,'🐺 La manada despierta','Elegid víctima. Gana la más votada; si hay empate decide el azar.',preg));
      });
      break;}
    case 'rojo':{
      const r=A('loboRojo');if(!r||!E.rojoDisponible(game))break;
      push(r.idx,nuevo(game,r.idx,accion,'🔴 Lobo Rojo','Elige una segunda víctima (no puede ser un lobo).',[Q('victima','Segunda víctima','uno',noLobos(game).map(optJ),{opcional:true,vacio:'Nadie'})]));
      break;}
    case 'judas':{
      const j=A('loboJudas');if(!j)break;
      push(j.idx,nuevo(game,j.idx,accion,'🗡️ Lobo Judas','Puedes eliminar a un lobo.',[Q('lobo','Lobo que eliminas','uno',vivos(game).filter(p=>E.isWolf(p)&&p.idx!==j.idx).map(optJ),{opcional:true,vacio:'Nadie'})]));
      break;}
    case 'bruja':{
      const b=A('bruja');if(!b)break;
      const vic=E.previewVictims(game,game.acts||{});
      const preg=[];
      if(!game.brujaVidaUsada&&vic.length)preg.push(Q('cura','Poción de vida: ¿a quién salvas?','uno',vic.map(v=>optJ(game.assigned[v.idx])),{opcional:true,vacio:'No salvar a nadie'}));
      if(!game.brujaMuerteUsada)preg.push(Q('veneno','Poción de muerte: ¿a quién envenenas?','uno',vivos(game).map(optJ),{opcional:true,vacio:'No envenenar a nadie'}));
      if(!preg.length)break;
      push(b.idx,nuevo(game,b.idx,accion,'🧙‍♀️ Eres la Bruja',vic.length?'Esta noche han devorado a: '+vic.map(v=>game.assigned[v.idx].name).join(', ')+'.':'Esta noche no hay ningún devorado.',preg));
      break;}
    case 'vidente':{
      const v=A('vidente');if(!v)break;
      push(v.idx,nuevo(game,v.idx,accion,'🔮 Eres la Vidente','Elige a quién miras: sabrás si es Lobo o Aldeano.',[Q('ver','Jugador que miras','uno',vivos(game).map(optJ))]));
      break;}
    case 'zorra':{
      const z=A('zorra');if(!z||game.zorraPerdida)break;
      push(z.idx,nuevo(game,z.idx,accion,'🦊 Eres la Zorra','Elige el centro de un trío de vecinos: sabrás si hay algún lobo entre los tres (y si no, pierdes el poder).',[Q('centro','Centro del trío','uno',vivos(game).map(optJ))]));
      break;}
    case 'policia':{
      const p=A('policia');if(!p)break;
      const preg=[];
      if(!game.policiaArrestoUsado)preg.push(Q('arresta','Arrestar a… (mañana no vota ni habla)','uno',vivos(game).map(optJ),{opcional:true,vacio:'No arrestar'}));
      if(!game.policiaInmuneUsado)preg.push(Q('inmune','Dar inmunidad a… (mañana no puede ser votado)','uno',vivos(game).map(optJ),{opcional:true,vacio:'No dar inmunidad'}));
      if(!preg.length)break;
      push(p.idx,nuevo(game,p.idx,accion,'👮 Eres el Policía','Cada poder se usa una sola vez; puedes usar los dos esta noche.',preg));
      break;}
    case 'inquisidor':{
      const i=A('inquisidor');if(!i||i.lobo||game.inquisidorUsado)break;
      const req=E.inquisidorObjetivos(game);
      push(i.idx,nuevo(game,i.idx,accion,'⚖️ Eres el Inquisidor','Una sola vez en la partida: señala a '+req.n+' sospechosos y acierta '+(req.n===req.aciertos?'en todos':'al menos en '+req.aciertos)+'. Si fallas, mueres.',
        [Q('sospechosos','Tus sospechosos','multi',vivos(game).filter(p=>p.idx!==i.idx).map(optJ),{n:req.n,opcional:true,vacio:'No acusar esta noche'})]));
      break;}
    case 'careto':{
      const c=A('careto');if(!c||game.caretoUsed)break;
      push(c.idx,nuevo(game,c.idx,accion,'🎭 Eres el Careto','Una sola vez: intercambia las cartas de dos jugadores (puedes incluirte).',
        [Q('cambio','Los dos jugadores que intercambian cartas','multi',vivos(game).map(optJ),{n:2,opcional:true,vacio:'No cambiar nada'})]));
      break;}
    default:break;
  }
  return out;
}
// Instala las preguntas en game.prompts y devuelve los asientos a los que se ha preguntado.
function abrir(game,cfg,accion){
  game.prompts={};game.resp={};game.accionAbierta=accion;
  if(accion==='manada'){game.votosManada={};game.empateManada=null;}
  const lista=construir(game,cfg,accion);
  lista.forEach(x=>{game.prompts[x.seat]=x.prompt;});
  return lista.map(x=>x.seat);
}
function cerrar(game,rng){
  if(game.accionAbierta==='manada')recontarManada(game,rng);
  game.prompts={};game.accionAbierta=null;
}
function pendientes(game){return Object.keys(game.prompts||{}).map(Number);}
const textoRes=(game,seat,txt)=>{if(!game.res)game.res={};game.res[seat]={noche:game.night,t:txt};};

/* ===== validación ===== */
function validar(pr,vals){
  const out={};vals=vals||{};
  for(const q of pr.preguntas){
    const v=vals[q.k];
    if(q.modo==='sino'){out[q.k]=v===true;continue;}
    if(q.modo==='uno'){
      if(v===undefined||v===null||v===''){if(q.opcional){out[q.k]=null;continue;}return{error:'Falta responder: '+q.t};}
      if(!q.opciones.some(o=>o.v===v))return{error:'Opción no válida.'};
      out[q.k]=v;continue;
    }
    const arr=Array.isArray(v)?[...new Set(v)]:[];
    if(!arr.length&&q.opcional){out[q.k]=[];continue;}
    if(arr.length!==q.n)return{error:'Elige '+q.n+'.'};
    if(!arr.every(x=>q.opciones.some(o=>o.v===x)))return{error:'Opción no válida.'};
    out[q.k]=arr;
  }
  return{ok:true,vals:out};
}

/* ===== recuento de la manada ===== */
// La víctima es la más votada por los lobos que han respondido; el empate lo decide el azar (rng) o el narrador (sin rng).
function recontarManada(game,rng){
  const votos=game.votosManada||{},claves=Object.keys(votos);
  if(!claves.length)return{completo:false};
  const cnt={};claves.forEach(s=>{const k=votos[s]===null?'n':String(votos[s]);cnt[k]=(cnt[k]||0)+1;});
  const max=Math.max(...Object.values(cnt)),top=Object.keys(cnt).filter(k=>cnt[k]===max);
  const val=k=>k==='n'?null:+k;
  if(!game.acts)game.acts={};
  if(top.length===1){game.acts.manada=val(top[0]);game.empateManada=null;return{ganador:val(top[0]),empate:false};}
  game.empateManada=top.map(val);
  if(rng){const k=top[Math.floor(rng()*top.length)];game.acts.manada=val(k);return{ganador:val(k),empate:true,resuelto:true};}
  return{empate:true,resuelto:false};
}

/* ===== aplicar respuestas ===== */
const nm=(game,i)=>game.assigned[i]?game.assigned[i].name:'—';
const APLICAR={
  ladron(game,cfg,seat,v){
    if(cfg.ladronMode==='intercambio'){
      const ev=E.ladronChooseIntercambio(game,v.robar);
      const p=game.assigned[seat];
      textoRes(game,seat,v.robar===null?'Has decidido no robar a nadie.':'Has robado la carta de '+nm(game,v.robar)+'. Ahora tienes: '+p.roles.map(r=>C[r]?C[r].n:r).join(' + ')+'.');
      return{eventos:ev};
    }
    E.ladronChooseExterno(game,v.carta);
    const p=game.assigned[seat];
    textoRes(game,seat,'Tu carta ahora: '+p.roles.map(r=>C[r]?C[r].n:r).join(' + ')+'.');
    return{};
  },
  modelo(game,cfg,seat,v){E.setModelo(game,seat,v.modelo);textoRes(game,seat,'Tu Modelo es '+nm(game,v.modelo)+'.');return{};},
  amor(game,cfg,seat,v){E.setEnamorados(game,v.amor[0],v.amor[1]);textoRes(game,seat,'Has enamorado a '+nm(game,v.amor[0])+' y '+nm(game,v.amor[1])+'.');return{};},
  manada(game,cfg,seat,v){
    if(!game.votosManada)game.votosManada={};
    game.votosManada[seat]=v.victima;
    if(v.maldecir)game.acts.alfaCurse=true;else if(game.acts.alfaCurse&&game.assigned[seat].roles.includes('loboAlfa'))game.acts.alfaCurse=false;
    recontarManada(game);
    return{};
  },
  rojo(game,cfg,seat,v){game.acts.rojo=v.victima;return{};},
  judas(game,cfg,seat,v){game.acts.judas=v.lobo;return{};},
  bruja(game,cfg,seat,v){game.acts.brujaCura=v.cura===undefined?null:v.cura;game.acts.brujaVeneno=v.veneno===undefined?null:v.veneno;return{};},
  vidente(game,cfg,seat,v){
    game.acts.vidente=v.ver;
    const t=E.videnteVe(game,v.ver)==='lobo'?'🐺 '+nm(game,v.ver)+' es LOBO':'🧑‍🌾 '+nm(game,v.ver)+' es ALDEANO';
    textoRes(game,seat,t);return{texto:t};
  },
  zorra(game,cfg,seat,v){
    game.acts.zorra=v.centro;
    const hay=E.zorraVe(game,v.centro);
    const t=hay?'🐺 Hay al menos un lobo entre los tres vecinos de '+nm(game,v.centro):'🧑‍🌾 No hay ningún lobo en el trío de '+nm(game,v.centro)+': pierdes el poder';
    textoRes(game,seat,t);return{texto:t};
  },
  policia(game,cfg,seat,v){game.acts.policiaArresta=v.arresta;game.acts.policiaInmune=v.inmune;return{};},
  inquisidor(game,cfg,seat,v){game.acts.inquisidor=v.sospechosos.length?v.sospechosos:null;return{};},
  careto(game,cfg,seat,v){game.acts.careto=v.cambio.length===2?v.cambio:null;return{};},
  voto(game,cfg,seat,v){if(!game.votosDia)game.votosDia={};game.votosDia[seat]=v.voto;return{};},
  desempate(game,cfg,seat,v){game.desempate=v.elegir;return{};},
  heredera(game,cfg,seat,v,pr){
    if(v.heredar){const ev=E.heredar(game,pr.deadIdx);return{eventos:ev};}
    return{};
  },
  cazador(game,cfg,seat,v){return{eventos:E.resolvePending(game,'cazador',v.disparo)};},
  insignia(game,cfg,seat,v){return{eventos:E.resolvePending(game,'insignia',v.sucesor)};}
};
function responder(game,cfg,seat,id,vals){
  const pr=game.prompts&&game.prompts[seat];
  if(!pr||pr.id!==id)return{ok:false,error:'Esta pregunta ya no está abierta.'};
  const v=validar(pr,vals);if(!v.ok)return{ok:false,error:v.error};
  if(!game.acts)game.acts={};
  const r=APLICAR[pr.accion](game,cfg,seat,v.vals,pr)||{};
  delete game.prompts[seat];
  if(!game.resp)game.resp={};game.resp[seat]=true;
  return Object.assign({ok:true,accion:pr.accion},r);
}

/* ===== día: votación, desempate, Heredera y decisiones pendientes ===== */
// solo: si no es null, lista de candidatos (segunda ronda entre empatados)
function abrirVoto(game,cfg,solo){
  game.prompts={};game.resp={};game.accionAbierta='votacion';game.votosDia={};game.votoSolo=solo||null;
  const cand=vivos(game).filter(p=>E.puedeSerVotado(game,p.idx)&&(!solo||solo.includes(p.idx)));
  E.votantes(game).forEach(v=>{
    const ops=cand.filter(c=>E.puedeVotarA(game,v.idx,c.idx)).map(optJ);
    game.prompts[v.idx]=nuevo(game,v.idx,'voto','🗳️ Votación','Vota a quien quieres linchar. '+(v.insignia?'Tu voto vale por dos.':''),
      [Q('voto','Tu voto','uno',ops,{opcional:true,vacio:'No votar a nadie'})]);
  });
  return Object.keys(game.prompts).map(Number);
}
// Recuento de los votos recibidos: usa el motor (Insignia doble). Devuelve el resultado de Engine.tally + cuántos han votado.
function contarVotos(game){
  const counts={},votos=game.votosDia||{};let alguacil=null;
  const alg=vivos(game).find(p=>p.insignia&&!p.preso);
  Object.keys(votos).forEach(s=>{const t=votos[s];if(t===null||t===undefined)return;counts[t]=(counts[t]||0)+1;if(alg&&+s===alg.idx)alguacil=t;});
  const t=E.tally(game,counts,alguacil);t.votaron=Object.keys(votos).length;t.counts=counts;t.votoAlguacil=alguacil;return t;
}
function abrirDesempate(game,tied){
  const alg=vivos(game).find(p=>p.insignia);if(!alg)return null;
  game.prompts={};game.resp={};game.accionAbierta='desempate';game.desempate=undefined;
  game.prompts[alg.idx]=nuevo(game,alg.idx,'desempate','👮 Desempate','Hay empate: decide con tu Insignia a quién se linchará.',[Q('elegir','Linchar a','uno',tied.map(i=>optJ(game.assigned[i])))]);
  return alg.idx;
}
function abrirHeredera(game,deadIdx){
  const h=E.herederaElegible(game,deadIdx);if(!h)return null;
  game.prompts={};game.resp={};game.accionAbierta='heredera';
  game.prompts[h.idx]=nuevo(game,h.idx,'heredera','👑 Eres la Heredera','Van a linchar a '+nm(game,deadIdx)+'. Puedes quedarte con su carta (y todo lo que sabía).',[Q('heredar','¿Heredar su carta?','sino',null)],{deadIdx});
  return h.idx;
}
// Decisiones que esperan a una persona: disparo del Cazador y sucesor de la Insignia.
function abrirPendientes(game){
  const seats=[];
  (game.pending||[]).forEach(it=>{
    if(!game.prompts)game.prompts={};
    if(game.prompts[it.idx])return; // un asiento solo tiene una pregunta a la vez: la siguiente se abre al contestar esta
    const otros=vivos(game).filter(p=>p.idx!==it.idx).map(optJ);
    if(!otros.length)return;
    if(it.tipo==='cazador')game.prompts[it.idx]=nuevo(game,it.idx,'cazador','🏹 Has muerto, Cazador','Antes de caer te llevas a otro jugador.',[Q('disparo','¿A quién te llevas?','uno',otros,{opcional:true,vacio:'A nadie'})]);
    else if(it.tipo==='insignia')game.prompts[it.idx]=nuevo(game,it.idx,'insignia','👮 Has muerto con la Insignia','Nombra a tu sucesor (su voto valdrá por dos).',[Q('sucesor','Sucesor','uno',otros,{opcional:true,vacio:'Nadie'})]);
    seats.push(it.idx);
  });
  return seats;
}
// El Médium recibe el nombre del último linchado (desde la 2ª noche); la letra la «dibuja» el muerto en la sala, no aquí.
function infoMedium(game){
  const m=E.actor(game,'medium'),l=game.lastLynched;
  if(!m||l===null||l===undefined||!game.assigned[l])return;
  textoRes(game,m.idx,'👻 El alma de '+game.assigned[l].name+' (linchado ayer) te habla desde el más allá.');
}
function anunciar(game,txt){if(!game.anuncios)game.anuncios=[];game.anuncios.push({n:game.night,d:game.day,t:txt});if(game.anuncios.length>60)game.anuncios.shift();}

return{infoMedium,pasos,inPlay,construir,abrir,cerrar,pendientes,validar,responder,recontarManada,abrirVoto,contarVotos,abrirDesempate,abrirHeredera,abrirPendientes,anunciar};
})();
if(typeof module!=='undefined')module.exports=Flow;
