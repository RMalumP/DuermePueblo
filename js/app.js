/* js/app.js — Interfaz de «La aldea se duerme» (configuración, reparto, modo guiado, votación). Usa PD (data.js) y Engine (engine.js). */
const {C,SHORT,REC,DOUBLE,OPTIONAL,RD}=PD;
const IMG="https://aaldeiadormece.estaminestudio.com/img/";
const BACK="https://images.steamusercontent.com/ugc/2274945577069468636/192A59DBD78136EB151CD31E6E109C6BA6075707/?imw=512&imh=512&ima=fit&impolicy=Letterbox&imcolor=%23000000&letterbox=false";
const LOGO=IMG+"baralho36.png";


let cfg={players:8,wolves:2,narrator:"random",narratorEnabled:true,names:[],optional:{},mode:1,insigniaMode:"random",ladronMode:"externo",ninaRemota:false,accionesMovil:false,narradorAuto:false,tiempos:{noche:30,debate:120,voto:45}};
OPTIONAL.forEach(([k,on])=>cfg.optional[k]=on);

let game={assigned:[],deck:[],revealList:[],ladronCards:[],ladronChosen:false,caretoUsed:false,
  reveal:{idx:0,flipped:false,seen:0,allSeen:false},night:1,day:0,steps:[],stepIdx:0,
  firstNightDone:false,sheetTarget:null,resultsFrom:"scr-game",caretoSel:[],
  winner:null,ladronCallback:null};

/* ===== CONFIG ===== */
const esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function recWolvesFor(n){return Engine.recWolvesFor(n);}
function changePlayers(d){
  cfg.players=Math.max(5,Math.min(25,cfg.players+d));
  document.getElementById('numPlayers').textContent=cfg.players;
  document.getElementById('recWolves').textContent=recWolvesFor(cfg.players);
  clampWolves();
  syncWolfWarn();renderNarratorOptions();renderNames();renderRoles();checkRoleCapacity();
}
function clampWolves(){cfg.wolves=Math.max(1,Math.min(Engine.maxWolves(cfg),cfg.wolves));document.getElementById('numWolves').textContent=cfg.wolves;}
function changeWolves(d){cfg.lobosManual=true;cfg.wolves+=d;clampWolves();syncWolfWarn();checkRoleCapacity();}
function syncWolfWarn(){
  const rec=recWolvesFor(cfg.players),w=document.getElementById('wolfWarn');
  if(cfg.wolves!==rec){w.style.display='flex';w.querySelector('span:last-child').textContent=`No recomendado: lo habitual para ${cfg.players} jugadores son ${rec} lobos.`;}
  else w.style.display='none';
}
function renderNarratorOptions(){
  const sel=document.getElementById('narratorSel'),prev=cfg.narrator;
  sel.innerHTML='<option value="random">🎲 Narrador al azar</option>';
  for(let i=0;i<cfg.players;i++){
    const o=document.createElement('option');o.value=i;o.textContent=(cfg.names[i]||('Jugador '+(i+1)))+' (narrador fijo)';sel.appendChild(o);
  }
  if(prev==="random"||(prev!=="none"&&prev<cfg.players))sel.value=prev;else{sel.value="random";cfg.narrator="random";}
}
function onNarratorChange(){cfg.narrator=document.getElementById('narratorSel').value;clampWolves();syncWolfWarn();renderNames();checkRoleCapacity();}
function toggleNarrator(){
  cfg.narratorEnabled=!cfg.narratorEnabled;
  const b=document.getElementById('narToggle'),s=document.getElementById('narratorSel');
  if(cfg.narratorEnabled){b.classList.remove('off');b.textContent='Narrador activado · pulsa para jugar sin narrador';s.disabled=false;cfg.narrator=s.value;}
  else{b.classList.add('off');b.textContent='SIN narrador · pulsa para activarlo';s.disabled=true;cfg.narrator="none";}
  renderNames();
}
function renderNames(){
  const box=document.getElementById('namesBox');box.innerHTML='';const fn=fixedNarIdx();
  for(let i=0;i<cfg.players;i++){
    const row=document.createElement('div');row.className='namerow';const isNar=(i===fn);
    row.innerHTML=`<div class="nbadge">${isNar?'📖':(i+1)}</div>`;
    const inp=document.createElement('input');inp.type='text';inp.placeholder=isNar?'Narrador':('Jugador '+(i+1));inp.value=cfg.names[i]||'';
    inp.oninput=e=>cfg.names[i]=e.target.value;row.appendChild(inp);box.appendChild(row);
  }
}
function renderRoles(){
  const grid=document.getElementById('rolesGrid');grid.innerHTML='';const n=cfg.players;
  OPTIONAL.forEach(([k])=>{
    const c=C[k],r=REC[k]||{min:5,hint:""},isRec=(n>=r.min);
    const div=document.createElement('div');div.className='role-chk'+(cfg.optional[k]?' on':'');
    const dblBadge=DOUBLE.has(k)?'<span class="dbl-mini">🎴×2</span>':'';
    let recHtml=isRec?`<div class="rc-rec yes">✦ Recomendada para ${n} jugadores</div>`:`<div class="rc-rec no">⚠ ${r.hint||('Mejor con '+r.min+'+ jugadores')}</div>`;
    div.innerHTML=`<div class="rc-top"><span class="em">${c.em}</span><span class="rn">${c.n}</span>${dblBadge}<span class="team-dot team-${c.t}"></span></div>
      <div class="rc-desc">${SHORT[k]}</div>${recHtml}<div class="chk"></div>`;
    // sub-options for insignia and ladron
    if(cfg.optional[k]){
      if(k==='insignia'){
        const sub=document.createElement('div');sub.className='sub-options';
        sub.innerHTML=`<div class="imode-row">
          <button class="imode-btn${cfg.insigniaMode==='random'?' on':''}" onclick="setMode('insigniaMode','random',event)">🎲 Aleatorio</button>
          <button class="imode-btn${cfg.insigniaMode==='vote'?' on':''}" onclick="setMode('insigniaMode','vote',event)">🗳️ Por votación</button>
        </div>`;
        div.appendChild(sub);
      }
      if(k==='ladron'){
        const sub=document.createElement('div');sub.className='sub-options';
        sub.innerHTML=`<div class="imode-row">
          <button class="imode-btn${cfg.ladronMode==='externo'?' on':''}" onclick="setMode('ladronMode','externo',event)">🃏 Cartas externas</button>
          <button class="imode-btn${cfg.ladronMode==='intercambio'?' on':''}" onclick="setMode('ladronMode','intercambio',event)">🔄 Intercambio</button>
        </div><div style="font-size:11px;color:var(--muted);margin-top:6px;padding-left:2px">${cfg.ladronMode==='externo'?'Ve 2 cartas sobrantes y elige una':'Intercambia cualquier carta con la de otro jugador'}</div>`;
        div.appendChild(sub);
      }
    }
    div.onclick=()=>{
      if(k==='careto'&&!cfg.optional[k]&&cfg.optional['ninoSalvaje'])cfg.optional['ninoSalvaje']=false;
      if(k==='ninoSalvaje'&&!cfg.optional[k]&&cfg.optional['careto'])cfg.optional['careto']=false;
      cfg.optional[k]=!cfg.optional[k];renderRoles();checkRoleCapacity();
    };
    grid.appendChild(div);
  });
}
function setMode(field,val,e){if(e)e.stopPropagation();cfg[field]=val;renderRoles();}
function selOpt(){return Engine.selOpt(cfg);}
function selWolf(){return Engine.selWolf(cfg);}
function selVillage(){return Engine.selVillage(cfg);}
function hasRandomNar(){return Engine.narratorPlan(cfg).randomCard;}
function fixedNarIdx(){return Engine.narratorPlan(cfg).fixedIdx;}
function totalCards(){return Engine.totalCards(cfg);}
function checkRoleCapacity(){
  const w=document.getElementById('roleWarn'),cap=Engine.capacity(cfg);
  if(!cap.ok){w.style.display='flex';w.querySelector('span:last-child').textContent=cap.msg;return false;}
  w.style.display='none';return true;
}
// Acciones desde los móviles / narrador automático (opciones de la partida online). El narrador automático implica acciones en móviles.
function toggleCfgFlag(k){
  cfg[k]=!cfg[k];
  if(k==='narradorAuto'&&cfg.narradorAuto){cfg.accionesMovil=true;cfg.mode=2;}
  if(k==='accionesMovil'&&cfg.accionesMovil)cfg.mode=2;
  if(k==='accionesMovil'&&!cfg.accionesMovil)cfg.narradorAuto=false;
  aplicarOpcionesUI();
}
function setTiempo(k,v){if(!cfg.tiempos)cfg.tiempos={noche:30,debate:120,voto:45};cfg.tiempos[k]=+v;}
function aplicarOpcionesUI(){
  const f=(id,on,txt)=>{const b=document.getElementById(id);if(!b)return;b.classList.toggle('on',!!on);b.textContent=txt+' · '+(on?'ACTIVADO':'desactivado');};
  f('btnAccionesMovil',cfg.accionesMovil,'📱 Acciones desde los móviles');
  f('btnNarradorAuto',cfg.narradorAuto,'🤖 Narrador automático');
  pickMode(cfg.mode);
  const t=cfg.tiempos||{noche:30,debate:120,voto:45};
  [['tmNoche','noche'],['tmDebate','debate'],['tmVoto','voto']].forEach(([id,k])=>{const s=document.getElementById(id);if(s)s.value=String(t[k]);});
}
function toggleNinaRemota(){
  cfg.ninaRemota=!cfg.ninaRemota;
  const b=document.getElementById('btnNinaRemota');b.classList.toggle('on',cfg.ninaRemota);
  b.textContent='👧 Niña a distancia · '+(cfg.ninaRemota?'ACTIVADO':'desactivado');
}
function pickMode(m){cfg.mode=m;document.getElementById('mode1').classList.toggle('on',m===1);document.getElementById('mode2').classList.toggle('on',m===2);}
function toggleCollap(id){document.getElementById(id).classList.toggle('open');}

/* ===== INICIAR ===== */
function newGameState(){
  return Object.assign(Engine.createGame(cfg),{
    sheetTarget:null,resultsFrom:'scr-game',caretoSel:[],ladronCallback:null,ladronModalShown:false,steps:[],stepIdx:0,acts:{},nightResolved:false,nightRep:null,vote:null,caretoUsedNight:null,
    reveal:{idx:0,flipped:false,seen:0,allSeen:false,busy:false}});
}
function showAlguacilBtns(){
  ['alguacilBtn1','alguacilBtn2'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display=(cfg.optional['insignia']&&cfg.insigniaMode==='vote')?'block':'none';
  });
}
// Partida online: el anfitrión es el narrador (no juega) y cada jugador ve su carta en su propio móvil, así que no hay reparto pasando el teléfono.
function startOnlineGame(pids,seatIds){
  if(!checkRoleCapacity()){document.getElementById('rolesCollap').classList.add('open');return false;}
  game=newGameState();
  game.assigned.forEach((p,i)=>{p.pid=pids[i]||null;p.seat=(seatIds&&seatIds[i])||p.pid;});
  game.revealList=[];game.online=true;
  showAlguacilBtns();hideWinBanner();
  if(!cfg.narradorAuto)goToGame(); // con narrador automático el anfitrión juega y no usa el panel guiado
  return true;
}
function startGame(){
  if(window.Online&&Online.activo()&&Online.esAnfitrion()){Online.repartir();return;}
  if(!checkRoleCapacity()){document.getElementById('rolesCollap').classList.add('open');return;}
  game=newGameState();
  game.revealList=Engine.revealList(game);
  ['alguacilBtn1','alguacilBtn2'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display=(cfg.optional['insignia']&&cfg.insigniaMode==='vote')?'block':'none';
  });
  ['1','2'].forEach(n=>{const b=document.getElementById('winBanner'+n);if(b)b.classList.remove('show');});
  show('scr-reveal');renderReveal();
  if(game.narratorNote)toast(game.narratorNote);
}

/* ===== REVEAL ===== */
function cardsOf(p){const arr=p.roles.slice();if(p.insignia)arr.push('insignia');return arr;}
function renderReveal(){
  const p=game.revealList[game.reveal.idx];
  game.reveal.flipped=false;
  document.getElementById('rvName').textContent=p.name;
  document.getElementById('rvProg').textContent=`Jugador ${game.reveal.idx+1} de ${game.revealList.length}`+(cardsOf(p).length>1?' · 2 cartas':'');
  renderFlip(p);
  document.getElementById('rvStart').style.display=game.reveal.allSeen?'block':'none';
  document.getElementById('rvNext').textContent='Ver mi carta';
}
function setFlipped(f){
  game.reveal.flipped=f;
  document.querySelectorAll('#flipStage .flip').forEach(el=>el.classList.toggle('is-flipped',f));
  document.getElementById('rvNext').textContent=f?'Ocultar y siguiente ›':'Ver mi carta';
}
function renderFlip(p){
  const stage=document.getElementById('flipStage');stage.innerHTML='';
  const wrap=document.createElement('div');wrap.className='flip-multi';
  cardsOf(p).forEach(rk=>{
    const flip=document.createElement('div');flip.className='flip';
    flip.onclick=()=>{if(!game.reveal.busy)setFlipped(!game.reveal.flipped);};
    const back=document.createElement('div');back.className='face back';
    const bimg=document.createElement('img');bimg.src=BACK;bimg.alt='';
    bimg.onerror=()=>{back.innerHTML='<div class="fallback"><div class="bm">🌙</div><div class="bt">A Aldeia<br>Adormece</div></div>';};
    back.appendChild(bimg);
    const c=C[rk];const front=document.createElement('div');front.className='face front';
    const photo=document.createElement('div');photo.className='photo';
    const img=document.createElement('img');img.src=IMG+c.img[Math.floor(Math.random()*c.img.length)]+'.png';img.alt=c.n;
    img.onerror=()=>{photo.innerHTML=`<div class="emoji">${c.em}</div>`;};
    photo.appendChild(img);
    const meta=document.createElement('div');meta.className='meta';
    meta.innerHTML=`<div class="rname">${c.n}</div><div class="rteam teamtxt-${c.t}">${teamName(c.t)}</div>`;
    front.appendChild(photo);front.appendChild(meta);flip.appendChild(back);flip.appendChild(front);wrap.appendChild(flip);
  });
  stage.appendChild(wrap);
}
function teamName(t){return t==='lobo'?'Lobos':(t==='aldea'?'Aldea':'Neutral');}
function revealNext(){
  if(game.reveal.busy)return;
  if(!game.reveal.flipped){
    setFlipped(true);
    if(game.reveal.idx===game.revealList.length-1){game.reveal.allSeen=true;document.getElementById('rvStart').style.display='block';}
    return;
  }
  // se tapa la carta y, cuando termina el giro, se pasa al siguiente jugador (nunca se ve la carta ajena)
  game.reveal.busy=true;setFlipped(false);
  game.reveal.seen=Math.max(game.reveal.seen,game.reveal.idx+1);
  setTimeout(()=>{game.reveal.idx=(game.reveal.idx+1)%game.revealList.length;game.reveal.busy=false;renderReveal();},450);
}
// goToGame: en guiado lo gestiona el paso del Ladrón; en reparto se abre al entrar al juego
function goToGame(){
  proceedToGame();
  if(cfg.mode===1&&cfg.optional['ladron']&&!game.ladronChosen){
    game.ladronCallback=null;
    setTimeout(()=>showLadronModal(),350);
  }
}
function proceedToGame(){
  if(cfg.mode===1){show('scr-game');renderGameInfo();}
  else{show('scr-guided');game.stepIdx=0;renderStep();renderPlayersMini();}
}

/* ===== LADRÓN MODAL ===== */
function showLadronModal(){
  const body=document.getElementById('ladronBody');body.innerHTML='';
  if(cfg.ladronMode==='externo'){
    const lcs=game.ladronCards;
    const bothWolves=Engine.ladronMustChoose(game);
    const intro=document.createElement('div');
    intro.innerHTML=bothWolves
      ?'<div class="lad-must">⚠️ Ambas son Lobos — debes elegir una</div>'
      :'<p style="font-size:14px;color:var(--cream-d);text-align:center">Toca la carta que quieres robar:</p>';
    body.appendChild(intro);
    const row=document.createElement('div');row.className='lad-cards';
    lcs.forEach((rk,i)=>{
      const c=C[rk]||{n:rk,t:'aldea',em:'🃏',img:[]};
      const div=document.createElement('div');div.className='lad-card';
      let inner='';
      if(c.img&&c.img.length)inner+=`<img class="lci" src="${IMG+c.img[0]}.png" onerror="this.style.display='none';this.previousElementSibling&&(this.previousElementSibling.style.display='block')">`;
      div.innerHTML=`<span class="lce" style="${c.img&&c.img.length?'display:none':'display:block'}">${c.em}</span>`+inner+`<div class="lcn">${c.n}</div><div class="lct teamtxt-${c.t}">${teamName(c.t)}</div>`;
      div.onclick=()=>chooseLadronExterno(i);
      row.appendChild(div);
    });
    body.appendChild(row);
    if(!bothWolves){
      const btn=document.createElement('button');btn.className='btn btn-ghost btn-sm';btn.textContent='Mantener mi carta actual';
      btn.onclick=()=>chooseLadronExterno(null);body.appendChild(btn);
    }
    const note=document.createElement('p');note.style.cssText='font-size:11px;color:var(--muted);text-align:center;margin-top:8px';
    note.textContent='La carta no elegida y la del Ladrón se descartan.';body.appendChild(note);
  } else {
    const intro=document.createElement('p');intro.style.cssText='font-size:14px;color:var(--cream-d)';
    intro.textContent='El Ladrón puede robar la carta de otro jugador (o saltar). El jugador robado pasará a ser Aldeano.';
    body.appendChild(intro);
    const grid=document.createElement('div');grid.className='players-mini';
    const ladronPl=Engine.ladronPlayer(game);
    game.assigned.filter(p=>!p.isNar&&p.vivo&&p!==ladronPl).forEach(p=>{
      const div=document.createElement('div');div.className='pm';
      div.innerHTML=`<div class="pmn"><span class="pe">${p.idx+1}</span>${esc(p.name)}</div>`;
      div.onclick=()=>chooseLadronIntercambio(p.idx);grid.appendChild(div);
    });
    body.appendChild(grid);
    const skip=document.createElement('button');skip.className='btn btn-ghost btn-sm';skip.textContent='Saltar (no robar)';
    skip.onclick=()=>chooseLadronIntercambio(null);body.appendChild(skip);
  }
  document.getElementById('ladronModal').classList.add('open');
}
function chooseLadronExterno(idx){
  Engine.ladronChooseExterno(game,idx);
  closeLadronModal();
  const cb=game.ladronCallback;game.ladronCallback=null;
  if(cb){cb();return;}
  if(cfg.mode===2){renderStep();renderPlayersMini();}
  else{renderDeathGrid();}
}
function chooseLadronIntercambio(targetIdx){
  const ev=Engine.ladronChooseIntercambio(game,targetIdx);
  if(ev.length)toast(ev[0]);
  closeLadronModal();
  updateLadronRobadoBtn();
  refreshGameUI();
  const cb=game.ladronCallback;game.ladronCallback=null;
  if(cb){cb();return;}
  if(cfg.mode===2){renderStep();renderPlayersMini();}
  else{renderDeathGrid();}
}
function closeLadronModal(){document.getElementById('ladronModal').classList.remove('open');}
function updateLadronRobadoBtn(){
  const btn=document.getElementById('ladronRobadoFloat');
  if(!btn)return;
  const show=cfg.optional['ladron']&&cfg.ladronMode==='intercambio'&&game.ladronChosen&&game.ladronStolenCard;
  btn.style.display=show?'block':'none';
}
function showLadronRobadoCard(){
  // Muestra la carta robada (la que tenía el jugador robado antes del robo)
  const rk=game.ladronStolenCard;if(!rk)return;
  const c=C[rk]||{n:rk,t:'aldea',em:'🃏',img:[]};
  const m=document.getElementById('ladronRobadoModal');
  document.getElementById('lrmEm').textContent=c.em;
  document.getElementById('lrmN').textContent=c.n;
  document.getElementById('lrmT').textContent='Esta era la carta original';
  const img=document.getElementById('lrmImg');
  if(c.img&&c.img.length){img.src=IMG+c.img[0]+'.png';img.style.display='block';img.onerror=()=>img.style.display='none';}
  else img.style.display='none';
  m.classList.add('open');
}

/* ===== CARETO MODAL ===== */
function showCaretoModal(){
  game.caretoSel=[];
  const grid=document.getElementById('caretoGrid');grid.innerHTML='';
  game.assigned.filter(p=>!p.isNar&&p.vivo).forEach(p=>{
    const div=document.createElement('div');div.className='pm';
    div.innerHTML=`<div class="pmn"><span class="pe">${p.idx+1}</span>${esc(p.name)}</div><div class="pmtags">${p.roles.map(r=>C[r]?`<span class="tag">${C[r].em}</span>`:'').join('')}</div>`;
    div.onclick=()=>{
      const i=game.caretoSel.indexOf(p.idx);
      if(i>=0){game.caretoSel.splice(i,1);div.classList.remove('sel2');}
      else if(game.caretoSel.length<2){game.caretoSel.push(p.idx);div.classList.add('sel2');}
      document.getElementById('caretoInfo').textContent=`Seleccionados: ${game.caretoSel.length}/2`;
      document.getElementById('caretoOK').disabled=game.caretoSel.length!==2;
    };
    grid.appendChild(div);
  });
  document.getElementById('caretoInfo').textContent='Seleccionados: 0/2';
  document.getElementById('caretoOK').disabled=true;
  document.getElementById('caretoModal').classList.add('open');
}
function confirmCaretoSwap(){
  if(game.caretoSel.length!==2)return;
  game.acts.careto=game.caretoSel.slice();
  document.getElementById('caretoModal').classList.remove('open');
  toast(`🎭 Careto: ${game.assigned[game.acts.careto[0]].name} ↔ ${game.assigned[game.acts.careto[1]].name} (se aplica al despertar)`);
  renderStep();
}
function skipCareto(){game.acts.careto=null;document.getElementById('caretoModal').classList.remove('open');toast('Careto: sin intercambio esta noche');renderStep();}
function closeCaretoModal(){document.getElementById('caretoModal').classList.remove('open');}

/* ===== CAZADOR MODAL ===== */
function showCazadorModal(deadIdx){
  const grid=document.getElementById('cazadorGrid');grid.innerHTML='';
  game.assigned.filter(p=>!p.isNar&&p.vivo&&p.idx!==deadIdx).forEach(p=>{
    const div=document.createElement('div');div.className='alg-player';
    div.innerHTML=`<div class="ap-num">${p.idx+1}</div><div class="ap-name">${esc(p.name)}</div><div style="font-size:12px;color:var(--muted)">${p.roles.map(r=>C[r]?C[r].em:'').join('')}</div>`;
    div.onclick=()=>resolveCazador(p.idx);
    grid.appendChild(div);
  });
  document.getElementById('cazadorModal').classList.add('open');
}
function resolveCazador(targetIdx){
  document.getElementById('cazadorModal').classList.remove('open');
  const ev=Engine.resolvePending(game,'cazador',targetIdx);
  afterAct();if(ev.length)toast(ev[0]);
}
function closeCazadorModal(){toast('Elige a quién se lleva el Cazador o pulsa «Nadie»');}

/* ===== ALGUACIL MODAL ===== */
function showAlguacilModal(sucesion){
  const list=document.getElementById('alguacilList');list.innerHTML='';
  document.getElementById('alguacilTxt').textContent=sucesion===true?'El portador de la Insignia ha muerto. Nombra a su sucesor (su voto valdrá por dos):':'Elige al portador del Alguacil/Insignia. Su voto valdrá por dos.';
  const cur=game.assigned.find(p=>p.insignia);
  if(cur)list.innerHTML+=`<p style="font-size:13px;color:var(--gold);margin-bottom:10px">👮 Alguacil actual: <b>${esc(cur.name)}</b></p>`;
  game.assigned.filter(p=>!p.isNar&&p.vivo).forEach(p=>{
    const div=document.createElement('div');div.className='alg-player';
    div.innerHTML=`<div class="ap-num">${p.idx+1}</div><div class="ap-name">${esc(p.name)}</div>${p.insignia?'<div class="ap-cur">👮 actual</div>':''}`;
    div.onclick=()=>{
      document.getElementById('alguacilModal').classList.remove('open');
      if(game.pending.some(x=>x.tipo==='insignia')){Engine.resolvePending(game,'insignia',p.idx);}
      else Engine.setInsignia(game,p.idx);
      afterAct();toast(`👮 Alguacil: ${p.name}`);
    };
    list.appendChild(div);
  });
  document.getElementById('alguacilModal').classList.add('open');
}
function closeAlguacilModal(){
  document.getElementById('alguacilModal').classList.remove('open');
  if(game.pending.some(x=>x.tipo==='insignia')){Engine.resolvePending(game,'insignia',null);afterAct();}
}
/* ===== WIN DETECTION ===== */
function showWinBanner(w){
  ['1','2'].forEach(n=>{
    const b=document.getElementById('winBanner'+n);if(!b)return;
    document.getElementById('wbEm'+n).textContent=w.em;
    document.getElementById('wbT'+n).textContent=w.t;
    document.getElementById('wbD'+n).textContent=w.d;
    b.classList.add('show');
  });
}
function hideWinBanner(){['1','2'].forEach(n=>{const b=document.getElementById('winBanner'+n);if(b)b.classList.remove('show');});}
// Tras cualquier cambio: refresca, resuelve decisiones pendientes (Cazador, Insignia) y recalcula la victoria.
function afterAct(){
  refreshGameUI();
  if(drainPending())return;
  const w=Engine.checkWin(game),prev=game.winner;
  game.winner=w;
  if(w){showWinBanner(w);if(!prev||prev.t!==w.t)toast(`🏁 ${w.t}`);}
  else hideWinBanner();
  if(window.Online)Online.sync();
}
// Acciones desde los móviles: el anfitrión es el narrador y la partida está en modo guiado.
function fasePhones(){return !!(window.Online&&Online.activo()&&Online.esAnfitrion()&&game.online&&cfg.accionesMovil&&cfg.mode===2);}
function actualizarBarraPendiente(){
  const bar=document.getElementById('pendBar');if(!bar)return;
  let txt='',fn=null,label='';
  const ps=Flow.pendientes(game);
  if(game.lynchPendiente!==null&&game.lynchPendiente!==undefined&&ps.length){txt='⏳ Esperando a la Heredera: '+esc(game.assigned[ps[0]].name);label='Seguir sin heredar';fn='saltarHeredera()';}
  else if(game.pending&&game.pending.length&&ps.length&&['cazador','insignia'].includes((game.prompts[ps[0]]||{}).accion)){
    const pr=game.prompts[ps[0]];txt='⏳ Esperando a '+esc(game.assigned[ps[0]].name)+' ('+(pr.accion==='cazador'?'disparo del Cazador':'sucesor de la Insignia')+')';label='Decidir yo';fn='decidirPendienteYo()';
  }
  bar.style.display=txt?'block':'none';
  bar.innerHTML=txt?txt+` <button class="iconbtn" style="margin-left:8px" onclick="${fn}">${label}</button>`:'';
}
function decidirPendienteYo(){
  const it=game.pending[0];if(!it)return;
  if(game.prompts)delete game.prompts[it.idx];
  actualizarBarraPendiente();
  if(it.tipo==='cazador')showCazadorModal(it.idx);else showAlguacilModal(true);
}
function drainPending(){
  const it=game.pending[0];if(!it)return false;
  if(fasePhones()){Flow.abrirPendientes(game);actualizarBarraPendiente();if(window.Online)Online.sync(true);return true;}
  if(it.tipo==='cazador'){if(!document.getElementById('cazadorModal').classList.contains('open'))showCazadorModal(it.idx);}
  else if(it.tipo==='insignia'){if(!document.getElementById('alguacilModal').classList.contains('open'))showAlguacilModal(true);}
  return true;
}

/* ===== FIN MODAL ===== */
function showFinModal(){
  const body=document.getElementById('finBody');
  const w=Engine.checkWin(game);
  if(w){
    body.innerHTML=`<div class="win-modal-msg"><span class="wme">${w.em}</span><div class="wmt">${w.t}</div><div class="wmd">${w.d}</div></div>
      <div id="puntosBox"></div>
      <button class="btn btn-primary" onclick="confirmHome();closeFinModal()" style="margin-top:4px">🏠 Nueva partida</button>`;
    renderPuntos(w);
  } else {
    const alive=game.assigned.filter(p=>p.vivo&&!p.isNar);
    const dead=game.assigned.filter(p=>!p.vivo&&!p.isNar);
    let html='<div class="win-in-progress">Partida en curso</div>';
    html+=`<div style="font-size:13px;color:var(--cream-d);margin-bottom:8px">🟢 Vivos (${alive.length}): ${alive.map(p=>esc(p.name)).join(', ')||'—'}</div>`;
    html+=`<div style="font-size:13px;color:var(--muted);margin-bottom:14px">💀 Muertos (${dead.length}): ${dead.map(p=>esc(p.name)).join(', ')||'—'}</div>`;
    const wolves=alive.filter(p=>Engine.isWolf(p));
    const vil=alive.filter(p=>!Engine.isWolf(p));
    html+=`<div style="font-size:12px;font-family:var(--disp);text-transform:uppercase;letter-spacing:.06em;color:var(--muted)">🐺 Lobos vivos: ${wolves.length} · 🏘️ Aldeanos vivos: ${vil.length}</div>`;
    body.innerHTML=html;
  }
  document.getElementById('finModal').classList.add('open');
}
/* ===== PUNTUACIÓN Y MARCADOR ===== */
function renderPuntos(w){
  const box=document.getElementById('puntosBox');if(!box)return;
  const rows=Engine.puntuar(game,w).sort((x,y)=>y.total-x.total||x.idx-y.idx);
  const nina=game.assigned.find(p=>p.roles.includes('nina')&&!p.isNar);
  let h='<h2 class="section" style="margin-top:14px">Puntuación</h2>';
  rows.forEach(r=>{
    const det=[r.equipo?'equipo '+r.equipo:'',r.superv?'superv. '+r.superv:'',r.poder?'poder '+(r.poder>0?'+':'')+r.poder:'',r.pareja?'pareja '+r.pareja:''].filter(Boolean).join(' · ')||'—';
    h+=`<div class="res-row"><div class="rnum">${r.total}</div><div class="rinfo"><div class="rpn">${esc(r.name)}</div><div class="rroles" style="font-size:11.5px;color:var(--muted)">${det}${r.detalle.length?'<br>'+r.detalle.map(esc).join('<br>'):''}</div></div>
      <button class="rnd" style="width:34px;height:34px;font-size:18px" onclick="ajustePuntos(${r.idx},-1)">−</button><button class="rnd" style="width:34px;height:34px;font-size:18px" onclick="ajustePuntos(${r.idx},1)">+</button></div>`;
  });
  if(nina)h+=`<button class="btn-toggle${game.ninaDenuncio?' on':''}" onclick="toggleNinaDenuncia()">👧 La Niña denunció a los lobos (+3)${game.ninaDenuncio?' ✓':''}</button>`;
  h+=`<button class="btn btn-dark btn-sm" ${game.sumado?'disabled':''} onclick="sumarMarcador()">${game.sumado?'✓ Sumado al marcador':'➕ Sumar al marcador'}</button>`;
  h+='<div class="hint">Puntos del libro: equipo 2, supervivencia según carta, poder según acciones, pareja 10. Los botones − y + corrigen cualquier caso dudoso.</div>';
  box.innerHTML=h;
}
function ajustePuntos(idx,d){if(!game.ajustes)game.ajustes={};game.ajustes[idx]=(game.ajustes[idx]||0)+d;renderPuntos(Engine.checkWin(game));if(window.Online)Online.sync();}
function toggleNinaDenuncia(){game.ninaDenuncio=!game.ninaDenuncio;renderPuntos(Engine.checkWin(game));if(window.Online)Online.sync();}
const KEY_MARCADOR='pueblo.marcador';
function leerMarcador(){try{const m=JSON.parse(localStorage.getItem(KEY_MARCADOR)||'null');if(m&&m.tot)return m;}catch(e){/* nada */}return{partidas:0,tot:{}};}
function sumarMarcador(){
  if(game.sumado)return;
  const w=Engine.checkWin(game);if(!w)return;
  const m=leerMarcador();m.partidas++;
  Engine.puntuar(game,w).forEach(r=>{m.tot[r.name]=(m.tot[r.name]||0)+r.total;});
  try{localStorage.setItem(KEY_MARCADOR,JSON.stringify(m));}catch(e){toast('No se pudo guardar el marcador');return;}
  game.sumado=true;renderPuntos(w);toast('Sumado al marcador');
}
function showMarcador(){
  const m=leerMarcador(),el=document.getElementById('marcadorBody');
  const filas=Object.keys(m.tot).sort((x,y)=>m.tot[y]-m.tot[x]);
  el.innerHTML=(filas.length?filas.map((n,i)=>`<div class="res-row"><div class="rnum">${i+1}</div><div class="rinfo"><div class="rpn">${esc(n)}</div></div><div style="font-family:var(--disp);font-size:20px;color:var(--gold)">${m.tot[n]}</div></div>`).join(''):'<div class="hint">Aún no hay partidas en el marcador. Al terminar una partida, pulsa «Sumar al marcador».</div>')
    +`<div class="hint" style="margin-top:10px">Partidas sumadas: ${m.partidas}. Se acumula por nombre de jugador.</div>`
    +(filas.length?'<button class="btn btn-ghost btn-sm" onclick="borrarMarcador()">Borrar el marcador</button>':'');
  document.getElementById('marcadorModal').classList.add('open');
}
function borrarMarcador(){if(confirm('¿Borrar todo el marcador?')){try{localStorage.removeItem(KEY_MARCADOR);}catch(e){/* nada */}showMarcador();}}
function closeFinModal(){document.getElementById('finModal').classList.remove('open');}

/* ===== MODE 1 ===== */
function renderGameInfo(){
  document.getElementById('g1Night').textContent=game.night;document.getElementById('g1Day').textContent=game.day;
  renderOrderList('orderBox1');renderDeathGrid();
}
function cycleStep(w){if(w==='night')Engine.startNight(game);else game.day++;document.getElementById('g1Night').textContent=game.night;document.getElementById('g1Day').textContent=game.day;if(window.Online)Online.sync();}
function renderDeathGrid(){renderMiniInto('deathGrid');}
function refreshGameUI(){
  renderMiniInto('deathGrid');renderMiniInto('playersMini');renderResults('resBox');
  if(window.Online)Online.sync();
}

/* ===== RESULTS ===== */
function openResults(from){game.resultsFrom=from;renderResults('resBox');show('scr-results');}
function backFromResults(){show(game.resultsFrom);if(game.resultsFrom==='scr-game')renderDeathGrid();else renderPlayersMini();}
function renderResults(boxId){
  const box=document.getElementById(boxId);if(!box)return;box.innerHTML='';
  game.assigned.forEach((p,i)=>{
    const row=document.createElement('div');row.className='res-row';let chips='';
    p.roles.forEach(rk=>{const c=C[rk];if(c)chips+=`<span class="chip ${c.t}">${c.em} ${c.n}</span>`;});
    if(p.insignia)chips+=`<span class="chip neutro">👮 Alguacil</span>`;
    if(p.robado)chips+=`<span class="chip rob">🃏 robado</span>`;
    if(p.lobo&&!p.roles.includes('lobo'))chips+=`<span class="chip lobo">🐺 convertido</span>`;
    if(p.amor)chips+=`<span class="chip love">💘 enamorado</span>`;
    if(p.modelo)chips+=`<span class="chip neutro">🎯 modelo</span>`;
    if(p.revived)chips+=`<span class="chip rev">✚ revivido</span>`;
    if(!p.vivo)chips+=`<span class="chip dead">💀 muerto</span>`;
    row.innerHTML=`<div class="rnum">${p.isNar?'📖':(i+1)}</div><div class="rinfo"><div class="rpn">${esc(p.name)}</div><div class="rroles">${chips}</div></div>`;
    box.appendChild(row);
  });
}

/* ===== ORDEN ===== */
function inPlay(rk){if(rk==='apaixonados')return cfg.optional['cupido'];return game.deck.includes(rk);}
function renderOrderList(boxId){
  const box=document.getElementById(boxId),steps=buildOrderRef();let html='',last='';
  steps.forEach(s=>{if(s.phase!==last){html+=`<div class="phase-tag">${s.phase}</div>`;last=s.phase;}
    html+=`<div class="order-item"><div class="oi-em">${s.em}</div><div class="oi-tx"><b>${s.title}</b><small>${s.text}</small></div></div>`;});
  box.innerHTML=html;
}
function buildOrderRef(){
  const s=[],add=(ph,k,em,t,tx)=>{if(k===null||inPlay(k))s.push({phase:ph,em,title:t,text:tx});};
  const P="Turno preliminar (1ª noche)",N="Turno normal (cada noche)";
  s.push({phase:P,em:"🌙",title:"El pueblo se duerme",text:"Todos cierran los ojos."});
  add(P,"ladron","💰","Ladrón","Ve las 2 cartas sobrantes y puede cambiar la suya.");
  add(P,"ninoSalvaje","🧒","Niño Salvaje","Levanta la mano y señala a su Modelo.");
  add(P,"jabali","🐗","Jabalí","Levanta la mano; el narrador anota su posición.");
  add(P,"nina","👧","Niña","Levanta la mano para ser reconocida.");
  add(P,"cupido","💘","Cupido","Señala a los dos enamorados.");
  add(P,"apaixonados","❤️","Enamorados","Se reconocen entre sí.");
  s.push({phase:N,em:"🐺",title:"La manada",text:"Los lobos despiertan y eligen víctima."});
  add(N,"loboAlfa","👑","Víctima del Alfa","Si dio señal, el narrador toca al maldito.");
  add(N,"loboRojo","🔴","Lobo Rojo","Hace una 2ª víctima a solas.");
  add(N,"loboJudas","🗡️","Lobo Judas","A solas puede matar a un lobo.");
  add(N,"bruja","🧙‍♀️","Bruja","Poción de vida y/o de muerte.");
  add(N,"vidente","🔮","Vidente","Conoce la identidad de un jugador.");
  add(N,"zorra","🦊","Zorra","Comprueba un trío de vecinos.");
  add(N,"policia","👮","Policía","Detiene y/o da inmunidad.");
  add(N,"inquisidor","⚖️","Inquisidor","Puede acusar a varios sospechosos.");
  add(N,"careto","🎭","Careto","Puede intercambiar dos cartas (una vez).");
  add(N,"medium","👻","Médium","Recibe una letra del último muerto (2ª noche+).");
  s.push({phase:N,em:"☀️",title:"El pueblo despierta",text:"Se anuncian las muertes."});
  s.push({phase:N,em:"💬",title:"Debate",text:"La aldea discute."});
  s.push({phase:N,em:"🗳️",title:"Votación",text:"Se lincha a un sospechoso."});
  s.push({phase:N,em:"🌙",title:"El pueblo se duerme",text:"Empieza un nuevo turno normal."});
  return s;
}

/* ===== STEPS GUIADO ===== */
function currentStepList(){return Flow.pasos(game,cfg);}
function renderStep(){
  game.steps=currentStepList();
  if(game.stepIdx>=game.steps.length)game.stepIdx=game.steps.length-1;
  if(game.stepIdx<0)game.stepIdx=0;
  const s=game.steps[game.stepIdx];
  document.getElementById('stPhase').textContent=s.phase==='prelim'?'Turno preliminar · 1ª noche':`Turno normal · Noche ${game.night} / Día ${game.day}`;
  document.getElementById('stEmoji').textContent=s.em;document.getElementById('stTitle').textContent=s.title;
  document.getElementById('stText').textContent=s.text;
  document.getElementById('stCount').textContent=`Paso ${game.stepIdx+1} de ${game.steps.length}`;
  document.getElementById('g2Night').textContent=game.night;document.getElementById('g2Day').textContent=game.day;
  const ex=document.getElementById('extraStepUI');ex.innerHTML='';
  if(s.action==='ladron'&&!game.ladronChosen){
    // Auto-abrir modal la primera vez que se llega a este paso
    if(!game.ladronModalShown){
      game.ladronModalShown=true;
      setTimeout(()=>{game.ladronCallback=null;showLadronModal();},350);
    }
    const btn=document.createElement('button');btn.className='btn btn-primary btn-sm';btn.style.marginTop='0';
    btn.textContent='💰 Ver cartas del Ladrón';btn.onclick=()=>{game.ladronCallback=null;showLadronModal();};ex.appendChild(btn);
  }else if(s.action==='ladron'&&game.ladronChosen){
    ex.innerHTML='<div style="font-size:13px;color:#8fc294;padding:6px 0">✓ Ladrón ya eligió su carta</div>';
  }
  if(s.action==='ladron_robado'){
    // Mostrar carta robada (Aldeano) al jugador robado — misma dinámica flip
    const robado=game.assigned.find(p=>p.robado);
    const nm=robado?robado.name:'jugador robado';
    ex.innerHTML=`<div style="text-align:center;margin-bottom:8px">
      <div class="player-turn">Pásale el teléfono a</div>
      <div class="player-name" style="font-size:22px;margin:2px 0 8px">${esc(nm)}</div>
    </div>`;
    const flipWrap=document.createElement('div');flipWrap.style.cssText='display:flex;justify-content:center;margin-bottom:10px;';
    const miniFlip=document.createElement('div');miniFlip.style.cssText='position:relative;width:180px;height:265px;transform-style:preserve-3d;transition:transform .6s cubic-bezier(.3,.7,.4,1);cursor:pointer;';
    let flippedR=false;
    const back=document.createElement('div');back.style.cssText='position:absolute;inset:0;backface-visibility:hidden;border-radius:14px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.5);background:var(--navy-dd);border:2px solid var(--copper);';
    const bimg=document.createElement('img');bimg.src=BACK;bimg.style.cssText='width:100%;height:100%;object-fit:contain;padding:6px;';
    bimg.onerror=()=>{back.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;font-size:40px">🌙</div>';};
    back.appendChild(bimg);
    const c=C['aldeano'];
    const front=document.createElement('div');front.style.cssText='position:absolute;inset:0;backface-visibility:hidden;transform:rotateY(180deg);border-radius:14px;overflow:hidden;border:2px solid var(--copper);display:flex;flex-direction:column;background:linear-gradient(170deg,#34507a,var(--navy-d));';
    const photo=document.createElement('div');photo.style.cssText='flex:1;display:flex;align-items:center;justify-content:center;background:var(--navy-dd);padding:6px;';
    const fimg=document.createElement('img');fimg.src=IMG+c.img[Math.floor(Math.random()*c.img.length)]+'.png';fimg.style.cssText='max-width:100%;max-height:100%;object-fit:contain;';
    fimg.onerror=()=>{photo.innerHTML='<div style="font-size:64px">🧑‍🌾</div>';};
    photo.appendChild(fimg);
    const meta=document.createElement('div');meta.style.cssText='padding:8px;background:rgba(0,0,0,.3);text-align:center;';
    meta.innerHTML=`<div style="font-family:var(--disp);font-weight:700;text-transform:uppercase;font-size:16px;color:var(--cream)">Aldeano</div><div style="font-size:10px;font-family:var(--disp);text-transform:uppercase;letter-spacing:.1em;color:#8fc294;margin-top:2px">Aldea · carta robada</div>`;
    front.appendChild(photo);front.appendChild(meta);
    miniFlip.appendChild(back);miniFlip.appendChild(front);
    miniFlip.onclick=()=>{flippedR=!flippedR;miniFlip.style.transform=flippedR?'rotateY(180deg)':'';};
    flipWrap.appendChild(miniFlip);ex.appendChild(flipWrap);
    const tapHint=document.createElement('div');tapHint.style.cssText='text-align:center;font-size:12px;color:var(--muted);margin-bottom:6px;font-family:var(--disp);text-transform:uppercase;letter-spacing:.1em;';
    tapHint.textContent='Toca la carta para verla';ex.appendChild(tapHint);
  }
  if(s.action==='careto'){
    const btn=document.createElement('button');btn.className='btn btn-primary btn-sm';btn.style.marginTop='0';
    btn.textContent='🎭 Registrar intercambio de cartas';btn.onclick=showCaretoModal;ex.appendChild(btn);
  }
  if(window.Online)Online.paso();
  renderActionUI(s,ex);
  actualizarBarraPendiente();
  updateLadronRobadoBtn();
  if(window.Online)Online.sync();
}
function nextStep(){
  if(fasePhones()&&game.accionAbierta&&Flow.pendientes(game).length&&game.accionAbierta!=='votacion'&&!confirm('Faltan por responder en sus móviles: '+Flow.pendientes(game).map(i=>game.assigned[i].name).join(', ')+'. ¿Continuar sin su respuesta?'))return;
  if(game.stepIdx>=game.steps.length-1){
    Engine.nextCycle(game);game.stepIdx=0;game.acts={};game.nightResolved=false;game.nightRep=null;renderStep();renderPlayersMini();toast('Noche '+game.night);return;
  }
  game.stepIdx++;renderStep();renderPlayersMini();
}
function prevStep(){if(game.stepIdx>0){game.stepIdx--;renderStep();renderPlayersMini();}}
function renderPlayersMini(){renderMiniInto('playersMini');}
function renderMiniInto(boxId){
  const box=document.getElementById(boxId);if(!box)return;box.innerHTML='';
  game.assigned.forEach((p,i)=>{
    if(p.isNar)return;
    const div=document.createElement('div');div.className='pm'+(p.vivo?'':' dead');
    let tags='';
    if(!p.vivo)tags+='<span class="tag muerto">muerto</span>';
    if(p.revived)tags+='<span class="tag rev">revivido</span>';
    if(p.insignia)tags+='<span class="tag insignia">👮</span>';
    if(p.lobo)tags+='<span class="tag lobo">lobo</span>';
    if(p.amor)tags+='<span class="tag amor">amor</span>';
    if(p.modelo)tags+='<span class="tag modelo">modelo</span>';
    if(p.inmune)tags+='<span class="tag inmune">inmune</span>';
    if(p.preso)tags+='<span class="tag preso">preso</span>';
    if(window.Online&&p.pid&&Online.offline(p.pid))tags+='<span class="tag">📴 sin conexión</span>';
    div.innerHTML=`<div class="pmn"><span class="pe">${i+1}</span>${esc(p.name)}</div><div class="pmtags">${tags}</div>`;
    div.onclick=()=>openSheet(i);box.appendChild(div);
  });
}


/* ===== ACCIONES DE LA NOCHE (modo guiado) ===== */
const ACTOR_DE={alfa:'loboAlfa',rojo:'loboRojo',judas:'loboJudas',bruja:'bruja',vidente:'vidente',zorra:'zorra',policia:'policia',inquisidor:'inquisidor',careto:'careto',medium:'medium',modelo:'ninoSalvaje',amor:'cupido'};
function infoBox(ex,html,cls){const d=document.createElement('div');d.className='info-box'+(cls?' '+cls:'');d.innerHTML=html;ex.appendChild(d);return d;}
function toggleBtn(ex,text,key,onChange){
  const b=document.createElement('button');b.className='btn-toggle'+(game.acts[key]?' on':'');b.textContent=text+(game.acts[key]?' ✓':'');
  b.onclick=()=>{game.acts[key]=!game.acts[key];if(onChange)onChange();renderStep();};
  ex.appendChild(b);
}
// Selector de objetivos: guarda el índice (o la lista, si multi) en game.acts[key].
function pickerUI(ex,o){
  const wrap=document.createElement('div');
  const lab=document.createElement('div');lab.className='pk-label';lab.textContent=o.label;wrap.appendChild(lab);
  const grid=document.createElement('div');grid.className='players-mini';wrap.appendChild(grid);
  const draw=()=>{
    grid.innerHTML='';const cur=game.acts[o.key];
    game.assigned.filter(p=>!p.isNar&&p.vivo&&(!o.filter||o.filter(p))).forEach(p=>{
      const sel=o.multi?(cur||[]).includes(p.idx):cur===p.idx;
      const d=document.createElement('div');d.className='pm'+(sel?' sel2':'');
      d.innerHTML=`<div class="pmn"><span class="pe">${p.idx+1}</span>${esc(p.name)}</div>`;
      d.onclick=()=>{
        if(o.multi){const a=(cur||[]).slice(),i=a.indexOf(p.idx);if(i>=0)a.splice(i,1);else if(a.length<o.multi)a.push(p.idx);game.acts[o.key]=a;}
        else game.acts[o.key]=(cur===p.idx)?null:p.idx;
        if(o.onChange)o.onChange(game.acts[o.key]);
        renderStep();
      };
      grid.appendChild(d);
    });
  };
  draw();ex.appendChild(wrap);
}
function nm(i){return i===null||i===undefined||!game.assigned[i]?'—':esc(game.assigned[i].name);}
function estadoMovil(ex){
  const pre=game.preguntados||[];if(!pre.length)return;
  const pend=Flow.pendientes(game),hecho=pre.filter(i=>!pend.includes(i));
  const nom=i=>esc(game.assigned[i].name)+(Online.offline(game.assigned[i].pid)?' 📴':'');
  infoBox(ex,'📱 En sus móviles — esperando: <b>'+(pend.length?pend.map(nom).join(', '):'nadie')+'</b>'+(hecho.length?' · ✓ ya han respondido: '+hecho.map(nom).join(', '):''),pend.length?'warn2':'ok');
  if(game.empateManada&&game.empateManada.length>1)infoBox(ex,'⚖️ Los lobos han empatado entre <b>'+game.empateManada.map(i=>i===null?'nadie':nm(i)).join(', ')+'</b>: elige tú la víctima abajo.','bad');
}
function renderActionUI(s,ex){
  const a=s.action;if(!a)return;
  if(fasePhones()&&game.accionAbierta===a)estadoMovil(ex);
  const role=ACTOR_DE[a];
  if(role&&a!=='modelo'&&a!=='amor'&&!Engine.actor(game,role)){
    infoBox(ex,'Este personaje no está vivo: haz como si lo despertaras, sin que decida nada.','warn2');return;
  }
  const notWolf=p=>!Engine.isWolf(p);
  if(a==='modelo'){
    const nino=Engine.actor(game,'ninoSalvaje');if(!nino)return;
    if(game.acts.modelo===undefined){const m=game.assigned.find(p=>p.modelo);game.acts.modelo=m?m.idx:null;}
    pickerUI(ex,{label:'Modelo del Niño Salvaje',key:'modelo',filter:p=>p.idx!==nino.idx,onChange:v=>{Engine.setModelo(game,nino.idx,v===null?-1:v);refreshGameUI();}});
  }else if(a==='amor'){
    if(game.acts.amor===undefined)game.acts.amor=game.assigned.filter(p=>p.amor).map(p=>p.idx);
    pickerUI(ex,{label:'Los dos enamorados (pueden ser Cupido o lobos)',key:'amor',multi:2,onChange:v=>{
      if(v.length===2)Engine.setEnamorados(game,v[0],v[1]);else game.assigned.forEach(p=>{p.amor=false;});refreshGameUI();}});
    infoBox(ex,'Se reconocen entre sí sin enseñar su carta.');
  }else if(a==='manada'){
    if(game.infected!==null&&game.infected!==undefined)
      infoBox(ex,`🐀 Lobo infectado por la Rata: <b>${nm(game.infected)}</b>. Tócale la cabeza antes de despertar a la manada: esta noche no participa y morirá.`,'bad');
    pickerUI(ex,{label:'Víctima de la manada (déjalo vacío si no se deciden)',key:'manada',filter:notWolf});
    if(Engine.alfaDisponible(game))toggleBtn(ex,'👑 El Alfa maldice a la víctima (no muere)','alfaCurse');
    if(game.ninaEspioNoche===game.night)infoBox(ex,'👧 La Niña ha espiado desde su móvil esta noche.'+(game.acts.ninaVista?' <b>Los lobos la han visto</b>: morirá en lugar de la víctima.':' No la han descubierto.'),game.acts.ninaVista?'bad':'');
    if(inPlay('nina')&&Engine.actor(game,'nina'))toggleBtn(ex,'👧 Los lobos han visto a la Niña (muere ella)','ninaVista');
  }else if(a==='alfa'){
    if(game.acts.alfaCurse&&game.acts.manada!==null&&game.acts.manada!==undefined&&Engine.alfaDisponible(game))
      infoBox(ex,`Toca la cabeza de <b>${nm(game.acts.manada)}</b>: no muere; desde ahora es Lobo en secreto.`,'ok');
    else infoBox(ex,'El Alfa no maldice esta noche: la víctima de la manada es devorada.');
  }else if(a==='rojo'){
    if(!Engine.rojoDisponible(game))infoBox(ex,'El Lobo Rojo ya no puede actuar (ha muerto algún lobo): haz como si lo despertaras.','warn2');
    else pickerUI(ex,{label:'Segunda víctima del Lobo Rojo',key:'rojo',filter:notWolf});
  }else if(a==='judas'){
    const j=Engine.actor(game,'loboJudas');
    pickerUI(ex,{label:'Lobo que elimina el Judas (opcional)',key:'judas',filter:p=>Engine.isWolf(p)&&p.idx!==j.idx});
  }else if(a==='bruja'){
    const vic=Engine.previewVictims(game,game.acts);
    infoBox(ex,vic.length?`Enséñale a: <b>${vic.map(v=>nm(v.idx)).join(', ')}</b>`:'Esta noche no hay ningún devorado.');
    if(!game.brujaVidaUsada&&vic.length){
      const lab=document.createElement('div');lab.className='pk-label';lab.textContent='Poción de vida (cura a…)';ex.appendChild(lab);
      const g=document.createElement('div');g.className='players-mini';
      vic.forEach(v=>{const d=document.createElement('div');d.className='pm'+(game.acts.brujaCura===v.idx?' sel2':'');d.innerHTML=`<div class="pmn"><span class="pe">${v.idx+1}</span>${nm(v.idx)}</div>`;
        d.onclick=()=>{game.acts.brujaCura=game.acts.brujaCura===v.idx?null:v.idx;renderStep();};g.appendChild(d);});
      ex.appendChild(g);
    }else infoBox(ex,game.brujaVidaUsada?'Poción de vida ya usada.':'Sin víctimas que curar.','warn2');
    if(!game.brujaMuerteUsada)pickerUI(ex,{label:'Poción de muerte (envenena a…)',key:'brujaVeneno'});
    else infoBox(ex,'Poción de muerte ya usada.','warn2');
  }else if(a==='vidente'){
    pickerUI(ex,{label:'Jugador que mira la Vidente',key:'vidente'});
    const v=game.acts.vidente;
    if(v!==null&&v!==undefined){const r=Engine.videnteVe(game,v);infoBox(ex,r==='lobo'?'👍 Pulgar arriba: es LOBO':'👎 Pulgar abajo: es ALDEANO',r==='lobo'?'bad':'ok');}
  }else if(a==='zorra'){
    if(game.zorraPerdida){infoBox(ex,'La Zorra ya perdió su poder: es una Aldeana.','warn2');return;}
    pickerUI(ex,{label:'Centro del trío (puede ser la propia Zorra)',key:'zorra'});
    const v=game.acts.zorra;
    if(v!==null&&v!==undefined){const h=Engine.zorraVe(game,v);infoBox(ex,h?'👍 Pulgar arriba: hay al menos un lobo':'👎 Pulgar abajo: ningún lobo. La Zorra pierde el poder',h?'bad':'ok');}
  }else if(a==='policia'){
    if(!game.policiaArrestoUsado)pickerUI(ex,{label:'Arrestar a… (pulgar abajo; no vota ni habla mañana)',key:'policiaArresta'});else infoBox(ex,'Arresto ya usado.','warn2');
    if(!game.policiaInmuneUsado)pickerUI(ex,{label:'Dar inmunidad a… (pulgar arriba; no puede ser votado mañana)',key:'policiaInmune'});else infoBox(ex,'Inmunidad ya usada.','warn2');
  }else if(a==='inquisidor'){
    const inq=Engine.actor(game,'inquisidor');
    if(inq.lobo){infoBox(ex,'El Inquisidor/Lobo no puede usar su poder.','warn2');return;}
    if(game.inquisidorUsado){infoBox(ex,'El Inquisidor ya usó su poder.','warn2');return;}
    const req=Engine.inquisidorObjetivos(game);
    infoBox(ex,`Debe señalar a <b>${req.n}</b> y acertar ${req.n===req.aciertos?'en todos':'al menos en '+req.aciertos}. Si falla, muere.`);
    pickerUI(ex,{label:`Sospechosos (${(game.acts.inquisidor||[]).length}/${req.n})`,key:'inquisidor',multi:req.n,filter:p=>p.idx!==inq.idx});
  }else if(a==='medium'){
    const l=game.lastLynched;
    infoBox(ex,l!==null&&l!==undefined?`El alma de <b>${nm(l)}</b> (linchado ayer) dibuja una letra.`:'Ayer no fue linchado nadie: el Médium no recibe nada.');
  }else if(a==='despierta'){
    if(!game.nightResolved){
      infoBox(ex,'Cuando hayas introducido todas las acciones de la noche, resuélvela.');
      const b=document.createElement('button');b.className='btn btn-primary btn-sm';b.style.marginTop='0';b.textContent='🌅 Resolver la noche y despertar a la aldea';
      b.onclick=()=>{
        const rep=Engine.resolveNight(game,game.acts);
        game.nightRep=rep;game.nightResolved=true;if(rep.info.careto)game.caretoUsedNight=game.night;
        if(game.online)rep.manana.forEach(t=>Flow.anunciar(game,t));
        renderStep();renderPlayersMini();afterAct();
      };
      ex.appendChild(b);
    }else{
      const r=game.nightRep;
      infoBox(ex,'<b>La aldea despierta con la noticia de que…</b><br>'+r.manana.map(esc).join('<br>'),'ok');
      if(r.info.maldito!==undefined)infoBox(ex,`🔒 Solo para ti: <b>${nm(r.info.maldito)}</b> es Lobo desde esta noche (no lo anuncies).`);
      if(r.info.inquisidor==='falla')infoBox(ex,'⚖️ El Inquisidor ha fallado y ha muerto.','bad');
      if(r.info.zorraPierde)infoBox(ex,'🦊 La Zorra no encontró lobos: pierde su poder.');
      if(game.infected!==null&&game.infected!==undefined)infoBox(ex,`🐀 La Rata ha muerto: <b>${nm(game.infected)}</b> queda infectado y morirá la próxima noche.`,'bad');
      r.avisos.forEach(m=>infoBox(ex,'ℹ️ '+esc(m),'warn2'));
    }
  }else if(a==='debate'){
    const pr=game.assigned.filter(p=>p.preso&&p.vivo).map(p=>esc(p.name)),im=game.assigned.filter(p=>p.inmune&&p.vivo).map(p=>esc(p.name));
    if(pr.length)infoBox(ex,'🚔 Arrestado (no vota ni habla): <b>'+pr.join(', ')+'</b>');
    if(im.length)infoBox(ex,'🛡️ Inmune (no puede ser votado): <b>'+im.join(', ')+'</b>');
    if(Engine.ventajaLobos(game))infoBox(ex,'⚠️ Hay tantos lobos como aldeanos: un empate favorece a los lobos.','warn2');
  }else if(a==='votacion'){
    const b=document.createElement('button');b.className='btn btn-primary btn-sm';b.style.marginTop='0';b.textContent='🗳️ Abrir la votación';b.onclick=showVoteModal;ex.appendChild(b);
    if(game.lastLynched!==null&&game.lastLynched!==undefined&&game.day===0)infoBox(ex,'Linchado hoy: <b>'+nm(game.lastLynched)+'</b>');
  }
}

/* ===== VOTACIÓN ===== */
function refreshVotoMovil(){
  if(!fasePhones()||!game.votosDia||!game.vote)return;
  const t=Flow.contarVotos(game);game.vote.counts=Object.assign({},t.counts);game.vote.alguacil=t.votoAlguacil;
  if(document.getElementById('voteModal').classList.contains('open'))renderVote();
}
function showVoteModal(){
  if(!game.vote)game.vote={counts:{},alguacil:null,solo:null};
  refreshVotoMovil();
  renderVote();document.getElementById('voteModal').classList.add('open');
}
function closeVoteModal(){document.getElementById('voteModal').classList.remove('open');}
function voteChange(idx,d){const v=game.vote;v.counts[idx]=Math.max(0,(v.counts[idx]||0)+d);renderVote();}
function renderVote(){
  const v=game.vote,body=document.getElementById('voteBody');body.innerHTML='';
  const alive=Engine.alivePlayers(game),candidatos=alive.filter(p=>!v.solo||v.solo.includes(p.idx));
  const presos=alive.filter(p=>p.preso).map(p=>esc(p.name)),inm=alive.filter(p=>p.inmune).map(p=>esc(p.name));
  const alg=alive.find(p=>p.insignia);
  let notas='';
  if(presos.length)notas+=`🚔 No vota: <b>${presos.join(', ')}</b><br>`;
  if(inm.length)notas+=`🛡️ No se puede votar a: <b>${inm.join(', ')}</b><br>`;
  const nino=alive.find(p=>p.roles.includes('ninoSalvaje')&&!p.lobo),mod=game.assigned.find(p=>p.modelo&&p.vivo);
  if(nino&&mod)notas+=`🧒 ${esc(nino.name)} no puede votar a ${esc(mod.name)}<br>`;
  if(v.solo)notas+='🔁 Segunda ronda: solo entre los empatados<br>';
  if(fasePhones()&&game.votosDia)notas+=`📱 Han votado <b>${Object.keys(game.votosDia).length}</b> de <b>${Object.keys(game.votosDia).length+Flow.pendientes(game).length}</b> desde sus móviles<br>`;
  if(notas)infoBox(body,notas);
  candidatos.forEach(p=>{
    const blocked=!Engine.puedeSerVotado(game,p.idx);
    const row=document.createElement('div');row.className='vote-row'+(blocked?' blocked':'');
    row.innerHTML=`<div class="vn">${p.idx+1}. ${esc(p.name)}${p.insignia?' 👮':''}${blocked?' 🛡️':''}</div>`;
    if(!blocked){
      const m=document.createElement('button');m.className='rnd';m.textContent='−';m.onclick=()=>voteChange(p.idx,-1);
      const c=document.createElement('div');c.className='vc';c.textContent=v.counts[p.idx]||0;
      const pl=document.createElement('button');pl.className='rnd';pl.textContent='+';pl.onclick=()=>voteChange(p.idx,1);
      row.append(m,c,pl);
    }
    body.appendChild(row);
  });
  if(alg&&!alg.preso){
    const lab=document.createElement('div');lab.className='pk-label';lab.textContent=`Voto doble de ${alg.name} (👮 cuenta una vez más): a…`;body.appendChild(lab);
    const sel=document.createElement('select');
    sel.innerHTML='<option value="">— no vota / ya contado —</option>'+candidatos.filter(p=>Engine.puedeSerVotado(game,p.idx)).map(p=>`<option value="${p.idx}"${v.alguacil===p.idx?' selected':''}>${esc(p.name)}</option>`).join('');
    sel.onchange=()=>{v.alguacil=sel.value===''?null:+sel.value;renderVote();};
    body.appendChild(sel);
  }
  const t=Engine.tally(game,v.counts,v.alguacil);
  const lines=Object.keys(t.totals).sort((a,b)=>t.totals[b]-t.totals[a]).map(k=>`${nm(+k)}: <b>${t.totals[k]}</b>`);
  const res=document.createElement('div');res.className='vote-res';res.innerHTML=lines.length?lines.join(' · '):'Aún no hay votos.';body.appendChild(res);
  const mk=(txt,cls,fn)=>{const b=document.createElement('button');b.className='btn '+cls;b.textContent=txt;b.onclick=fn;body.appendChild(b);};
  if(t.ganador!==null)mk(`☠️ Linchar a ${game.assigned[t.ganador].name}`,'btn-primary',()=>doLynch(t.ganador));
  else if(t.empate){
    if(t.desempata!==null){
      infoBox(body,`Empate. <b>${esc(game.assigned[t.desempata].name)}</b> (Insignia) decide a quién eliminar:`,'warn2');
      t.top.forEach(i=>mk(`☠️ Linchar a ${game.assigned[i].name}`,'btn-primary btn-sm',()=>doLynch(i)));
    }else{
      infoBox(body,'Empate y no hay Insignia: se vota de nuevo entre los empatados. Si persiste, nadie es eliminado.','warn2');
      mk('🔁 Votar de nuevo entre los empatados','btn-dark btn-sm',()=>{game.vote={counts:{},alguacil:null,solo:t.top};renderVote();});
    }
  }
  mk('Nadie es eliminado','btn-ghost btn-sm',()=>{closeVoteModal();game.vote=null;toast('Hoy no se elimina a nadie');});
}
function doLynch(idx){
  closeVoteModal();
  const h=Engine.herederaElegible(game,idx);
  if(h&&fasePhones()){ // la Heredera decide en su móvil; el narrador puede saltarlo
    game.lynchPendiente=idx;Flow.abrirHeredera(game,idx);game.preguntados=[h.idx];
    Online.sync(true);actualizarBarraPendiente();toast('Esperando a la Heredera…');return;
  }
  const ev=[];
  if(h&&confirm(`¿${h.name} (Heredera) quiere quedarse con la carta de ${game.assigned[idx].name}?`))ev.push(...Engine.heredar(game,idx));
  finalizarLinchamiento(idx,ev);
}
function finalizarLinchamiento(idx,ev){
  const target=game.assigned[idx];
  ev.push(...Engine.lynch(game,idx));
  game.vote=null;game.lynchPendiente=null;
  afterAct();renderPlayersMini();
  if(cfg.mode===2&&document.getElementById('scr-guided').classList.contains('active'))renderStep();
  toast(`☠️ ${target.name} es linchado`+(ev.length?' · '+ev[ev.length-1]:''));
  if(game.online&&window.Online)Flow.anunciar(game,'☠️ '+target.name+' ha sido linchado');
}
function continuarLinchamiento(){
  const idx=game.lynchPendiente;if(idx===null||idx===undefined)return;
  game.lynchPendiente=null;game.prompts={};game.accionAbierta=null;
  finalizarLinchamiento(idx,[]);actualizarBarraPendiente();
}
function saltarHeredera(){continuarLinchamiento();}

/* ===== ACTION SHEET ===== */
function openSheet(i){
  game.sheetTarget=i;const p=game.assigned[i];
  document.getElementById('sheetName').textContent=p.name;
  let st=[];if(!p.vivo)st.push('muerto');if(p.revived)st.push('revivido');if(p.insignia)st.push('alguacil');if(p.lobo)st.push('lobo');if(p.amor)st.push('enamorado');if(p.modelo)st.push('modelo');if(p.inmune)st.push('inmune');if(p.preso)st.push('preso');
  document.getElementById('sheetSub').textContent=st.length?'Estado: '+st.join(', '):'Sin marcas';
  ['saNoche','saVoto'].forEach(id=>document.getElementById(id).style.display=p.vivo?'':'none');
  document.getElementById('saRev').style.display=p.vivo?'none':'';
  document.getElementById('sheetBg').classList.add('open');
}
function closeSheet(){document.getElementById('sheetBg').classList.remove('open');}
function closeSheetBg(e){if(e.target.id==='sheetBg')closeSheet();}
function act(what){
  const p=game.assigned[game.sheetTarget];let ev=[];
  if(what==='noche'||what==='voto')ev=Engine.kill(game,p.idx,what);
  else if(what==='revivir')ev=Engine.revive(game,p.idx);
  else p[what]=!p[what];
  closeSheet();afterAct();
  if(ev.length)toast(ev[ev.length-1]);
}

/* ===== NAV / UTIL ===== */
function show(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById(id).classList.add('active');window.scrollTo(0,0);if(typeof guardarEstado==='function')guardarEstado();}
function confirmHome(){
  if(window.Online&&Online.activo()&&Online.esAnfitrion()){if(Online.partidaEnCurso()&&confirm('¿Volver a la sala? Se perderá la partida actual (los jugadores siguen conectados).'))Online.alLobby();return;}
  if(confirm('¿Volver al inicio? Se perderá la partida actual.'))show('scr-config');
}
function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2200);}
function openResults(from){game.resultsFrom=from;renderResults('resBox');show('scr-results');}
function backFromResults(){show(game.resultsFrom);if(game.resultsFrom==='scr-game')renderDeathGrid();else renderPlayersMini();}

/* ===== REGLAS ===== */
function openRules(){buildRules();document.getElementById('rulesModal').classList.add('open');}
function closeRules(){document.getElementById('rulesModal').classList.remove('open');}
function buildRules(){
  const el=document.getElementById('rulesContent');
  const cl=ks=>ks.map(k=>{const c=C[k];const dbl=DOUBLE.has(k)?'<span class="dbl">🎴×2</span>':'';return `<div class="rule-char"><div class="rce">${c.em}</div><div><div class="rcn">${c.n}${dbl}</div><div class="rcd">${RD[k]||c.d}</div></div></div>`;}).join('');
  el.innerHTML=`
  <div class="rule-block"><h3>📜 La historia</h3><p>Talasnal, Serra da Lousã, 1911. El terror reina: cada mañana aparece un cuerpo en la Eira. Los aldeanos deben descubrir y eliminar a los lobos ocultos antes de que sea demasiado tarde.</p></div>
  <div class="rule-block"><h3>🎯 Objetivos</h3><p><b>Aldeanos:</b> eliminar a todos los lobos.<br><b>Lobos:</b> eliminar a todos los aldeanos.<br><b>Lobo Judas:</b> ser el único superviviente.<br><b>Enamorados:</b> quedar solo los dos.<br><b>Borracho:</b> que le linchen en la 1ª votación.<br><b>Niño Salvaje:</b> llegar vivo al final.</p></div>
  <div class="rule-block"><h3>📖 Narrador</h3>${cl(['narrador'])}</div>
  <div class="rule-block"><h3>🐺 Lobos</h3>${cl(['lobo','loboAlfa','loboJudas','loboRojo'])}<p style="margin-top:8px">Recomendados: 2 (5–11 jug.) · 3 (12–16) · 4 (17–20) · 5 (21–25).</p></div>
  <div class="rule-block"><h3>🧑‍🌾 Aldeanos</h3>${cl(['aldeano','vidente','borracho','bruja','cazador','careto','cupido','heredera','inquisidor','jabali','ladron','medium','nina','ninoSalvaje','policia','zorra','rata'])}</div>
  <div class="rule-block"><h3>👮 Alguacil/Insignia</h3>${cl(['insignia'])}<p style="margin-top:8px">Aleatorio: se asigna al inicio. Por votación: el narrador lo asigna en cualquier momento del debate.</p></div>
  <div class="rule-block"><h3>🎴×2 Cartas dobles</h3><p>Un jugador puede tener dos cartas cuando: tiene la <b>Insignia</b>; es maldecido por el <b>Lobo Alfa</b>; el <b>Niño Salvaje</b> se convierte; la <b>Heredera</b> hereda; el <b>Ladrón</b> cambia su carta; el <b>Careto</b> intercambia la suya.</p></div>
  <div class="rule-block"><h3>💘 Enamorados</h3><p>Si muere uno, el otro muere de pena al instante. Pueden votar a su amado. Si son Aldeano+Lobo, su objetivo cambia: vencer juntos eliminando a todos los demás.</p></div>
  <div class="rule-block"><h3>🗳️ Votación y empates</h3><p>El más votado es linchado y muestra su carta. La Insignia vale 2 votos y decide empates. <b>Empate técnico</b> (mismos lobos que aldeanos) = victoria de los lobos.</p></div>
  <div class="rule-block"><h3>🌙 Orden de la noche</h3>
    <p><b>Turno preliminar (solo 1ª noche):</b> Ladrón · Niño Salvaje · Jabalí · Niña · Cupido · Enamorados.</p>
    <p><b>Turno normal (cada noche):</b> Manada · Víctima del Alfa · Lobo Rojo · Lobo Judas · Bruja · Vidente · Zorra · Policía · Inquisidor · Careto · Médium · El pueblo despierta · Debate · Votación · El pueblo duerme.</p>
    <p>Personajes que solo se anotan (Niña, Jabalí) <b>levantan la mano</b> sin abrir los ojos. La Insignia/Alguacil no tiene turno propio: se entrega cuando el narrador lo considere oportuno.</p></div>
  <div class="rule-block"><h3>⚙️ Combinaciones recomendadas</h3><p>• Lobo Alfa + Niño Salvaje: mín. 12 jug.<br>• Lobo Rojo: mín. 15 jug.<br>• Jabalí + Zorra juntos: mín. 17 jug.<br>• Bruja + Policía juntos: mín. 15-16 jug.<br>• Vidente + Niña: puede ser redundante.</p></div>`;
}

/* ===== INIT ===== */
function init(){
  const lg=document.getElementById('brandLogo');
  lg.src=LOGO;lg.onerror=()=>{lg.outerHTML='<span style="font-size:40px;display:block;text-align:center;margin-bottom:10px">🌙</span>';};
  document.getElementById('numPlayers').textContent=cfg.players;
  document.getElementById('numWolves').textContent=cfg.wolves;
  document.getElementById('recWolves').textContent=recWolvesFor(cfg.players);
  renderNarratorOptions();
  if(!cfg.narratorEnabled)cfg.narrator='none'; // renderNarratorOptions no conoce «sin narrador»
  aplicarCfgUI();
}
// Pinta en la pantalla de configuración todo lo que hay en cfg (al arrancar, al restaurar y al salir del online).
function aplicarCfgUI(){
  document.getElementById('numPlayers').textContent=cfg.players;
  document.getElementById('numWolves').textContent=cfg.wolves;
  document.getElementById('recWolves').textContent=recWolvesFor(cfg.players);
  renderNarratorOptions();
  const b=document.getElementById('narToggle'),s=document.getElementById('narratorSel');
  if(cfg.narratorEnabled){b.classList.remove('off');b.textContent='Narrador activado · pulsa para jugar sin narrador';s.disabled=false;}
  else{b.classList.add('off');b.textContent='SIN narrador · pulsa para activarlo';s.disabled=true;s.value='random';cfg.narrator='none';}
  aplicarOpcionesUI();
  const nr=document.getElementById('btnNinaRemota');nr.classList.toggle('on',!!cfg.ninaRemota);nr.textContent='👧 Niña a distancia · '+(cfg.ninaRemota?'ACTIVADO':'desactivado');
  renderNames();renderRoles();syncWolfWarn();checkRoleCapacity();
}

/* ===== PERSISTENCIA: configuración y partida local sobreviven a recargar o reabrir la app ===== */
const KEY_ESTADO='pueblo.estado.v1';
const ESTADO_V=2;                 // súbelo si cambia la forma de `game` o `cfg`: se descarta lo guardado con otra versión
const PANTALLAS_PARTIDA=['scr-reveal','scr-game','scr-guided','scr-results'];
let ultimoGuardado='';
function guardarEstado(){
  try{
    const scr=(document.querySelector('.screen.active')||{}).id||'scr-config';
    const enPartida=!!(game&&game.assigned&&game.assigned.length)&&PANTALLAS_PARTIDA.includes(scr)&&!game.online; // la partida online la recupera online.js
    const core=JSON.stringify({cfg,scr:enPartida?scr:'scr-config',game:enPartida?game:null});
    if(core===ultimoGuardado)return;
    ultimoGuardado=core;
    localStorage.setItem(KEY_ESTADO,'{"v":'+ESTADO_V+',"t":'+Date.now()+','+core.slice(1));
  }catch(e){/* sin almacenamiento o lleno: la app sigue funcionando */}
}
function leerEstadoGuardado(){
  try{
    const sv=JSON.parse(localStorage.getItem(KEY_ESTADO)||'null');
    if(!sv||sv.v!==ESTADO_V||!sv.cfg||Date.now()-(sv.t||0)>30*24*3600*1000)return null;
    return sv;
  }catch(e){return null;}
}
function restaurarPartidaLocal(sv){
  game=sv.game;
  game.ladronCallback=null;game.revealList=Engine.revealList(game);
  if(game.reveal){game.reveal.busy=false;game.reveal.flipped=false;}
  ultimoGuardado='';
  showAlguacilBtns();
  if(game.winner)showWinBanner(game.winner);
  if(sv.scr==='scr-reveal'){show('scr-reveal');renderReveal();}
  else if(sv.scr==='scr-guided'){show('scr-guided');renderStep();renderPlayersMini();}
  else if(sv.scr==='scr-results'){show('scr-results');renderResults('resBox');}
  else{show('scr-game');renderGameInfo();if(cfg.mode===1&&cfg.optional['ladron']&&!game.ladronChosen)showLadronModal();}
  drainPending(); // un disparo del Cazador o un sucesor de la Insignia pendientes vuelven a abrirse
  toast('Partida recuperada');
}
(function arrancar(){
  const sv=leerEstadoGuardado();
  if(sv)Object.assign(cfg,sv.cfg);
  init();
  if(sv&&sv.game&&sv.game.assigned&&sv.game.assigned.length&&PANTALLAS_PARTIDA.includes(sv.scr))restaurarPartidaLocal(sv);
  setInterval(guardarEstado,1500);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')guardarEstado();});
  window.addEventListener('pagehide',guardarEstado);
})();


/* ===== PWA: instalación y service worker ===== */
let eventoInstalar=null;
const esStandalone=()=>(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
function actualizarBotonInstalar(){
  const b=document.getElementById('btnInstalar'),h=document.getElementById('hintIOS');if(!b||!h)return;
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  b.style.display=(!esStandalone()&&eventoInstalar)?'block':'none';
  h.style.display=(!esStandalone()&&ios&&!eventoInstalar)?'block':'none';
}
function instalarApp(){
  if(!eventoInstalar)return;
  eventoInstalar.prompt();
  eventoInstalar.userChoice.finally(()=>{eventoInstalar=null;actualizarBotonInstalar();});
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();eventoInstalar=e;actualizarBotonInstalar();});
window.addEventListener('appinstalled',()=>{eventoInstalar=null;actualizarBotonInstalar();toast('App instalada');});
actualizarBotonInstalar();
if('serviceWorker' in navigator&&location.protocol.startsWith('http')){
  const teniaControl=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(teniaControl)toast('Nueva versión descargada: se verá al volver a abrir la app');});
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(e=>console.warn('sw:',e&&e.message)));
}
