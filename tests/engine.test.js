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
    caretoUsed:false,night:1,day:0,firstNightDone:false,winner:null,pending:[],borrachoWin:null};
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
  assert.deepEqual(g.pending,[{tipo:'cazador',idx:1}]);
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
