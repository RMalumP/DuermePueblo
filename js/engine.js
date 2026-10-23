/* js/engine.js — Motor de reglas de «La aldea se duerme». Sin DOM: lo cargan el navegador (script clásico) y Node (tests).
   Las funciones modifican el objeto `game` y devuelven la lista de avisos (texto) que la interfaz puede mostrar.
   Las decisiones que necesitan a una persona (disparo del Cazador, sucesor de la Insignia) se encolan en `game.pending`. */
const Engine=(function(){
const _PD=(typeof PD!=='undefined')?PD:require('./data.js');
const {C,OPTIONAL}=_PD;
const WOLF_ROLES=['lobo','loboAlfa','loboJudas','loboRojo'];

/* ===== utilidades ===== */
function shuffle(a,rng){const r=rng||Math.random;for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function recWolvesFor(n){if(n<=11)return 2;if(n<=16)return 3;if(n<=20)return 4;return 5;}
function mkPlayer(i,name,roles,isNar){return{idx:i,name,roles:roles.slice(),isNar:!!isNar,vivo:true,amor:false,lobo:false,modelo:false,inmune:false,preso:false,insignia:false,revived:false,robado:false,stolenCard:null,deathCause:null};}
function isWolf(p){return !p.isNar&&(p.lobo||p.roles.some(r=>WOLF_ROLES.includes(r)));}
function alivePlayers(game){return game.assigned.filter(p=>p.vivo&&!p.isNar);}
// Quién ve una carta en el reparto: todos salvo el narrador fijo (el narrador por carta sí ve la suya).
function revealList(game){return game.assigned.filter(p=>p.idx!==game.fixedNarIdx);}

/* ===== configuración ===== */
function selOpt(cfg){return OPTIONAL.map(([k])=>k).filter(k=>cfg.optional[k]);}
function selWolf(cfg){return selOpt(cfg).filter(k=>C[k].t==='lobo');}
function selVillage(cfg){return selOpt(cfg).filter(k=>C[k].t!=='lobo'&&k!=='insignia');}
function narratorPlan(cfg){
  const fixedIdx=(cfg.narratorEnabled&&cfg.narrator!=='random'&&cfg.narrator!=='none')?+cfg.narrator:-1;
  return{fixedIdx,randomCard:!!(cfg.narratorEnabled&&cfg.narrator==='random')};
}
function totalCards(cfg){return cfg.players-(narratorPlan(cfg).fixedIdx>=0?1:0);}
function capacity(cfg){
  const np=narratorPlan(cfg),total=totalCards(cfg);
  const vCap=total-(cfg.wolves+(np.randomCard?1:0));
  const sw=selWolf(cfg).length,sv=selVillage(cfg).length;
  if(sw>cfg.wolves)return{ok:false,msg:`Has elegido ${sw} lobos especiales pero solo hay ${cfg.wolves} plazas de lobo.`};
  if(sv>vCap)return{ok:false,msg:`No caben tantas cartas de aldea (${sv}) para ${total} cartas con ${cfg.wolves} lobos.`};
  return{ok:true,msg:''};
}
function maxWolves(cfg){return Math.max(1,totalCards(cfg)-1-(narratorPlan(cfg).randomCard?1:0));}

/* ===== creación de la partida ===== */
function createGame(cfg,rng){
  rng=rng||Math.random;
  const np=narratorPlan(cfg);
  let fixed=np.fixedIdx,randomCard=np.randomCard,forcedNarrator=false;
  const ladronExt=!!(cfg.optional.ladron&&cfg.ladronMode==='externo');
  // Con las 2 cartas sobrantes del Ladrón alguien tiene que ser Narrador (libro §3.1): nunca puede quedar fuera del reparto.
  if(ladronExt&&randomCard){fixed=Math.floor(rng()*cfg.players);randomCard=false;forcedNarrator=true;}
  const total=cfg.players-(fixed>=0?1:0);
  let deck=[];
  if(randomCard)deck.push('narrador');
  selWolf(cfg).forEach(k=>deck.push(k));
  for(let i=selWolf(cfg).length;i<cfg.wolves;i++)deck.push('lobo');
  selVillage(cfg).forEach(k=>deck.push(k));
  while(deck.length<total)deck.push('aldeano');
  let ladronCards=[];
  if(ladronExt){
    deck.push('aldeano','aldeano');
    shuffle(deck,rng);
    ladronCards=deck.splice(total,2);
  }else shuffle(deck,rng);
  const assigned=[];let di=0;
  for(let i=0;i<cfg.players;i++){
    const name=(cfg.names&&cfg.names[i])||('Jugador '+(i+1));
    if(i===fixed)assigned.push(mkPlayer(i,name,['narrador'],true));
    else{const r=deck[di++];assigned.push(mkPlayer(i,name,[r],r==='narrador'));}
  }
  if(cfg.optional.insignia&&cfg.insigniaMode==='random'){
    const cand=assigned.filter(p=>!p.isNar);
    if(cand.length)cand[Math.floor(rng()*cand.length)].insignia=true;
  }
  const game={assigned,deck,ladronCards,ladronChosen:false,ladronStolenCard:null,ladronLeftover:false,
    caretoUsed:false,night:1,day:0,firstNightDone:false,winner:null,pending:[],borrachoWin:null,fixedNarIdx:fixed,infected:null,lastLynched:null,
    narratorNote:forcedNarrator?`Con el Ladrón hace falta un narrador: ${assigned[fixed].name}.`:null};
  if(ladronExt&&!ladronPlayer(game)){game.ladronChosen=true;game.ladronLeftover=true;} // el Ladrón es una de las cartas sobrantes
  game.initialWolves=assigned.filter(isWolf).length;
  return game;
}

/* ===== muertes y cascadas ===== */
// Orden de mesa = orden de índice; «izquierda» = índice creciente. Los muertos y el narrador no cuentan como vecinos.
function neighbors(game,idx){
  const n=game.assigned.length,ok=p=>p.vivo&&!p.isNar,res={left:null,right:null};
  for(let i=1;i<n;i++){const p=game.assigned[(idx+i)%n];if(ok(p)){res.left=p;break;}}
  for(let i=1;i<n;i++){const p=game.assigned[(idx-i+n)%n];if(ok(p)){res.right=p;break;}}
  return res;
}
function nextWolfLeft(game,idx){
  const n=game.assigned.length;
  for(let i=1;i<n;i++){const p=game.assigned[(idx+i)%n];if(p.vivo&&!p.isNar&&isWolf(p))return p;}
  return null;
}
const NIGHT_CAUSES=['noche','veneno','infeccion','inquisidor','judas'];
// cause: 'noche' | 'voto' | 'veneno' | 'judas' | 'infeccion' | 'inquisidor' | 'cazador' | 'pena'
// night: la muerte cuenta como «suceso nocturno» (para la Rata). Por defecto sale de la causa; pena y Cazador lo heredan.
function kill(game,idx,cause,night){
  const ev=[],p=game.assigned[idx];
  if(!p||!p.vivo||p.isNar)return ev;
  if(night===undefined)night=NIGHT_CAUSES.includes(cause);
  p.vivo=false;p.deathCause=cause||'noche';
  if(isWolf(p))game.wolfDied=true;                  // el Lobo Rojo deja de poder actuar
  if(game.infected===p.idx)game.infected=null;      // el Lobo infectado ya no transmite nada
  // Borracho: solo gana si le linchan en la primera votación (la del primer día).
  if(p.deathCause==='voto'&&game.night===1&&p.roles.includes('borracho')&&!p.amor)game.borrachoWin=p.idx;
  // Rata: si muere de noche infecta al primer Lobo a su izquierda (antes de que el Niño Salvaje se convierta).
  if(night&&p.roles.includes('rata')){
    const w=nextWolfLeft(game,p.idx);
    if(w){game.infected=w.idx;game.infectedNote=w.idx;}
  }
  // Enamorado: la pareja muere de pena (pasa por kill: puede ser Cazador, Modelo, portador de la Insignia…).
  if(p.amor){
    const partner=game.assigned.find(o=>o.amor&&o.idx!==p.idx&&o.vivo);
    if(partner){ev.push(`💘 ${partner.name} muere de pena por ${p.name}`);ev.push(...kill(game,partner.idx,'pena',night));}
  }
  // Modelo del Niño Salvaje: el Niño se convierte en Lobo.
  if(p.modelo){
    const nino=game.assigned.find(o=>o.roles.includes('ninoSalvaje')&&o.vivo&&!o.lobo);
    if(nino){nino.lobo=true;ev.push(`🧒→🐺 ${nino.name} (Niño Salvaje) se convierte en Lobo`);}
  }
  if(p.insignia){
    p.insignia=false;
    if(alivePlayers(game).length)game.pending.push({tipo:'insignia',idx:p.idx});
  }
  if(p.roles.includes('cazador'))game.pending.push({tipo:'cazador',idx:p.idx,night});
  return ev;
}
function revive(game,idx){
  const p=game.assigned[idx];
  if(!p||p.vivo||p.isNar)return[];
  p.vivo=true;p.revived=true;p.deathCause=null;
  game.pending=game.pending.filter(x=>x.idx!==idx);
  if(game.borrachoWin===idx)game.borrachoWin=null;
  return[`✚ ${p.name} revive`];
}
function resolvePending(game,tipo,targetIdx){
  const i=game.pending.findIndex(x=>x.tipo===tipo);
  if(i<0)return[];
  const item=game.pending.splice(i,1)[0];
  if(targetIdx===null||targetIdx===undefined)return[];
  if(tipo==='cazador'){
    const hunter=game.assigned[item.idx],target=game.assigned[targetIdx];
    return[`🏹 ${hunter.name} se lleva a ${target.name}`,...kill(game,targetIdx,'cazador',item.night)];
  }
  if(tipo==='insignia'){setInsignia(game,targetIdx);return[`👮 Alguacil: ${game.assigned[targetIdx].name}`];}
  return[];
}
function setInsignia(game,idx){
  game.assigned.forEach(x=>{x.insignia=false;});
  const p=game.assigned[idx];
  if(p&&p.vivo&&!p.isNar)p.insignia=true;
}

/* ===== ciclo noche / día ===== */
// La inmunidad y el arresto del Policía solo valen un día: se limpian al empezar la noche siguiente.
function startNight(game){game.night++;game.assigned.forEach(p=>{p.inmune=false;p.preso=false;});}
function nextCycle(game){if(game.night===1)game.firstNightDone=true;game.day++;startNight(game);}

/* ===== Niña a distancia (opcional, desactivada por defecto) ===== */
// En la sala la Niña abre los ojos de verdad. Para partidas a distancia: espía desde su móvil, ve a UN lobo al azar y
// tiene 1 posibilidad entre 3 de ser descubierta (entonces muere esa noche en lugar de la víctima). Una vez por noche.
const NINA_RIESGO=1/3;
function ninaPuede(game,idx){
  const p=game.assigned[idx];
  return !!p&&p.vivo&&!p.isNar&&p.roles.includes('nina')&&!isWolf(p)&&game.ninaEspioNoche!==game.night&&alivePlayers(game).some(isWolf);
}
function ninaEspia(game,idx,rng){
  rng=rng||Math.random;
  if(!ninaPuede(game,idx))return{ok:false,motivo:'La Niña no puede espiar ahora.'};
  game.ninaEspioNoche=game.night;
  const lobos=alivePlayers(game).filter(isWolf);
  const visto=lobos[Math.floor(rng()*lobos.length)];
  return{ok:true,lobo:visto.name,vista:rng()<NINA_RIESGO};
}

/* ===== Ladrón ===== */
function ladronPlayer(game){return game.assigned.find(p=>p.roles.includes('ladron')&&!p.isNar)||null;}
function ladronMustChoose(game){const l=game.ladronCards;return l.length>=2&&l.every(r=>C[r]&&C[r].t==='lobo');}
// idx: 0/1 = carta sobrante elegida, null = conservar la suya (no permitido si ambas son Lobo).
function ladronChooseExterno(game,idx){
  const p=ladronPlayer(game);
  if((idx===null||idx===undefined)&&ladronMustChoose(game))idx=0;
  if(p&&idx!==null&&idx!==undefined)p.roles=['ladron',game.ladronCards[idx]];
  game.ladronCards=[];game.ladronChosen=true;
}
// Variante «intercambio» (no está en el libro): roba la carta de otro jugador, que pasa a Aldeano.
function ladronChooseIntercambio(game,targetIdx){
  const l=ladronPlayer(game),t=(targetIdx===null||targetIdx===undefined)?null:game.assigned[targetIdx];
  let ev=[];
  if(l&&t&&!t.isNar&&t!==l){
    const stolen=t.roles[0];
    game.ladronStolenCard=stolen;l.stolenCard=stolen;
    l.roles=['ladron',stolen];
    t.robado=true;t.roles=['aldeano'];
    ev=[`💰 Ladrón robó la carta de ${t.name}`];
  }
  game.ladronChosen=true;
  return ev;
}

/* ===== Careto ===== */
function caretoSwap(game,i,j){
  const a=game.assigned[i],b=game.assigned[j];
  if(!a||!b||a===b)return[];
  const tmp=a.roles.slice();a.roles=b.roles.slice();b.roles=tmp;
  game.caretoUsed=true;
  return[`🎭 Careto: ${a.name} ↔ ${b.name}`];
}


/* ===== Noche: quién actúa y resolución ===== */
function actor(game,role){return game.assigned.find(p=>p.vivo&&!p.isNar&&p.roles.includes(role))||null;}
function holders(game){
  const r={};['loboAlfa','loboRojo','loboJudas','bruja','vidente','zorra','policia','inquisidor','careto','medium','jabali','nina','cupido','ninoSalvaje','heredera'].forEach(k=>{r[k]=actor(game,k);});
  return r;
}
const alfaDisponible=game=>!game.alfaUsada&&!!actor(game,'loboAlfa');
const rojoDisponible=game=>!game.wolfDied&&!!actor(game,'loboRojo')&&!(actor(game,'loboRojo')&&actor(game,'loboRojo').idx===game.infected);
function inquisidorObjetivos(game){
  const n=game.initialWolves!==undefined?game.initialWolves:alivePlayers(game).filter(isWolf).length;
  if(n<=1)return{n:1,aciertos:1};
  if(n<=3)return{n:2,aciertos:2};
  return{n:3,aciertos:2};
}
function jabaliHuele(game){
  const j=actor(game,'jabali');if(!j)return null;
  const nb=neighbors(game,j.idx);
  return[nb.left,nb.right].some(p=>p&&p.idx!==j.idx&&isWolf(p));
}
// La Vidente ve Lobo si el jugador es Lobo, también maldito o convertido; nunca se dice de qué tipo.
function videnteVe(game,idx){const p=game.assigned[idx];return p&&!p.isNar?(isWolf(p)?'lobo':'aldeano'):null;}
function zorraVe(game,centerIdx){
  const c=game.assigned[centerIdx];if(!c||c.isNar)return null;
  const nb=neighbors(game,centerIdx);
  const trio=[c];if(nb.left&&nb.left.idx!==c.idx)trio.push(nb.left);if(nb.right&&nb.right.idx!==c.idx&&nb.right!==nb.left)trio.push(nb.right);
  return trio.some(isWolf);
}
const valid=(game,idx)=>{const p=idx===null||idx===undefined?null:game.assigned[idx];return p&&p.vivo&&!p.isNar?p:null;};

// Muertes previstas por la manada, el Rojo y el Judas: las ve la Bruja para decidir. No cambia el estado (solo lee).
function previewVictims(game,a){
  const out=[];
  const v1=valid(game,a.manada),nina=actor(game,'nina');
  const alfa=a.alfaCurse&&alfaDisponible(game)&&v1&&!isWolf(v1);
  if(a.ninaVista&&nina)out.push({idx:nina.idx,por:'manada'});
  else if(v1&&!alfa&&!isWolf(v1))out.push({idx:v1.idx,por:'manada'});
  const rojo=valid(game,a.rojo);
  if(rojo&&rojoDisponible(game)&&!isWolf(rojo)&&!out.some(x=>x.idx===rojo.idx))out.push({idx:rojo.idx,por:'rojo'});
  const jd=valid(game,a.judas),judas=actor(game,'loboJudas');
  if(jd&&judas&&isWolf(jd)&&jd.idx!==judas.idx&&!out.some(x=>x.idx===jd.idx))out.push({idx:jd.idx,por:'judas'});
  return out;
}

// a = { manada, alfaCurse, ninaVista, rojo, judas, brujaCura, brujaVeneno, vidente, zorra, policiaArresta, policiaInmune, inquisidor:[idx], careto:[i,j] }
// Devuelve { muertes:[{idx,causa}], info:{vidente,zorra,inquisidor,maldito}, avisos:[], manana:[] }
// «avisos» son para el narrador (acciones ignoradas por reglas); «manana» es lo que se anuncia al despertar la aldea.
function resolveNight(game,a){
  a=a||{};
  const rep={muertes:[],info:{},avisos:[],manana:[]},aviso=m=>rep.avisos.push(m),extraM=[];
  const infectado=(game.infected!==null&&game.infected!==undefined)?game.assigned[game.infected]:null;
  game.infected=null;game.infectedNote=null;
  const act={};Object.keys(holders(game)).forEach(k=>{act[k]=actor(game,k);});
  const victims=[]; // {idx,causa}

  // Manada (el Lobo infectado ya no participa: solo cuenta para ver si hay quórum)
  const v1=valid(game,a.manada),nina=act.nina;
  if(v1&&isWolf(v1))aviso('Los lobos no pueden devorar a otro lobo: se ignora la víctima.');
  if(a.alfaCurse&&v1&&!isWolf(v1)&&!(a.ninaVista&&nina)){
    if(!alfaDisponible(game))aviso('El Lobo Alfa ya usó su poder (o no está vivo): la víctima es devorada.');
    else{v1.lobo=true;game.alfaUsada=true;rep.info.maldito=v1.idx;}
  }
  if(a.ninaVista&&nina)victims.push({idx:nina.idx,causa:'noche'}); // la Niña muere en silencio, en lugar de la víctima elegida
  else if(v1&&!isWolf(v1)&&rep.info.maldito===undefined)victims.push({idx:v1.idx,causa:'noche'});

  // Lobo Rojo
  const rj=valid(game,a.rojo);
  if(rj){
    if(!act.loboRojo||!rojoDisponible(game))aviso('El Lobo Rojo no puede actuar (ya murió un lobo, o no está en juego).');
    else if(isWolf(rj))aviso('El Lobo Rojo no puede eliminar a otro lobo.');
    else if(!victims.some(x=>x.idx===rj.idx))victims.push({idx:rj.idx,causa:'noche'});
  }
  // Lobo Judas
  const jd=valid(game,a.judas);
  if(jd){
    if(!act.loboJudas)aviso('El Lobo Judas no está vivo.');
    else if(!isWolf(jd)||jd.idx===act.loboJudas.idx)aviso('El Lobo Judas solo puede eliminar a otro lobo.');
    else if(!victims.some(x=>x.idx===jd.idx))victims.push({idx:jd.idx,causa:'judas'});
  }
  // Bruja
  const br=act.bruja;
  if(br&&(a.brujaCura!==null&&a.brujaCura!==undefined)){
    const t=victims.find(x=>x.idx===a.brujaCura);
    if(game.brujaVidaUsada)aviso('La Bruja ya usó la poción de vida.');
    else if(!t)aviso('La poción de vida solo salva a quien acaba de ser devorado.');
    else if(t.idx===br.idx&&t.causa==='judas'&&br.lobo)aviso('La Bruja/Lobo devorada por el Lobo Judas no puede curarse a sí misma.');
    else{game.brujaVidaUsada=true;victims.splice(victims.indexOf(t),1);}
  }
  if(br&&(a.brujaVeneno!==null&&a.brujaVeneno!==undefined)){
    const t=valid(game,a.brujaVeneno);
    if(game.brujaMuerteUsada)aviso('La Bruja ya usó la poción de muerte.');
    else if(!t)aviso('El veneno necesita un jugador vivo.');
    else{game.brujaMuerteUsada=true;if(!victims.some(x=>x.idx===t.idx))victims.push({idx:t.idx,causa:'veneno'});}
  }
  // Vidente / Zorra (informan al narrador; no cambian el estado salvo la Zorra)
  if(act.vidente&&valid(game,a.vidente))rep.info.vidente=videnteVe(game,a.vidente);
  if(act.zorra&&!game.zorraPerdida&&valid(game,a.zorra)){
    const hay=zorraVe(game,a.zorra);rep.info.zorra=hay;
    if(!hay){game.zorraPerdida=true;rep.info.zorraPierde=true;}
  }
  // Policía (un uso de cada poder; sobre sí mismo está permitido)
  if(act.policia){
    const ar=valid(game,a.policiaArresta),im=valid(game,a.policiaInmune);
    if(ar){if(game.policiaArrestoUsado)aviso('El Policía ya arrestó a alguien.');else{game.policiaArrestoUsado=true;ar.preso=true;extraM.push(`🚔 ${ar.name} ha sido arrestado: hoy no puede votar ni hablar`);}}
    if(im){if(game.policiaInmuneUsado)aviso('El Policía ya dio inmunidad.');else{game.policiaInmuneUsado=true;im.inmune=true;extraM.push(`🛡️ ${im.name} tiene inmunidad: hoy no puede ser votado`);}}
  }
  // Inquisidor
  let inqMuere=null;
  if(act.inquisidor&&Array.isArray(a.inquisidor)&&a.inquisidor.length){
    const inq=act.inquisidor;
    if(inq.lobo)aviso('El Inquisidor/Lobo no puede usar su poder.');
    else if(game.inquisidorUsado)aviso('El Inquisidor ya usó su poder.');
    else{
      const req=inquisidorObjetivos(game),objs=[...new Set(a.inquisidor)].map(i=>valid(game,i)).filter(Boolean);
      if(objs.length!==req.n)aviso(`Con esta cantidad de lobos el Inquisidor debe señalar a ${req.n} jugador(es).`);
      else{
        game.inquisidorUsado=true;
        const hits=objs.filter(isWolf).length;
        if(hits>=req.aciertos){game.inquisidorWin=inq.idx;rep.info.inquisidor='acierta';extraM.push(`⚖️ El Inquisidor ha acertado: la aldea ha ganado`);}
        else{rep.info.inquisidor='falla';inqMuere=inq.idx;}
      }
    }
  }
  // Careto (una sola vez)
  if(act.careto&&Array.isArray(a.careto)&&a.careto.length===2){
    if(game.caretoUsed)aviso('El Careto ya usó su poder.');
    else{
      const [i,j]=a.careto,x=valid(game,i),y=valid(game,j);
      if(!x||!y||x===y)aviso('El Careto necesita dos jugadores vivos distintos.');
      else{caretoSwap(game,i,j);rep.info.careto=[i,j];}
    }
  }

  // Aplicar muertes en orden: manada/rojo/judas/veneno, infectado, inquisidor
  const orden=[...victims];
  if(infectado&&infectado.vivo)orden.push({idx:infectado.idx,causa:'infeccion'});
  if(inqMuere!==null)orden.push({idx:inqMuere,causa:'inquisidor'});
  const antes=new Set(game.assigned.filter(p=>!p.vivo).map(p=>p.idx));
  const avisosKill=[];
  orden.forEach(m=>{avisosKill.push(...kill(game,m.idx,m.causa,true));});
  game.assigned.filter(p=>!p.vivo&&!antes.has(p.idx)).forEach(p=>rep.muertes.push({idx:p.idx,causa:p.deathCause}));
  // Anuncio de la mañana: nunca se explica cómo ni por qué. Un maldito por el Alfa no se menciona: la aldea oye «nadie ha muerto».
  rep.muertes.forEach(m=>{
    const p=game.assigned[m.idx];
    rep.manana.push(m.causa==='pena'?`💘 ${p.name} ha muerto porque formaba parte de la pareja`:`💀 ${p.name} ha muerto`);
  });
  if(!rep.muertes.length)rep.manana.push('Nadie ha muerto esta noche');
  rep.manana.push(...extraM);
  const jab=jabaliHuele(game);
  if(jab!==null)rep.manana.push(jab?'🐗 ¡El Jabalí huele el peligro!':'🐗 El Jabalí no huele el peligro');
  rep.cascadas=avisosKill;
  game.lastNight=rep;
  return rep;
}

/* ===== Día: votación, linchamiento y Heredera ===== */
const puedeSerVotado=(game,idx)=>{const p=game.assigned[idx];return !!p&&p.vivo&&!p.isNar&&!p.inmune;};
function votantes(game){return alivePlayers(game).filter(p=>!p.preso);}
// El Niño Salvaje no puede votar a su Modelo mientras sea Aldeano.
function puedeVotarA(game,voterIdx,targetIdx){
  const v=game.assigned[voterIdx],t=game.assigned[targetIdx];
  if(!v||!t||!v.vivo||v.preso||!puedeSerVotado(game,targetIdx))return false;
  if(v.roles.includes('ninoSalvaje')&&!v.lobo&&t.modelo)return false;
  return true;
}
// counts: {idxObjetivo: nº de votos}; votoAlguacil: idx al que vota el portador de la Insignia (su voto vale por dos: cuenta +1 extra).
function tally(game,counts,votoAlguacil){
  const tot={};
  Object.keys(counts||{}).forEach(k=>{if(puedeSerVotado(game,+k)&&counts[k]>0)tot[k]=(tot[k]||0)+counts[k];});
  if(votoAlguacil!==null&&votoAlguacil!==undefined&&puedeSerVotado(game,votoAlguacil))tot[votoAlguacil]=(tot[votoAlguacil]||0)+1;
  const max=Math.max(0,...Object.values(tot));
  const top=max>0?Object.keys(tot).filter(k=>tot[k]===max).map(Number):[];
  const alg=alivePlayers(game).find(p=>p.insignia)||null;
  return{totals:tot,max,top,empate:top.length>1,ganador:top.length===1?top[0]:null,desempata:top.length>1&&alg?alg.idx:null};
}
// La Heredera (viva, sin ser Enamorada ni Lobo) puede quedarse con la carta del linchado justo antes de revelarla.
function herederaElegible(game,deadIdx){
  const h=actor(game,'heredera'),d=game.assigned[deadIdx];
  return h&&d&&!d.isNar&&h.idx!==d.idx&&!h.amor&&!isWolf(h)?h:null;
}
function heredar(game,deadIdx){
  const h=herederaElegible(game,deadIdx);if(!h)return[];
  const d=game.assigned[deadIdx];
  h.roles=d.roles.slice();
  if(d.lobo)h.lobo=true;
  return[`👑 ${h.name} hereda la carta de ${d.name}`];
}
function lynch(game,idx){
  const p=game.assigned[idx];if(!p||!p.vivo||p.isNar)return[];
  game.lastLynched=idx;
  return kill(game,idx,'voto',false);
}
function setModelo(game,ninoIdx,modeloIdx){
  game.assigned.forEach(p=>{p.modelo=false;});
  const m=game.assigned[modeloIdx];if(m&&!m.isNar&&m.idx!==ninoIdx)m.modelo=true;
}
function setEnamorados(game,i,j){
  game.assigned.forEach(p=>{p.amor=false;});
  if(i===j)return false;
  const a=game.assigned[i],b=game.assigned[j];
  if(!a||!b||a.isNar||b.isNar)return false;
  a.amor=b.amor=true;return true;
}

/* ===== victoria ===== */
function extras(game){
  const alive=alivePlayers(game),res=[];
  const nino=alive.find(p=>p.roles.includes('ninoSalvaje'));
  if(nino)res.push(`🧒 ${nino.name} (Niño Salvaje) también gana: llegó vivo al final`);
  return res;
}
function conExtras(game,w){const ex=extras(game);if(ex.length)w.d+='\n\n'+ex.join('\n');return w;}
function checkWin(game){
  if(game.pending.length)return null; // aún hay decisiones por resolver (Cazador, Insignia)
  if(game.borrachoWin!==null&&game.borrachoWin!==undefined)
    return{em:'🍷',t:'El Borracho gana',d:'¡Lo ha conseguido! Ha convencido al pueblo de que era un lobo y le lincharon en la primera ronda.'};
  if(game.inquisidorWin!==null&&game.inquisidorWin!==undefined){
    const inq=game.assigned[game.inquisidorWin];
    return conExtras(game,{em:'⚖️',t:'La aldea y el Inquisidor ganan',d:`${inq?inq.name:'El Inquisidor'} señaló a los lobos con acierto: la aldea despierta sabiendo que ha ganado.`});
  }
  const alive=alivePlayers(game);
  if(!alive.length)return{em:'☠️',t:'Nadie sobrevive',d:'No queda nadie con vida en Talasnal.'};
  const wolves=alive.filter(isWolf),villagers=alive.filter(p=>!isWolf(p)),lovers=alive.filter(p=>p.amor);
  if(alive.length===2&&lovers.length===2)
    return{em:'💘',t:'Los Enamorados ganan',d:'Los dos enamorados han sobrevivido a todos. El amor vence siempre.'};
  if(wolves.length===0)
    return conExtras(game,{em:'🏘️',t:'Los Aldeanos ganan',d:'¡El pueblo ha triunfado! Los lobos han sido eliminados. Talasnal puede dormir tranquilo.'});
  if(villagers.length===0){
    if(alive.length===1&&alive[0].roles.includes('loboJudas'))
      return{em:'🗡️',t:'El Lobo Judas gana',d:'El traidor ha eliminado a todos y es el único superviviente. Nadie confiaba en él... y tenían razón.'};
    return conExtras(game,{em:'🐺',t:'Los Lobos ganan',d:'La manada ha devorado a todos los aldeanos. Talasnal ha caído en la oscuridad.'});
  }
  return null;
}
// Aviso para el narrador: con tantos lobos como aldeanos, un empate en la votación acaba dando la victoria a los lobos.
function ventajaLobos(game){const a=alivePlayers(game);return a.filter(isWolf).length>=a.filter(p=>!isWolf(p)).length;}

const API={WOLF_ROLES,NINA_RIESGO,ninaPuede,ninaEspia,revealList,shuffle,recWolvesFor,mkPlayer,isWolf,alivePlayers,selOpt,selWolf,selVillage,narratorPlan,totalCards,capacity,maxWolves,
  createGame,kill,revive,resolvePending,setInsignia,startNight,nextCycle,neighbors,holders,actor,alfaDisponible,rojoDisponible,inquisidorObjetivos,jabaliHuele,videnteVe,zorraVe,previewVictims,resolveNight,
  puedeSerVotado,votantes,puedeVotarA,tally,herederaElegible,heredar,lynch,setModelo,setEnamorados,ventajaLobos,
  ladronPlayer,ladronMustChoose,ladronChooseExterno,ladronChooseIntercambio,caretoSwap,checkWin};
if(typeof module!=='undefined')module.exports=API;
return API;
})();
