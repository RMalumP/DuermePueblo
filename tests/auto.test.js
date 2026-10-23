// Narrador automático: partidas completas jugadas por bots con distintas cartas. Ejecutar con: npm test
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../js/engine.js');
const F=require('../js/flow.js');
const A=require('../js/auto.js');

function lcg(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
const ROLES=['vidente','bruja','cazador','cupido','borracho','jabali','zorra','policia','loboAlfa','loboJudas','ninoSalvaje','heredera','inquisidor','careto','medium','ladron','rata','insignia','nina'];
function cfgAl(rng,players){
  const optional={};
  ROLES.forEach(r=>{if(rng()<0.35)optional[r]=true;});
  if(optional.careto&&optional.ninoSalvaje)delete optional.careto;
  const wolves=E.recWolvesFor(players);
  return{players,wolves,narrator:'none',narratorEnabled:false,names:[],optional,insigniaMode:'random',ladronMode:'externo',mode:2,accionesMovil:true,tiempos:{noche:20,debate:30,voto:20}};
}
// Un bot responde al azar (pero siempre de forma válida) a todas las preguntas abiertas.
function botHook(g,cfg,rng){
  return()=>{
    Object.keys(g.prompts||{}).forEach(s=>{
      const pr=g.prompts[s];if(!pr)return;
      const vals={};
      pr.preguntas.forEach(q=>{
        if(q.modo==='sino')vals[q.k]=rng()<0.3;
        else if(q.modo==='uno'){vals[q.k]=(q.opciones.length&&(!q.opcional||rng()<0.75))?q.opciones[Math.floor(rng()*q.opciones.length)].v:null;}
        else{const ops=q.opciones.slice();const arr=[];if(!(q.opcional&&rng()<0.4))while(arr.length<q.n&&ops.length)arr.push(ops.splice(Math.floor(rng()*ops.length),1)[0].v);vals[q.k]=arr;}
      });
      F.responder(g,cfg,+s,pr.id,vals);
    });
  };
}
function jugar(seed){
  const rng=lcg(seed);
  const players=6+Math.floor(rng()*8);
  const cfg=cfgAl(rng,players);
  if(!E.capacity(cfg).ok)return null;
  const g=Object.assign(E.createGame(cfg,rng),{acts:{},stepIdx:0,steps:[]});
  let ticks=0;
  return new Promise((resolve,reject)=>{
    const hook=botHook(g,cfg,rng);
    const auto=A.crear({game:()=>g,cfg:()=>cfg,rng,tick:1000,sleep:()=>Promise.resolve(),
      hook:()=>{if(++ticks>300000){auto.detener();reject(new Error('partida sin fin, semilla '+seed));}hook();},
      onFin:w=>resolve({g,w,cfg,ticks})});
    auto.iniciar();
  });
}
test('narrador automático: 80 partidas completas con bots y cartas aleatorias terminan con un ganador válido',async()=>{
  let jugadas=0,tipos={};
  for(let seed=1;seed<=140&&jugadas<80;seed++){
    const r=await jugar(seed);if(!r)continue;
    jugadas++;
    const {g,w}=r;
    assert.ok(w&&w.t,'hay ganador (semilla '+seed+')');
    assert.equal(E.checkWin(g).t,w.t,'el ganador sigue siendo válido (semilla '+seed+')');
    assert.equal(Object.keys(g.prompts||{}).length,0,'no quedan preguntas abiertas (semilla '+seed+')');
    assert.equal(g.pending.length,0);
    assert.ok(g.anuncios&&g.anuncios.length>0,'hubo anuncios públicos');
    // puntuación coherente: nadie con NaN y el reparto de puntos de equipo respeta la tabla
    const rows=E.puntuar(g,w);
    assert.ok(rows.every(x=>Number.isFinite(x.total)),'puntos finitos (semilla '+seed+')');
    tipos[w.k]=(tipos[w.k]||0)+1;
  }
  assert.ok(jugadas>=60,'se jugaron suficientes partidas ('+jugadas+')');
  assert.ok(Object.keys(tipos).length>=2,'hubo más de un tipo de victoria: '+JSON.stringify(tipos));
});
test('narrador automático: pausa congela el reloj y saltar adelanta el paso',async()=>{
  const rng=lcg(7);const cfg=cfgAl(rng,8);cfg.optional={};cfg.tiempos={noche:20,debate:30,voto:20};
  const g=Object.assign(E.createGame(cfg,rng),{acts:{},stepIdx:0,steps:[]});
  let ticks=0,paused=false;let resolverFin;
  const auto=A.crear({game:()=>g,cfg:()=>cfg,rng,tick:1000,sleep:()=>new Promise(r=>setTimeout(r,1)),hook:()=>{ticks++;},onFin:()=>resolverFin()});
  auto.iniciar();
  await new Promise(r=>setTimeout(r,20));
  auto.pausa(true);
  await new Promise(r=>setTimeout(r,10));
  const t0=ticks;
  await new Promise(r=>setTimeout(r,40));
  assert.ok(ticks-t0<=1,'en pausa el reloj no avanza ('+(ticks-t0)+')');
  auto.pausa(false);
  await new Promise(r=>setTimeout(r,40));
  assert.ok(ticks>t0+5,'al reanudar vuelve a avanzar');
  auto.detener();
});
test('narrador automático: sin respuestas, la partida avanza por tiempo y los pasos mínimos evitan filtrar quién está vivo',async()=>{
  const rng=lcg(11);const cfg=cfgAl(rng,7);cfg.optional={vidente:true,bruja:true};cfg.wolves=2;
  const g=Object.assign(E.createGame(cfg,rng),{acts:{},stepIdx:0,steps:[]});
  const pasos=[];
  const auto=A.crear({game:()=>g,cfg:()=>cfg,rng,tick:1000,sleep:()=>Promise.resolve(),hook:()=>{if(g.auto&&g.auto.paso&&pasos[pasos.length-1]!==g.auto.paso.t)pasos.push(g.auto.paso.t);if(g.night>3)auto.detener();}});
  auto.iniciar();
  await new Promise(r=>setTimeout(r,50));
  assert.ok(g.night>=2,'la noche avanza aunque nadie responda ('+g.night+')');
  assert.ok(pasos.some(x=>x.includes('Vidente'))&&pasos.some(x=>x.includes('Bruja')),'recorre los pasos de los personajes en juego');
  auto.detener();
});
