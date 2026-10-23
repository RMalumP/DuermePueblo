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
    caretoUsed:false,night:1,day:0,firstNightDone:false,winner:null,pending:[],borrachoWin:null,fixedNarIdx:fixed,
    narratorNote:forcedNarrator?`Con el Ladrón hace falta un narrador: ${assigned[fixed].name}.`:null};
  if(ladronExt&&!ladronPlayer(game)){game.ladronChosen=true;game.ladronLeftover=true;} // el Ladrón es una de las cartas sobrantes
  return game;
}

/* ===== muertes y cascadas ===== */
// cause: 'noche' | 'voto' | 'veneno' | 'cazador' | 'pena'
function kill(game,idx,cause){
  const ev=[],p=game.assigned[idx];
  if(!p||!p.vivo||p.isNar)return ev;
  p.vivo=false;p.deathCause=cause||'noche';
  // Borracho: solo gana si le linchan en la primera votación (la del primer día).
  if(p.deathCause==='voto'&&game.night===1&&p.roles.includes('borracho')&&!p.amor)game.borrachoWin=p.idx;
  // Enamorado: la pareja muere de pena (pasa por kill: puede ser Cazador, Modelo, portador de la Insignia…).
  if(p.amor){
    const partner=game.assigned.find(o=>o.amor&&o.idx!==p.idx&&o.vivo);
    if(partner){ev.push(`💘 ${partner.name} muere de pena por ${p.name}`);ev.push(...kill(game,partner.idx,'pena'));}
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
  if(p.roles.includes('cazador'))game.pending.push({tipo:'cazador',idx:p.idx});
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
    return[`🏹 ${hunter.name} se lleva a ${target.name}`,...kill(game,targetIdx,'cazador')];
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

/* ===== victoria ===== */
function checkWin(game){
  if(game.pending.length)return null; // aún hay decisiones por resolver (Cazador, Insignia)
  if(game.borrachoWin!==null&&game.borrachoWin!==undefined)
    return{em:'🍷',t:'El Borracho gana',d:'¡Lo ha conseguido! Ha convencido al pueblo de que era un lobo y le lincharon en la primera ronda.'};
  const alive=alivePlayers(game);
  if(!alive.length)return{em:'☠️',t:'Nadie sobrevive',d:'No queda nadie con vida en Talasnal.'};
  const wolves=alive.filter(isWolf),villagers=alive.filter(p=>!isWolf(p)),lovers=alive.filter(p=>p.amor);
  if(alive.length===2&&lovers.length===2)
    return{em:'💘',t:'Los Enamorados ganan',d:'Los dos enamorados han sobrevivido a todos. El amor vence siempre.'};
  if(wolves.length===0)
    return{em:'🏘️',t:'Los Aldeanos ganan',d:'¡El pueblo ha triunfado! Los lobos han sido eliminados. Talasnal puede dormir tranquilo.'};
  if(villagers.length===0){
    if(alive.length===1&&alive[0].roles.includes('loboJudas'))
      return{em:'🗡️',t:'El Lobo Judas gana',d:'El traidor ha eliminado a todos y es el único superviviente. Nadie confiaba en él... y tenían razón.'};
    return{em:'🐺',t:'Los Lobos ganan',d:'La manada ha devorado a todos los aldeanos. Talasnal ha caído en la oscuridad.'};
  }
  return null;
}

const API={WOLF_ROLES,revealList,shuffle,recWolvesFor,mkPlayer,isWolf,alivePlayers,selOpt,selWolf,selVillage,narratorPlan,totalCards,capacity,maxWolves,
  createGame,kill,revive,resolvePending,setInsignia,startNight,nextCycle,
  ladronPlayer,ladronMustChoose,ladronChooseExterno,ladronChooseIntercambio,caretoSwap,checkWin};
if(typeof module!=='undefined')module.exports=API;
return API;
})();
