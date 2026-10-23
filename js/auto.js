/* js/auto.js — Narrador automático de «La aldea se duerme». Sin DOM: navegador (script clásico) y Node (tests).
   Recorre los pasos de Flow.pasos() solo: abre las preguntas de cada paso en los móviles, espera las respuestas (con límite de tiempo),
   resuelve la noche con Engine.resolveNight, modera el debate, la votación (desempates, Heredera, Cazador, Insignia) y detecta la victoria.
   Todo el estado vive en `game` (se guarda y se restaura). El reloj es inyectable (o.sleep, o.tick) para probarlo con bots.
   Nota: los tiempos mínimos de cada paso de noche existen para que nadie deduzca por la duración si un personaje sigue vivo. */
const Auto=(function(){
const E=(typeof Engine!=='undefined')?Engine:require('./engine.js');
const F=(typeof Flow!=='undefined')?Flow:require('./flow.js');
const FLOW_ACC=['ladron','modelo','amor','manada','rojo','judas','bruja','vidente','zorra','policia','inquisidor','careto'];

// o = { game:()=>game, cfg:()=>cfg, sync:()=>void, onFin:(w)=>void, rng, sleep(ms), tick (ms por vuelta), hook:()=>void (solo tests) }
function crear(o){
  const TICK=o.tick||250,rng=o.rng||Math.random;
  const dormir=o.sleep||(ms=>new Promise(r=>setTimeout(r,ms)));
  let corriendo=false,saltar=false;
  const G=()=>o.game(),C=()=>o.cfg();
  const T=()=>Object.assign({noche:30,debate:120,voto:45},C().tiempos||{});
  const pub=()=>{if(o.sync)o.sync();};

  // Espera a que `listo()` sea cierto (pasado el mínimo) o se agote el máximo; respeta pausa y «saltar».
  async function esperar(minMs,maxMs,listo,et){
    const g=G();g.auto=Object.assign(g.auto||{},{rest:maxMs,min:minMs,total:maxMs,et:et||''});
    pub();let n=0;
    while(corriendo){
      await dormir(TICK);
      if(!corriendo)return 'stop';
      if(g.auto.pausa)continue;
      g.auto.rest-=TICK;g.auto.min-=TICK;
      if(o.hook)o.hook();
      if(saltar){saltar=false;return 'saltar';}
      if(g.auto.min<=0&&listo&&listo())return 'listo';
      if(g.auto.rest<=0)return 'tiempo';
      if(++n%Math.max(1,Math.round(1000/TICK))===0)pub();
    }
    return 'stop';
  }
  const sinResponder=g=>F.pendientes(g).length===0;

  function victoria(){
    const g=G();
    if(g.ladronCards&&g.ladronCards.length&&!g.ladronChosen)return false; // el Ladrón aún puede quedarse con un lobo de las cartas sobrantes
    const w=E.checkWin(g);
    if(w){g.winner=w;g.auto.fin=true;corriendo=false;g.prompts={};g.accionAbierta=null;pub();if(o.onFin)o.onFin(w);return true;}
    return false;
  }
  // Decisiones que esperan a una persona (disparo del Cazador, sucesor de la Insignia). Sin respuesta a tiempo: no dispara / sin sucesor.
  async function resolverPendientes(){
    const g=G();
    while(g.pending.length&&corriendo){
      F.abrirPendientes(g);
      const seats=F.pendientes(g);
      if(!seats.length){g.pending.shift();continue;}
      g.preguntados=seats;
      const r=await esperar(0,T().noche*1000,()=>sinResponder(g),'decisión');
      if(r==='stop')return;
      if(g.pending.length&&F.pendientes(g).length){const it=g.pending[0];g.prompts={};E.resolvePending(g,it.tipo,null);}
    }
    g.prompts={};g.accionAbierta=null;
  }
  async function linchar(idx){
    const g=G();
    const h=F.abrirHeredera(g,idx);
    if(h!==null){g.preguntados=[h];await esperar(0,15000,()=>sinResponder(g),'heredera');g.prompts={};g.accionAbierta=null;}
    E.lynch(g,idx);
    F.anunciar(g,'☠️ '+g.assigned[idx].name+' ha sido linchado');
    await resolverPendientes();
  }
  async function votacion(){
    const g=G(),t=T();let solo=null;
    for(;;){
      g.preguntados=F.abrirVoto(g,C(),solo);
      await esperar(0,t.voto*1000,()=>sinResponder(g),'votación');
      if(!corriendo)return;
      const r=F.contarVotos(g);g.prompts={};g.accionAbierta=null;g.preguntados=[];
      if(r.max===0){F.anunciar(g,'Nadie ha recibido votos: hoy no se elimina a nadie');return;}
      let objetivo=null;
      if(r.ganador!==null)objetivo=r.ganador;
      else if(r.empate){
        if(r.desempata!==null){
          F.abrirDesempate(g,r.top);g.preguntados=[r.desempata];
          await esperar(0,Math.round(t.voto*600),()=>sinResponder(g),'desempate');
          g.prompts={};g.accionAbierta=null;
          objetivo=(g.desempate!==undefined&&g.desempate!==null)?g.desempate:r.top[Math.floor(rng()*r.top.length)];
        }else if(!solo){
          F.anunciar(g,'Empate entre '+r.top.map(i=>g.assigned[i].name).join(' y ')+': se vota de nuevo entre ellos');
          solo=r.top;continue;
        }else{F.anunciar(g,'Sigue el empate: hoy no se elimina a nadie');return;}
      }
      await linchar(objetivo);return;
    }
  }
  async function ejecutarPaso(st){
    const g=G(),c=C(),t=T(),acc=st.action;
    g.auto.paso={em:st.em,t:st.title,fase:st.phase,accion:acc||null};pub();
    if(FLOW_ACC.includes(acc)){
      g.preguntados=F.abrir(g,c,acc);
      const max=(acc==='manada'?t.noche*1500:t.noche*1000),min=Math.min(8000,Math.round(t.noche*300));
      await esperar(min,max,()=>sinResponder(g),st.title);
      if(!corriendo)return;
      F.cerrar(g,rng);g.preguntados=[];
      // sin respuesta: Cupido y Niño Salvaje no pueden quedarse sin pareja / Modelo
      if(acc==='amor'&&!g.assigned.some(p=>p.amor)){const v=E.alivePlayers(g).map(p=>p.idx);const a=v.splice(Math.floor(rng()*v.length),1)[0],b=v[Math.floor(rng()*v.length)];E.setEnamorados(g,a,b);}
      if(acc==='modelo'&&!g.assigned.some(p=>p.modelo)){const n=E.actor(g,'ninoSalvaje');if(n){const v=E.alivePlayers(g).filter(p=>p.idx!==n.idx);E.setModelo(g,n.idx,v[Math.floor(rng()*v.length)].idx);}}
      return;
    }
    if(acc==='despierta'){
      const rep=E.resolveNight(g,g.acts||{});g.nightRep=rep;g.nightResolved=true;if(rep.info.careto)g.caretoUsedNight=g.night;
      rep.manana.forEach(x=>F.anunciar(g,x));
      await resolverPendientes();return;
    }
    if(acc==='debate'){F.anunciar(g,'💬 Empieza el debate');await esperar(0,t.debate*1000,()=>false,'debate');return;}
    if(acc==='votacion'){await votacion();return;}
    if(acc==='medium'){F.infoMedium(g);return;}
    // alfa, jabalí… no necesitan a nadie
  }
  async function bucle(){
    const g=G();
    while(corriendo){
      const pasos=F.pasos(g,C());g.steps=pasos;
      if(g.stepIdx>=pasos.length)g.stepIdx=0;
      await ejecutarPaso(pasos[g.stepIdx]);
      if(!corriendo)break;
      if(victoria())break;
      if(g.stepIdx>=pasos.length-1){
        E.nextCycle(g);g.acts={};g.res={};g.nightResolved=false;g.nightRep=null;g.votosDia={};g.stepIdx=0;
        F.anunciar(g,'🌙 Cae la noche '+g.night);
      }else g.stepIdx++;
      pub();
    }
  }
  function iniciar(){
    if(corriendo)return;
    const g=G();if(!g.auto)g.auto={};
    corriendo=true;bucle().catch(e=>{console.error('Auto:',e);corriendo=false;});
  }
  return{
    iniciar,reanudar:iniciar,
    detener(){corriendo=false;},
    pausa(on){const g=G();if(g.auto)g.auto.pausa=!!on;pub();},
    saltar(){saltar=true;},
    activo:()=>corriendo
  };
}
return{crear,FLOW_ACC};
})();
if(typeof module!=='undefined')module.exports=Auto;
