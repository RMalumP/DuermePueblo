// Ejecutar con: node --test tests/
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../js/engine.js');
const F=require('../js/flow.js');

const cfg0=(o)=>Object.assign({optional:{},ladronMode:'externo',mode:2},o||{});
function mk(roles,deck){
  const g={assigned:roles.map((r,i)=>E.mkPlayer(i,'J'+(i+1),Array.isArray(r)?r:[r],false)),deck:deck||[...new Set(roles.flat())],ladronCards:[],ladronChosen:false,ladronStolenCard:null,
    caretoUsed:false,night:1,day:0,firstNightDone:false,winner:null,pending:[],borrachoWin:null,infected:null,lastLynched:null,acts:{}};
  g.initialWolves=g.assigned.filter(E.isWolf).length;return g;
}
const rng0=()=>0;
const resp=(g,c,seat,vals)=>{const pr=g.prompts[seat];assert.ok(pr,'no hay pregunta para '+seat);return F.responder(g,c,seat,pr.id,vals);};

test('pasos: la noche 1 incluye el turno preliminar y las siguientes no',()=>{
  const c=cfg0({optional:{cupido:true}});
  const g=mk(['lobo','cupido','vidente','aldeano','aldeano']);
  const t1=F.pasos(g,c).map(s=>s.action||s.title);
  assert.ok(t1.includes('amor')&&t1.includes('manada')&&t1.includes('vidente')&&t1.includes('votacion'));
  E.nextCycle(g);
  const t2=F.pasos(g,c).map(s=>s.action);
  assert.ok(!t2.includes('amor')&&t2.includes('medium')===false);
});
test('manada: solo preguntan a los lobos vivos (no al infectado) y no se puede elegir a un lobo',()=>{
  const g=mk(['lobo','lobo','aldeano','aldeano','vidente']);
  const seats=F.abrir(g,cfg0(),'manada');
  assert.deepEqual(seats.sort(),[0,1]);
  const ops=g.prompts[0].preguntas[0].opciones.map(o=>o.v);
  assert.deepEqual(ops,[2,3,4]);
  g.infected=1;assert.deepEqual(F.abrir(g,cfg0(),'manada'),[0]);
});
test('manada: la víctima es la más votada; el empate lo decide el azar o el narrador',()=>{
  const g=mk(['lobo','lobo','lobo','aldeano','aldeano','aldeano']);
  const c=cfg0();F.abrir(g,c,'manada');
  resp(g,c,0,{victima:3});resp(g,c,1,{victima:3});resp(g,c,2,{victima:4});
  assert.equal(g.acts.manada,3);
  F.abrir(g,c,'manada');
  resp(g,c,0,{victima:3});resp(g,c,1,{victima:4});
  assert.deepEqual(g.empateManada,[3,4]);
  F.cerrar(g,()=>0.99);
  assert.equal(g.acts.manada,4,'con rng desempata');
  assert.deepEqual(F.pendientes(g),[]);
});
test('manada: «nadie» también cuenta; el Alfa puede maldecir',()=>{
  const g=mk(['loboAlfa','lobo','aldeano','aldeano']);
  const c=cfg0();F.abrir(g,c,'manada');
  assert.equal(g.prompts[0].preguntas.length,2);assert.equal(g.prompts[1].preguntas.length,1);
  resp(g,c,0,{victima:2,maldecir:true});resp(g,c,1,{victima:2});
  assert.equal(g.acts.manada,2);assert.equal(g.acts.alfaCurse,true);
  const r=E.resolveNight(g,g.acts);
  assert.ok(g.assigned[2].lobo&&g.assigned[2].vivo);assert.deepEqual(r.manana,['Nadie ha muerto esta noche']);
});
test('validación: id viejo, opción inválida, falta de respuesta y doble respuesta',()=>{
  const g=mk(['vidente','lobo','aldeano']);const c=cfg0();
  F.abrir(g,c,'vidente');
  assert.equal(F.responder(g,c,0,'otro-id',{ver:1}).ok,false);
  assert.equal(resp(g,c,0,{ver:9}).ok,false);
  assert.equal(resp(g,c,0,{}).ok,false);
  const r=resp(g,c,0,{ver:1});
  assert.ok(r.ok);assert.ok(r.texto.includes('LOBO'));
  assert.equal(F.responder(g,c,0,'x',{ver:1}).ok,false,'ya respondió');
});
test('nadie más que el titular tiene pregunta (un jugador sin poder no puede responder)',()=>{
  const g=mk(['vidente','lobo','aldeano']);const c=cfg0();F.abrir(g,c,'vidente');
  assert.equal(g.prompts[2],undefined);assert.equal(g.prompts[1],undefined);
});
test('Vidente y Zorra reciben su resultado en privado',()=>{
  const g=mk(['vidente','zorra','lobo','aldeano','aldeano']);const c=cfg0();
  F.abrir(g,c,'vidente');resp(g,c,0,{ver:3});
  assert.ok(g.res[0].t.includes('ALDEANO'));
  F.abrir(g,c,'zorra');const r=resp(g,c,1,{centro:3});
  assert.ok(r.texto.includes('lobo'));assert.equal(g.acts.zorra,3);
});
test('Bruja: ve a los devorados y su cura/veneno llegan a la resolución',()=>{
  const g=mk(['lobo','bruja','aldeano','aldeano','aldeano']);const c=cfg0();
  g.acts.manada=2;
  F.abrir(g,c,'bruja');
  assert.ok(g.prompts[1].texto.includes('J3'));
  assert.deepEqual(g.prompts[1].preguntas.map(q=>q.k),['cura','veneno']);
  resp(g,c,1,{cura:2,veneno:3});
  const r=E.resolveNight(g,g.acts);
  assert.ok(g.assigned[2].vivo&&!g.assigned[3].vivo);assert.equal(r.muertes.length,1);
  F.abrir(g,c,'bruja');assert.equal(g.prompts[1],undefined,'sin pociones no hay pregunta');
});
test('Policía, Inquisidor y Careto: preguntas y efectos',()=>{
  const g=mk(['policia','inquisidor','careto','lobo','aldeano','lobo']);g.initialWolves=2;const c=cfg0();
  F.abrir(g,c,'policia');resp(g,c,0,{arresta:4,inmune:0});
  assert.equal(g.acts.policiaArresta,4);
  F.abrir(g,c,'inquisidor');
  assert.equal(g.prompts[1].preguntas[0].n,2);
  assert.equal(resp(g,c,1,{sospechosos:[3]}).ok,false);
  resp(g,c,1,{sospechosos:[3,5]});assert.deepEqual(g.acts.inquisidor,[3,5]);
  F.abrir(g,c,'careto');resp(g,c,2,{cambio:[2,3]});assert.deepEqual(g.acts.careto,[2,3]);
  const r=E.resolveNight(g,g.acts);
  assert.equal(r.info.inquisidor,'acierta');assert.ok(g.assigned[4].preso);
});
test('Ladrón (externo) y Cupido/Niño Salvaje se resuelven por pregunta',()=>{
  const g=mk(['ladron','cupido','ninoSalvaje','aldeano','aldeano']);g.ladronCards=['lobo','vidente'];const c=cfg0();
  F.abrir(g,c,'ladron');
  assert.equal(g.prompts[0].preguntas[0].opciones.length,2);assert.equal(g.prompts[0].preguntas[0].opcional,true);
  resp(g,c,0,{carta:1});assert.deepEqual(g.assigned[0].roles,['ladron','vidente']);assert.ok(g.ladronChosen);
  F.abrir(g,c,'amor');resp(g,c,1,{amor:[1,3]});assert.ok(g.assigned[1].amor&&g.assigned[3].amor);
  F.abrir(g,c,'modelo');resp(g,c,2,{modelo:4});assert.ok(g.assigned[4].modelo);
  const h=mk(['ladron','aldeano']);h.ladronCards=['lobo','loboAlfa'];F.abrir(h,c,'ladron');
  assert.equal(h.prompts[0].preguntas[0].opcional,false,'con dos lobos está obligado');
});
test('votación: no votan los presos, no se puede votar al inmune ni el Niño a su Modelo',()=>{
  const g=mk(['aldeano','aldeano','ninoSalvaje','lobo','aldeano']);
  g.assigned[0].preso=true;g.assigned[1].inmune=true;g.assigned[3].modelo=true;
  const c=cfg0();const seats=F.abrirVoto(g,c);
  assert.ok(!seats.includes(0));
  const ops=i=>g.prompts[i].preguntas[0].opciones.map(o=>o.v);
  assert.ok(!ops(2).includes(1)&&!ops(2).includes(3));
  assert.ok(ops(4).includes(3)&&!ops(4).includes(1));
});
test('votación: recuento con Insignia doble y desempate por la Insignia',()=>{
  const g=mk(['aldeano','aldeano','aldeano','lobo','aldeano']);g.assigned[0].insignia=true;
  const c=cfg0();F.abrirVoto(g,c);
  resp(g,c,0,{voto:3});resp(g,c,1,{voto:2});resp(g,c,2,{voto:3});resp(g,c,3,{voto:2});resp(g,c,4,{voto:null});
  const t=F.contarVotos(g);
  assert.equal(t.votaron,5);assert.equal(t.votoAlguacil,3);
  assert.deepEqual(t.totals,{2:2,3:3});assert.equal(t.ganador,3);
  F.abrirVoto(g,c);resp(g,c,0,{voto:2});resp(g,c,1,{voto:3});resp(g,c,2,{voto:3});
  const e=F.contarVotos(g);assert.ok(e.empate&&e.desempata===0);
  F.abrirDesempate(g,e.top);resp(g,c,0,{elegir:3});assert.equal(g.desempate,3);
});
test('Heredera: pregunta antes del linchamiento y hereda si acepta',()=>{
  const g=mk(['heredera','vidente','lobo','aldeano']);const c=cfg0();
  assert.equal(F.abrirHeredera(g,1),0);
  resp(g,c,0,{heredar:true});E.lynch(g,1);
  assert.deepEqual(g.assigned[0].roles,['vidente']);
  const h=mk(['heredera','vidente']);h.assigned[0].amor=true;assert.equal(F.abrirHeredera(h,1),null);
});
test('pendientes: el Cazador muerto decide su disparo y el portador de la Insignia nombra sucesor',()=>{
  const g=mk(['cazador','aldeano','lobo','aldeano']);g.assigned[0].insignia=true;const c=cfg0();
  E.kill(g,0,'noche');
  assert.deepEqual(F.abrirPendientes(g).sort(),[0]);
  assert.equal(g.prompts[0].preguntas.length,1);
  resp(g,c,0,{disparo:2});
  assert.ok(!g.assigned[2].vivo);
  F.abrirPendientes(g);
  assert.ok(g.prompts[0]&&g.prompts[0].accion==='insignia');
  resp(g,c,0,{sucesor:3});assert.ok(g.assigned[3].insignia);assert.equal(g.pending.length,0);
});
test('el estado sobrevive a guardar y restaurar (JSON): las preguntas abiertas se pueden contestar',()=>{
  const g=mk(['vidente','lobo','aldeano']);const c=cfg0();
  F.abrir(g,c,'vidente');
  const g2=JSON.parse(JSON.stringify(g));
  const pr=g2.prompts[0];
  const r=F.responder(g2,c,0,pr.id,{ver:1});
  assert.ok(r.ok);assert.equal(g2.acts.vidente,1);
});
test('anuncios: se acumulan con un límite',()=>{
  const g=mk(['aldeano','lobo']);
  for(let i=0;i<70;i++)F.anunciar(g,'a'+i);
  assert.equal(g.anuncios.length,60);assert.equal(g.anuncios[59].t,'a69');
});
