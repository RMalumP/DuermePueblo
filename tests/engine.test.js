// Ejecutar con: node --test tests/
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../js/engine.js');

function cfgBase(over){
  const optional={};
  return Object.assign({players:8,wolves:2,narrator:'none',narratorEnabled:true,names:[],optional,insigniaMode:'random',ladronMode:'externo'},over||{});
}
function rngSeq(seed){let s=seed;return()=>{s=(s*1664525+1013904223)%4294967296;return s/4294967296;};}
// Partida a medida: roles[i] es la carta del jugador i.
function mk(roles){
  const game={assigned:roles.map((r,i)=>E.mkPlayer(i,'J'+(i+1),Array.isArray(r)?r:[r],false)),deck:[],ladronCards:[],ladronChosen:false,ladronStolenCard:null,
    caretoUsed:false,night:1,day:0,firstNightDone:false,winner:null,pending:[],borrachoWin:null,infected:null,lastLynched:null};
  return game;
}

test('el narrador aleatorio no cuenta como jugador',()=>{
  for(let s=1;s<=30;s++){
    const g=E.createGame(cfgBase({narrator:'random'}),rngSeq(s));
    const nar=g.assigned.filter(p=>p.roles.includes('narrador'));
    assert.equal(nar.length,1);
    assert.ok(nar[0].isNar,'la carta Narrador debe marcar isNar');
    assert.equal(E.alivePlayers(g).length,7);
    assert.equal(E.checkWin(g),null);
  }
});
test('narrador aleatorio + Ladrón: se asigna un narrador fijo y las sobrantes nunca son el narrador',()=>{
  for(let s=1;s<=60;s++){
    const g=E.createGame(cfgBase({narrator:'random',optional:{ladron:true},ladronMode:'externo'}),rngSeq(s));
    assert.equal(g.assigned.filter(p=>p.isNar).length,1);
    assert.ok(g.narratorNote);
    assert.ok(!g.ladronCards.includes('narrador'));
    assert.equal(g.ladronCards.length,2);
  }
});
test('reparto: el narrador por carta ve su carta; el narrador fijo no',()=>{
  let g=E.createGame(cfgBase({narrator:'random'}),rngSeq(3));
  assert.equal(E.revealList(g).length,8);
  g=E.createGame(cfgBase({narrator:'2'}),rngSeq(3));
  assert.equal(E.revealList(g).length,7);
  assert.ok(!E.revealList(g).some(p=>p.idx===2));
  g=E.createGame(cfgBase({narrator:'random',optional:{ladron:true}}),rngSeq(3));
  assert.equal(E.revealList(g).length,7);
});
test('reparto: total de cartas y lobos correctos',()=>{
  const g=E.createGame(cfgBase({players:10,wolves:3,optional:{vidente:true,bruja:true,loboAlfa:true}}),rngSeq(7));
  assert.equal(g.assigned.length,10);
  assert.equal(g.assigned.filter(p=>E.isWolf(p)).length,3);
  assert.ok(g.assigned.some(p=>p.roles[0]==='vidente'));
});
test('Ladrón entre las cartas sobrantes: no hay jugador Ladrón y no se pide elegir',()=>{
  let visto=false;
  for(let s=1;s<=400&&!visto;s++){
    const g=E.createGame(cfgBase({optional:{ladron:true}}),rngSeq(s));
    if(g.ladronCards.includes('ladron')){visto=true;assert.equal(E.ladronPlayer(g),null);assert.ok(g.ladronChosen&&g.ladronLeftover);}
  }
  assert.ok(visto,'con 400 semillas debería darse el caso');
});
test('Ladrón externo: obligado si ambas son Lobo',()=>{
  const g=mk(['ladron','aldeano','aldeano']);g.ladronCards=['lobo','loboAlfa'];
  assert.ok(E.ladronMustChoose(g));
  E.ladronChooseExterno(g,null);
  assert.deepEqual(g.assigned[0].roles,['ladron','lobo']);
  assert.ok(E.isWolf(g.assigned[0]));
});
test('Ladrón externo: puede conservar su carta',()=>{
  const g=mk(['ladron','aldeano']);g.ladronCards=['vidente','aldeano'];
  E.ladronChooseExterno(g,null);
  assert.deepEqual(g.assigned[0].roles,['ladron']);assert.ok(g.ladronChosen);
});
test('Ladrón intercambio: el Ladrón recibe la carta robada (cuenta como Lobo) y el robado pasa a Aldeano',()=>{
  const g=mk(['ladron','loboRojo','aldeano','aldeano']);
  E.ladronChooseIntercambio(g,1);
  assert.deepEqual(g.assigned[0].roles,['ladron','loboRojo']);
  assert.ok(E.isWolf(g.assigned[0]));
  assert.deepEqual(g.assigned[1].roles,['aldeano']);
  assert.ok(g.assigned[1].robado&&!E.isWolf(g.assigned[1]));
});

test('Borracho: gana si le linchan en la primera votación',()=>{
  const g=mk(['borracho','lobo','aldeano','aldeano']);
  E.kill(g,0,'voto');
  assert.equal(E.checkWin(g).t,'El Borracho gana');
});
test('Borracho: NO gana si lo matan los lobos la noche 1',()=>{
  const g=mk(['borracho','lobo','aldeano','aldeano','aldeano']);
  E.kill(g,0,'noche');
  assert.equal(E.checkWin(g),null);
});
test('Borracho: NO gana si le linchan después de la primera noche',()=>{
  const g=mk(['borracho','lobo','aldeano','aldeano','aldeano']);
  E.nextCycle(g);
  E.kill(g,0,'voto');
  assert.equal(E.checkWin(g),null);
});
test('Borracho: revivirlo anula su victoria',()=>{
  const g=mk(['borracho','lobo','aldeano','aldeano']);
  E.kill(g,0,'voto');E.revive(g,0);
  assert.equal(E.checkWin(g),null);
});

test('Enamorados: la pareja muere de pena y encadena al Cazador',()=>{
  const g=mk(['aldeano','cazador','lobo','aldeano','aldeano']);
  g.assigned[0].amor=g.assigned[1].amor=true;
  const ev=E.kill(g,0,'noche');
  assert.ok(!g.assigned[1].vivo);
  assert.equal(g.assigned[1].deathCause,'pena');
  assert.deepEqual(g.pending,[{tipo:'cazador',idx:1,night:true}]);
  assert.ok(ev.some(x=>x.includes('muere de pena')));
});
test('Enamorados: la pena convierte al Niño Salvaje si la pareja era su Modelo',()=>{
  const g=mk(['aldeano','aldeano','ninoSalvaje','lobo','aldeano']);
  g.assigned[0].amor=g.assigned[1].amor=true;g.assigned[1].modelo=true;
  E.kill(g,0,'noche');
  assert.ok(g.assigned[2].lobo);
});
test('Enamorados: no hay ganador mientras el Cazador no haya disparado',()=>{
  const g=mk(['aldeano','cazador','lobo','aldeano']);
  g.assigned[0].amor=g.assigned[1].amor=true;
  E.kill(g,0,'noche');
  assert.equal(E.checkWin(g),null);
  E.resolvePending(g,'cazador',2); // dispara al único lobo
  assert.equal(E.checkWin(g).t,'Los Aldeanos ganan');
});
test('Cazador: dispara a otro jugador y puede encadenar otra muerte',()=>{
  const g=mk(['cazador','aldeano','lobo','aldeano','aldeano']);
  g.assigned[1].amor=g.assigned[3].amor=true;
  E.kill(g,0,'voto');
  assert.equal(g.pending[0].tipo,'cazador');
  E.resolvePending(g,'cazador',1);
  assert.ok(!g.assigned[1].vivo&&!g.assigned[3].vivo);
  assert.equal(g.pending.length,0);
});
test('Cazador: puede no disparar',()=>{
  const g=mk(['cazador','aldeano','lobo']);
  E.kill(g,0,'noche');E.resolvePending(g,'cazador',null);
  assert.equal(g.pending.length,0);assert.ok(g.assigned[1].vivo);
});

test('Niño Salvaje: se convierte en Lobo cuando muere su Modelo y cuenta como Lobo',()=>{
  const g=mk(['ninoSalvaje','aldeano','lobo','aldeano','aldeano']);
  g.assigned[1].modelo=true;
  assert.ok(!E.isWolf(g.assigned[0]));
  E.kill(g,1,'voto');
  assert.ok(g.assigned[0].lobo&&E.isWolf(g.assigned[0]));
});

test('Insignia: al morir el portador se pide sucesor',()=>{
  const g=mk(['aldeano','aldeano','lobo']);
  g.assigned[0].insignia=true;
  E.kill(g,0,'noche');
  assert.ok(!g.assigned[0].insignia);
  assert.deepEqual(g.pending,[{tipo:'insignia',idx:0}]);
  E.resolvePending(g,'insignia',1);
  assert.ok(g.assigned[1].insignia);assert.equal(g.pending.length,0);
});

test('Policía: inmune y preso se limpian al empezar la noche siguiente',()=>{
  const g=mk(['aldeano','aldeano','lobo']);
  g.assigned[0].inmune=true;g.assigned[1].preso=true;
  E.nextCycle(g);
  assert.ok(!g.assigned[0].inmune&&!g.assigned[1].preso);
  assert.equal(g.night,2);assert.equal(g.day,1);assert.ok(g.firstNightDone);
});

test('victoria: aldea, lobos, Judas, Enamorados mixtos y nadie',()=>{
  let g=mk(['aldeano','aldeano','lobo']);E.kill(g,2,'voto');
  assert.equal(E.checkWin(g).t,'Los Aldeanos ganan');
  g=mk(['aldeano','lobo','loboAlfa']);E.kill(g,0,'noche');
  assert.equal(E.checkWin(g).t,'Los Lobos ganan');
  g=mk(['aldeano','loboJudas']);E.kill(g,0,'noche');
  assert.equal(E.checkWin(g).t,'El Lobo Judas gana');
  g=mk(['aldeano','lobo','aldeano','lobo']);g.assigned[0].amor=g.assigned[1].amor=true;
  E.kill(g,2,'voto');E.kill(g,3,'voto');
  assert.equal(E.checkWin(g).t,'Los Enamorados ganan');
  g=mk(['aldeano','lobo']);g.assigned[0].amor=g.assigned[1].amor=true;E.kill(g,0,'noche');
  assert.equal(E.checkWin(g).t,'Nadie sobrevive');
});
test('victoria: el Lobo Judas no gana si queda otro Lobo',()=>{
  const g=mk(['aldeano','loboJudas','lobo']);E.kill(g,0,'noche');
  assert.equal(E.checkWin(g).t,'Los Lobos ganan');
});

test('Careto: intercambia cartas y el bando sigue a la carta',()=>{
  const g=mk(['careto','lobo','aldeano']);
  E.caretoSwap(g,0,1);
  assert.deepEqual(g.assigned[0].roles,['lobo']);assert.deepEqual(g.assigned[1].roles,['careto']);
  assert.ok(E.isWolf(g.assigned[0])&&!E.isWolf(g.assigned[1]));
  assert.ok(g.caretoUsed);
});

test('capacidad: lobos especiales y cartas de aldea que no caben',()=>{
  assert.equal(E.capacity(cfgBase({wolves:1,optional:{loboAlfa:true,loboJudas:true}})).ok,false);
  assert.equal(E.capacity(cfgBase({players:5,wolves:2,optional:{vidente:true,bruja:true,cazador:true,cupido:true}})).ok,false);
  assert.equal(E.capacity(cfgBase()).ok,true);
});
test('el máximo de lobos cuenta las cartas reales',()=>{
  assert.equal(E.maxWolves(cfgBase({players:8,narrator:'3'})),6);
  assert.equal(E.maxWolves(cfgBase({players:8,narrator:'none'})),7);
});

/* ===== Fase 1: noche ===== */
const R=(g,a)=>E.resolveNight(g,a);
const vivos=g=>g.assigned.filter(p=>p.vivo).map(p=>p.idx);

test('noche: la manada mata y el anuncio no explica la causa',()=>{
  const g=mk(['lobo','aldeano','aldeano','aldeano']);
  const r=R(g,{manada:1});
  assert.deepEqual(r.muertes,[{idx:1,causa:'noche'}]);
  assert.deepEqual(r.manana,['💀 J2 ha muerto']);
});
test('noche: sin víctima no muere nadie',()=>{
  const g=mk(['lobo','aldeano','aldeano']);
  assert.deepEqual(R(g,{manada:null}).manana,['Nadie ha muerto esta noche']);
});
test('noche: los lobos no pueden devorar a otro lobo',()=>{
  const g=mk(['lobo','lobo','aldeano']);
  const r=R(g,{manada:1});
  assert.equal(r.muertes.length,0);assert.ok(r.avisos.length);
});
test('Bruja: cura a la víctima (una sola vez) y envenena (una sola vez)',()=>{
  const g=mk(['lobo','aldeano','bruja','aldeano','aldeano']);
  let r=R(g,{manada:1,brujaCura:1});
  assert.equal(r.muertes.length,0);assert.ok(g.assigned[1].vivo);
  r=R(g,{manada:3,brujaCura:3});
  assert.ok(r.avisos.some(x=>x.includes('ya usó la poción de vida')));assert.ok(!g.assigned[3].vivo);
  r=R(g,{brujaVeneno:0});
  assert.ok(!g.assigned[0].vivo);assert.equal(r.muertes[0].causa,'veneno');
  r=R(g,{brujaVeneno:4});
  assert.ok(g.assigned[4].vivo);assert.ok(r.avisos.some(x=>x.includes('poción de muerte')));
});
test('Bruja: puede curarse a sí misma y usar las dos pociones la misma noche',()=>{
  const g=mk(['lobo','bruja','aldeano','aldeano','aldeano']);
  const r=R(g,{manada:1,brujaCura:1,brujaVeneno:2});
  assert.ok(g.assigned[1].vivo);assert.ok(!g.assigned[2].vivo);assert.equal(r.muertes.length,1);
});
test('Bruja/Lobo devorada por el Lobo Judas no puede curarse',()=>{
  const g=mk(['loboJudas','bruja','aldeano','aldeano']);g.assigned[1].lobo=true;
  const r=R(g,{judas:1,brujaCura:1});
  assert.ok(!g.assigned[1].vivo);assert.ok(r.avisos.some(x=>x.includes('Bruja/Lobo')));
});
test('Lobo Alfa: maldice una sola vez, el maldito es Lobo y la aldea oye «nadie ha muerto»',()=>{
  const g=mk(['loboAlfa','vidente','aldeano','aldeano','aldeano']);
  let r=R(g,{manada:1,alfaCurse:true});
  assert.ok(g.assigned[1].vivo&&g.assigned[1].lobo&&E.isWolf(g.assigned[1]));
  assert.equal(r.info.maldito,1);assert.deepEqual(r.manana,['Nadie ha muerto esta noche']);
  r=R(g,{manada:2,alfaCurse:true});
  assert.ok(!g.assigned[2].vivo);assert.ok(r.avisos.some(x=>x.includes('Alfa')));
});
test('Vidente: el maldito ya cuenta como Lobo, sin decir de qué tipo',()=>{
  const g=mk(['loboAlfa','vidente','aldeano','aldeano']);
  assert.equal(R(g,{vidente:2}).info.vidente,'aldeano');
  g.assigned[2].lobo=true;
  assert.equal(R(g,{vidente:2}).info.vidente,'lobo');
});
test('Niña: si la ven, muere en lugar de la víctima',()=>{
  const g=mk(['lobo','nina','aldeano','aldeano']);
  const r=R(g,{manada:2,ninaVista:true});
  assert.ok(!g.assigned[1].vivo);assert.ok(g.assigned[2].vivo);assert.equal(r.muertes.length,1);
});
test('Lobo Rojo: solo mientras no haya muerto ningún lobo',()=>{
  const g=mk(['lobo','loboRojo','aldeano','aldeano','aldeano','aldeano']);
  R(g,{manada:2,rojo:3});
  assert.ok(!g.assigned[2].vivo&&!g.assigned[3].vivo);
  E.kill(g,0,'voto');
  const r=R(g,{manada:4,rojo:5});
  assert.ok(!g.assigned[4].vivo&&g.assigned[5].vivo);assert.ok(r.avisos.some(x=>x.includes('Rojo')));
});
test('Lobo Judas: solo elimina a otro lobo',()=>{
  const g=mk(['loboJudas','lobo','aldeano','aldeano']);
  let r=R(g,{judas:2});assert.ok(g.assigned[2].vivo);assert.ok(r.avisos.length);
  r=R(g,{judas:1});assert.ok(!g.assigned[1].vivo);
});
test('Zorra: trío de vecinos; sin lobo pierde el poder',()=>{
  const g=mk(['aldeano','aldeano','zorra','aldeano','lobo','aldeano']);
  let r=R(g,{zorra:1});            // trío J1,J2,J3 sin lobo
  assert.equal(r.info.zorra,false);assert.ok(g.zorraPerdida);
  r=R(g,{zorra:3});assert.equal(r.info.zorra,undefined); // ya no tiene poder
  const h=mk(['aldeano','aldeano','zorra','aldeano','lobo','aldeano']);
  assert.equal(R(h,{zorra:3}).info.zorra,true);  // el centro J4 tiene al lobo J5 de vecino
  assert.ok(!h.zorraPerdida);
});
test('Zorra: los muertos no cuentan como vecinos',()=>{
  const g=mk(['zorra','aldeano','lobo','aldeano']);
  E.kill(g,1,'noche');
  assert.equal(E.zorraVe(g,0),true); // J1: su vecino vivo a la izquierda es el lobo
});
test('Policía: arresta y da inmunidad una sola vez cada uno, y se anuncia',()=>{
  const g=mk(['policia','aldeano','aldeano','lobo']);
  let r=R(g,{policiaArresta:1,policiaInmune:0});
  assert.ok(g.assigned[1].preso&&g.assigned[0].inmune);assert.equal(r.manana.length,3);
  E.startNight(g);
  assert.ok(!g.assigned[1].preso&&!g.assigned[0].inmune);
  r=R(g,{policiaArresta:2,policiaInmune:2});
  assert.ok(!g.assigned[2].preso&&!g.assigned[2].inmune);assert.equal(r.avisos.length,2);
});
test('Inquisidor: acierta (la aldea gana con él) o falla (muere)',()=>{
  let g=mk(['inquisidor','lobo','aldeano','aldeano','aldeano','lobo','aldeano']);g.initialWolves=2;
  let r=R(g,{inquisidor:[1,5]});
  assert.equal(r.info.inquisidor,'acierta');assert.equal(E.checkWin(g).t,'La aldea y el Inquisidor ganan');
  g=mk(['inquisidor','lobo','aldeano','aldeano','aldeano','lobo','aldeano']);g.initialWolves=2;
  r=R(g,{inquisidor:[1,2]});
  assert.equal(r.info.inquisidor,'falla');assert.ok(!g.assigned[0].vivo);
  g=mk(['inquisidor','lobo','aldeano','aldeano']);g.initialWolves=1;
  assert.equal(R(g,{inquisidor:[1]}).info.inquisidor,'acierta');
});
test('Inquisidor: con 4-5 lobos señala a 3 y basta con 2 aciertos; solo una vez; Inquisidor/Lobo no puede',()=>{
  assert.deepEqual(E.inquisidorObjetivos({initialWolves:5,assigned:[]}),{n:3,aciertos:2});
  let g=mk(['inquisidor','lobo','lobo','aldeano','aldeano','aldeano','aldeano','lobo','lobo']);g.initialWolves=4;
  assert.equal(R(g,{inquisidor:[1,2,3]}).info.inquisidor,'acierta');
  g=mk(['inquisidor','lobo','aldeano','aldeano']);g.initialWolves=1;g.assigned[0].lobo=true;
  assert.ok(R(g,{inquisidor:[1]}).avisos.some(x=>x.includes('Inquisidor/Lobo')));
});
test('Careto: intercambia en la noche, una sola vez',()=>{
  const g=mk(['careto','lobo','aldeano','aldeano']);
  let r=R(g,{careto:[0,1]});
  assert.deepEqual(r.info.careto,[0,1]);assert.ok(E.isWolf(g.assigned[0]));
  r=R(g,{careto:[2,3]});assert.ok(r.avisos.some(x=>x.includes('Careto')));
});
test('Rata: muerta de noche infecta al primer lobo a su izquierda, que muere la noche siguiente',()=>{
  const g=mk(['rata','aldeano','lobo','aldeano','lobo','aldeano']);
  R(g,{manada:0});
  assert.equal(g.infected,2);
  const r=R(g,{manada:1});
  assert.ok(!g.assigned[2].vivo&&!g.assigned[1].vivo);
  assert.ok(r.muertes.some(m=>m.idx===2&&m.causa==='infeccion'));
  assert.equal(g.infected,null);
});
test('Rata: linchada de día no infecta; y si el infectado es linchado no se transmite',()=>{
  let g=mk(['rata','aldeano','lobo','aldeano','lobo']);
  E.lynch(g,0);assert.equal(g.infected,null);
  g=mk(['rata','aldeano','lobo','aldeano','lobo']);
  R(g,{manada:0});assert.equal(g.infected,2);
  E.lynch(g,2);assert.equal(g.infected,null);
  const r=R(g,{manada:1});
  assert.ok(g.assigned[4].vivo,'la infección no pasa al siguiente lobo');
});
test('Rata + Niño Salvaje (Modelo): infecta antes de convertir al Niño',()=>{
  const g=mk(['ninoSalvaje','rata','lobo','aldeano','lobo']);
  g.assigned[1].modelo=true;
  R(g,{manada:1});
  assert.equal(g.infected,2,'el Niño (índice 0) no cuenta aún como lobo');
  assert.ok(g.assigned[0].lobo);
});
test('Rata envenenada por la Bruja (muerte nocturna) también infecta',()=>{
  const g=mk(['bruja','rata','lobo','aldeano','aldeano']);
  R(g,{brujaVeneno:1});
  assert.equal(g.infected,2);
});
test('Rata/Enamorada muerta de pena de noche infecta',()=>{
  const g=mk(['aldeano','rata','lobo','aldeano','lobo']);
  g.assigned[0].amor=g.assigned[1].amor=true;
  R(g,{manada:0});
  assert.equal(g.infected,2);
});
test('Cazador muerto de noche: dispara y la muerte nocturna del Rata infecta',()=>{
  const g=mk(['cazador','rata','lobo','aldeano','aldeano']);
  R(g,{manada:0});
  assert.deepEqual(g.pending,[{tipo:'cazador',idx:0,night:true}]);
  E.resolvePending(g,'cazador',1);
  assert.equal(g.infected,2);
});
test('Jabalí: huele a un lobo vecino vivo (no se huele a sí mismo)',()=>{
  const g=mk(['jabali','aldeano','lobo','aldeano']);
  assert.equal(E.jabaliHuele(g),false);
  E.kill(g,1,'noche');
  assert.equal(E.jabaliHuele(g),true);
  const h=mk(['jabali','aldeano','aldeano']);h.assigned[0].lobo=true;
  assert.equal(E.jabaliHuele(h),false);
});
test('noche: el anuncio incluye al Jabalí',()=>{
  const g=mk(['jabali','aldeano','lobo','aldeano']);
  const r=R(g,{manada:1});
  assert.ok(r.manana.includes('🐗 ¡El Jabalí huele el peligro!'));
});

/* ===== Fase 1: día ===== */
test('votación: la Insignia vale por dos y desempata',()=>{
  const g=mk(['aldeano','aldeano','aldeano','lobo','aldeano']);
  g.assigned[0].insignia=true;
  let t=E.tally(g,{1:2,2:2});
  assert.ok(t.empate&&t.desempata===0);
  t=E.tally(g,{1:2,2:1},2);   // el voto doble del Alguacil a J3 → 2 y 2
  assert.deepEqual(t.top,[1,2]);
  t=E.tally(g,{1:1,2:1},1);
  assert.equal(t.ganador,1);
});
test('votación: el inmune no puede ser votado; el preso no vota; el Niño no vota a su Modelo',()=>{
  const g=mk(['aldeano','aldeano','ninoSalvaje','lobo']);
  g.assigned[1].inmune=true;g.assigned[0].preso=true;g.assigned[3].modelo=true;
  assert.equal(E.tally(g,{1:5,3:1}).ganador,3);
  assert.ok(!E.votantes(g).some(p=>p.idx===0));
  assert.equal(E.puedeVotarA(g,2,3),false);
  assert.equal(E.puedeVotarA(g,2,0),true);
});
test('Heredera: toma la carta del linchado salvo Enamorada o Lobo',()=>{
  const g=mk(['heredera','vidente','lobo','aldeano']);
  assert.ok(E.herederaElegible(g,1));
  E.heredar(g,1);E.lynch(g,1);
  assert.deepEqual(g.assigned[0].roles,['vidente']);assert.ok(!g.assigned[1].vivo);
  const h=mk(['heredera','vidente','lobo']);h.assigned[0].amor=true;
  assert.equal(E.herederaElegible(h,1),null);
  const w=mk(['heredera','vidente','lobo']);w.assigned[0].lobo=true;
  assert.equal(E.herederaElegible(w,1),null);
});
test('Heredera hereda el bando del linchado (Lobo)',()=>{
  const g=mk(['heredera','aldeano','lobo','aldeano']);
  E.heredar(g,2);E.lynch(g,2);
  assert.ok(E.isWolf(g.assigned[0]));
});
test('Niño Salvaje gana también si llega vivo al final',()=>{
  const g=mk(['ninoSalvaje','aldeano','lobo']);
  g.assigned[1].modelo=true;
  E.kill(g,2,'voto');
  const w=E.checkWin(g);
  assert.equal(w.t,'Los Aldeanos ganan');assert.ok(w.d.includes('Niño Salvaje'));
});
test('cupido y modelo: se fijan sin duplicar',()=>{
  const g=mk(['cupido','aldeano','ninoSalvaje','aldeano']);
  assert.ok(E.setEnamorados(g,1,3));assert.ok(!E.setEnamorados(g,1,1));
  assert.equal(g.assigned.filter(p=>p.amor).length,0);
  E.setEnamorados(g,1,3);E.setModelo(g,2,1);E.setModelo(g,2,3);
  assert.equal(g.assigned.filter(p=>p.modelo).length,1);assert.ok(g.assigned[3].modelo);
});
test('ventaja de lobos con tantos lobos como aldeanos',()=>{
  assert.equal(E.ventajaLobos(mk(['lobo','aldeano','aldeano'])),false);
  assert.equal(E.ventajaLobos(mk(['lobo','aldeano'])),true);
});

/* ===== Niña a distancia ===== */
test('Niña a distancia: ve a un lobo al azar, una vez por noche',()=>{
  const g=mk(['nina','lobo','loboAlfa','aldeano','aldeano']);
  const r=E.ninaEspia(g,0,rngSeq(5));
  assert.ok(r.ok);assert.ok(['J2','J3'].includes(r.lobo));assert.equal(typeof r.vista,'boolean');
  assert.equal(E.ninaEspia(g,0,rngSeq(5)).ok,false,'no puede repetir la misma noche');
  E.startNight(g);
  assert.ok(E.ninaEspia(g,0,rngSeq(5)).ok,'la noche siguiente sí');
});
test('Niña a distancia: el riesgo es de 1 entre 3',()=>{
  let vistas=0;const N=3000;
  for(let i=0;i<N;i++){const g=mk(['nina','lobo','aldeano']);if(E.ninaEspia(g,0,rngSeq(i+11)).vista)vistas++;}
  assert.ok(vistas>N*0.28&&vistas<N*0.38,'vistas='+vistas);
});
test('Niña a distancia: no puede si está muerta, es Lobo o no hay lobos',()=>{
  let g=mk(['nina','lobo','aldeano']);E.kill(g,0,'noche');assert.equal(E.ninaEspia(g,0).ok,false);
  g=mk(['nina','lobo','aldeano']);g.assigned[0].lobo=true;assert.equal(E.ninaEspia(g,0).ok,false);
  g=mk(['nina','aldeano','aldeano']);assert.equal(E.ninaEspia(g,0).ok,false);
  g=mk(['aldeano','lobo','aldeano']);assert.equal(E.ninaEspia(g,0).ok,false);
});
test('Niña a distancia: si la descubren (ninaVista) muere en lugar de la víctima',()=>{
  const g=mk(['nina','lobo','aldeano','aldeano']);
  const r=R(g,{manada:2,ninaVista:true});
  assert.ok(!g.assigned[0].vivo&&g.assigned[2].vivo&&r.muertes.length===1);
});

/* ===== Puntuación (tabla y ejemplos del libro, §9) ===== */
const fila=(rows,i)=>rows.find(r=>r.idx===i);
test('puntuación ej.1: Lobo Alfa que sobrevive y victoria de lobos = 12',()=>{
  const g=mk(['loboAlfa','aldeano']);E.kill(g,1,'noche');
  assert.equal(fila(E.puntuar(g,E.checkWin(g)),0).total,12);
});
test('puntuación ej.2: Lobo Judas gana solo habiendo matado 2 lobos = 32',()=>{
  const g=mk(['loboJudas','lobo','lobo','aldeano']);
  R(g,{judas:1});R(g,{judas:2});E.kill(g,3,'noche');
  const w=E.checkWin(g);assert.equal(w.k,'judas');
  const f=fila(E.puntuar(g,w),0);assert.equal(f.superv,30);assert.equal(f.poder,2);assert.equal(f.equipo,0);assert.equal(f.total,32);
});
test('puntuación ej.3: Aldeano que sobrevive con victoria de la aldea = 3',()=>{
  const g=mk(['aldeano','aldeano','lobo']);E.kill(g,2,'voto');
  assert.equal(fila(E.puntuar(g,E.checkWin(g)),0).total,3);
});
test('puntuación ej.4: el Borracho que engaña a la aldea = 20, sin equipo ni supervivencia',()=>{
  const g=mk(['borracho','lobo','aldeano','aldeano']);E.kill(g,0,'voto');
  const rows=E.puntuar(g,E.checkWin(g));
  assert.deepEqual([fila(rows,0).equipo,fila(rows,0).superv,fila(rows,0).total],[0,0,20]);
});
test('puntuación ej.5: el Borracho que no engaña pero gana con la aldea = 3',()=>{
  const g=mk(['borracho','aldeano','lobo']);E.nextCycle(g);E.kill(g,2,'voto');
  assert.equal(fila(E.puntuar(g,E.checkWin(g)),0).total,3);
});
test('puntuación ej.6: Bruja muerta que envenenó a un lobo, victoria de la aldea = 10',()=>{
  const g=mk(['bruja','lobo','aldeano','aldeano','aldeano']);
  R(g,{manada:null,brujaVeneno:1});
  E.kill(g,0,'voto');E.kill(g,0,'voto');
  g.assigned[0].vivo=false;
  const w=E.checkWin(g);assert.equal(w.k,'aldea');
  assert.equal(fila(E.puntuar(g,w),0).total,10);
});
test('puntuación ej.7: Cazador que se lleva a un lobo y victoria de lobos = 5',()=>{
  const g=mk(['cazador','lobo','lobo','aldeano']);
  E.kill(g,0,'noche');E.resolvePending(g,'cazador',1);E.kill(g,3,'noche');
  const w=E.checkWin(g);assert.equal(w.k,'lobos');
  const f=fila(E.puntuar(g,w),0);assert.equal(f.total,5);assert.equal(f.equipo,0);
});
test('puntuación ej.8: Cazador que se lleva a un aldeano y victoria de la aldea = 0',()=>{
  const g=mk(['cazador','aldeano','aldeano','lobo']);
  E.kill(g,0,'noche');E.resolvePending(g,'cazador',1);E.kill(g,3,'voto');
  const w=E.checkWin(g);assert.equal(w.k,'aldea');
  assert.equal(fila(E.puntuar(g,w),0).total,0);
});
test('puntuación ej.9: Bruja y Lobeco enamorados ganan juntos: 5 y 10',()=>{
  const g=mk(['bruja','lobo','aldeano','aldeano']);
  g.assigned[0].amor=g.assigned[1].amor=true;
  R(g,{brujaVeneno:2});
  E.kill(g,3,'voto');
  const w=E.checkWin(g);assert.equal(w.k,'enamorados');
  const rows=E.puntuar(g,w);
  assert.equal(fila(rows,0).total,5);assert.equal(fila(rows,1).total,10);
  assert.equal(fila(rows,1).equipo+fila(rows,1).superv,0);
});
test('puntuación: supervivencia por carta (Vidente 3, Jabalí 2, Alfa 10, Rojo 8, Niño lobo 5)',()=>{
  const g=mk(['vidente','jabali','loboAlfa','loboRojo','ninoSalvaje','aldeano']);
  g.assigned[4].lobo=true;
  const rows=E.puntuar(g,{k:'aldea'});
  assert.deepEqual([0,1,2,3,4,5].map(i=>fila(rows,i).superv),[3,2,10,8,5,1]);
});
test('puntuación: un maldito (Vidente/Lobo) puntúa como lobo y juega en el equipo de los lobos',()=>{
  const g=mk(['vidente','lobo','aldeano']);g.assigned[0].lobo=true;
  const f=fila(E.puntuar(g,{k:'lobos'}),0);assert.equal(f.equipo,2);assert.equal(f.superv,5);
});
test('puntuación: Cazador, Inquisidor, Niña y Zorra suman sus puntos de poder',()=>{
  let g=mk(['inquisidor','lobo','aldeano','aldeano']);g.initialWolves=1;
  R(g,{inquisidor:[2]});assert.equal(fila(E.puntuar(g,null),0).poder,-3);
  g=mk(['inquisidor','lobo','aldeano']);g.initialWolves=1;R(g,{inquisidor:[1]});assert.equal(fila(E.puntuar(g,null),0).poder,30);
  g=mk(['nina','lobo','aldeano']);R(g,{manada:2,ninaVista:true});assert.equal(fila(E.puntuar(g,null),0).poder,-1);
  g=mk(['nina','lobo']);g.ninaDenuncio=true;assert.equal(fila(E.puntuar(g,null),0).poder,3);
  g=mk(['zorra','aldeano','lobo','aldeano']);R(g,{zorra:1});R(g,{zorra:3});assert.equal(fila(E.puntuar(g,null),0).poder,2,'1 punto por cada ronda acertada');
});
test('puntuación: Lobo Judas vivo pero no solo no cobra los 30; ajuste manual suma',()=>{
  const g=mk(['loboJudas','lobo','aldeano']);g.ajustes={2:4};
  const rows=E.puntuar(g,{k:'lobos'});
  assert.equal(fila(rows,0).superv,0);assert.equal(fila(rows,2).poder,4);
});
