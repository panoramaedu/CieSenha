/* ================================================================
   CiêSenha — lógica do jogo
   As palavras vêm de words.json (carregado no início).
   ================================================================ */

let STAGES=[];
const CAT_EMOJI={
  "Física":"⚛️",
  "Química":"🧪",
  "Biologia":"🧬",
  "Astronomia":"🔭",
  "Geologia":"🌋",
  "Saúde":"💉",
  "Paleontologia":"🦕",
  "Corpo Humano":"🧠",
  "Animais":"🐾",
  "Alimentos":"🍎",
  "Plantas":"🌱",
  "Natureza":"🌦️",
  "Sentidos":"👁️",
  "Cores":"🎨",
  "Cotidiano":"🏠",
  "Transporte":"🚗",
  "Música":"🎵",
  "Esporte":"⚽",
  "Sentimentos":"❤️"
};

async function loadWords(){
  const res=await fetch('words.json');
  if(!res.ok)throw new Error('HTTP '+res.status);
  const data=await res.json();
  STAGES=[
    {id:'fund1',label:'Fund 1',full:'Ensino Fundamental I (1º ao 5º ano)',emoji:'🌱',list:data.fund1},
    {id:'fund2',label:'Fund 2',full:'Ensino Fundamental II (6º ao 9º ano)',emoji:'🔬',list:data.fund2},
    {id:'medio',label:'Médio',full:'Ensino Médio',emoji:'🎓',list:data.medio}
  ];
}

/* ================= utilidades ================= */
const $=id=>document.getElementById(id);
const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const esc=s=>String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const todayKey=()=>{const d=new Date();return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();};
const yesterdayKey=()=>{const d=new Date(Date.now()-864e5);return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();};
const LAUNCH=Date.UTC(2026,7,1);
const dayIndex=Math.max(0,Math.floor((Date.now()-LAUNCH)/86400000));
const expNum=()=>String(dayIndex+1).padStart(4,'0');
const triesFor=len=>Math.min(len<=5?6:len+1,9);
const STATS='ciesenha.stats.v1',
      ACT_SAVE='ciesenha.act.v1', TEACHER_LIST='ciesenha.prof.v1', NOME_KEY='ciesenha.nome';
const SAVE_KEY=()=>'ciesenha.daily.'+stage+'.v1';

const toB64u=s=>{const b=new TextEncoder().encode(s);let r='';for(let i=0;i<b.length;i+=0x8000)r+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return btoa(r).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const fromB64u=u=>{const s=atob(u.replace(/-/g,'+').replace(/_/g,'/'));const b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i);return new TextDecoder().decode(b);};

/* ================= estado ================= */
let stage=localStorage.getItem('ciesenha.stage')||'';
let mode='daily',cur=null,targetN='',rowIdx=0,maxTries=6,curRow=0,history=[],over=false,won=false,locked=false;
let actData=null,actIndex=0,actResults=[],gameToken=0,gameBuilt=false;
const board=$('board'),kb=$('kb');
const keyEls={};
const stageDef=()=>STAGES.find(s=>s.id===stage)||STAGES[1];
const stageWord=()=>{const def=stageDef();return def.list[dayIndex%def.list.length];};

/* ================= tabuleiro ================= */
function newGame(entry,m){
  cur=entry;mode=m;targetN=norm(entry.w);gameToken++;gameBuilt=true;
  maxTries=triesFor(targetN.length);rowIdx=0;curRow=0;history=[];over=false;won=false;locked=false;
  buildBoard();buildKB();renderSubbar();renderStageTabs();
}
function buildBoard(){
  board.innerHTML='';
  const len=targetN.length;
  const base=len<=4?62:len===5?58:len===6?52:len===7?47:len===8?42:len<=9?38:len===10?35:32;
  const avail=Math.min(window.innerWidth-32,560);
  const size=Math.min(base,Math.floor((avail-(len-1)*6)/len));
  board.style.setProperty('--ts',size+'px');
  board.style.setProperty('--cols',len);
  for(let r=0;r<maxTries;r++){
    const row=document.createElement('div');row.className='brow';
    for(let c=0;c<len;c++){const t=document.createElement('div');t.className='tile';row.appendChild(t);}
    board.appendChild(row);
  }
}
const tileAt=(r,c)=>board.children[r].children[c];

/* ================= teclado ================= */
const ROWS=[['q','w','e','r','t','y','u','i','o','p'],['a','s','d','f','g','h','j','k','l'],['enter','z','x','c','v','b','n','m','back']];
function buildKB(){
  kb.innerHTML='';
  for(const k in keyEls)delete keyEls[k];
  ROWS.forEach(row=>{
    const r=document.createElement('div');r.className='krow';
    row.forEach(k=>{
      const b=document.createElement('button');b.className='key'+((k==='enter'||k==='back')?' wide':'');
      b.innerHTML=k==='back'?'⌫':k==='enter'?'OK':k;
      b.addEventListener('click',()=>{press(k);b.classList.add('hit');setTimeout(()=>b.classList.remove('hit'),120);});
      keyEls[k]=b;r.appendChild(b);
    });
    kb.appendChild(r);
  });
}
function updateKey(l,state){
  const el=keyEls[l];if(!el)return;
  const rank={absent:1,present:2,correct:3};
  const old=['absent','present','correct'].find(c=>el.classList.contains(c));
  if(!old||rank[state]>rank[old]){el.classList.remove('absent','present','correct');el.classList.add(state);}
}

/* ================= lógica ================= */
function evalGuess(g){
  const res=Array(g.length).fill('absent'),rem=[];
  for(let i=0;i<g.length;i++){
    if(g[i]===targetN[i])res[i]='correct';else rem.push(targetN[i]);
  }
  for(let i=0;i<g.length;i++){
    if(res[i]!=='correct'){const j=rem.indexOf(g[i]);if(j>-1){res[i]='present';rem.splice(j,1);}}
  }
  return res;
}
function press(k){
  if(locked||over)return;
  if(k==='back'){if(curRow>0){curRow--;const t=tileAt(rowIdx,curRow);t.textContent='';t.classList.remove('filled');}return;}
  if(k==='enter'){submit();return;}
  if(curRow<targetN.length){
    const t=tileAt(rowIdx,curRow);
    t.textContent=k;t.classList.remove('pop');void t.offsetWidth;t.classList.add('filled');
    curRow++;
  }
}
function submit(){
  if(curRow<targetN.length){
    const row=board.children[rowIdx];
    row.classList.remove('shake');void row.offsetWidth;row.classList.add('shake');
    toast('Letras insuficientes 🔍');return;
  }
  let guess='';for(let i=0;i<targetN.length;i++)guess+=tileAt(rowIdx,i).textContent;
  locked=true;revealGuess(guess,true);
}
function revealGuess(guess,animate){
  const states=evalGuess(guess);
  states.forEach((s,i)=>{
    const tile=tileAt(rowIdx,i);
    const set=()=>{tile.classList.add(s);updateKey(guess[i],s);};
    if(animate){setTimeout(()=>{tile.classList.add('flip');setTimeout(set,230);},i*230);}
    else set();
  });
  rowIdx++;
  const wait=animate?guess.length*230+340:0;
  setTimeout(()=>afterReveal(guess,states,!animate),wait);
}
function afterReveal(guess,states,quiet){
  history.push(guess);locked=false;
  if(guess===targetN){finishGame(true,{silent:quiet});return;}
  if(rowIdx===maxTries){finishGame(false,{silent:quiet});return;}
  curRow=0;
  if(!quiet&&mode==='daily')saveProgress();
}
function finishGame(win,opt={}){
  over=true;won=win;
  if(mode==='daily'){
    updateStats(win,history.length);
    localStorage.setItem(SAVE_KEY(),JSON.stringify({k:todayKey(),g:history}));
  }
  if(mode==='activity'){
    actResults.push({w:cur.w,tries:history.length,win});
    saveActProgress();
  }
  if(win){
    for(let i=0;i<targetN.length;i++){
      const t=tileAt(rowIdx-1,i);
      setTimeout(()=>t.classList.add('dance'),i*80);
    }
    if(!opt.silent)burst();
  }else if(!opt.silent){
    toast('A resposta era '+cur.w+' 🔬');
  }
  renderSubbar();
  if(!opt.silent){const tk=gameToken;setTimeout(()=>{if(tk===gameToken)openResult();},win?1050:1500);}
}

/* ================= etapas ================= */
function renderStageTabs(){
  const box=$('stages');
  if(mode==='activity'){box.style.display='none';return;}
  box.style.display='';
  box.innerHTML='';
  STAGES.forEach(s=>{
    const b=document.createElement('button');
    b.className='stage'+(s.id===stage?' on':'');
    b.textContent=s.emoji+' '+s.label;
    b.title=s.full;
    b.setAttribute('aria-pressed',s.id===stage);
    b.onclick=()=>switchStage(s.id);
    box.appendChild(b);
  });
}
function switchStage(id){
  if(mode==='activity'||id===stage)return;
  if(locked)return toast('Aguarde a revelação terminar ⏳');
  stage=id;localStorage.setItem('ciesenha.stage',id);
  closeModal($('mResult'));closeModal($('mStats'));
  newGame(stageWord(),'daily');
  restore();
}

/* ================= efeitos ================= */
function burst(){
  const r=board.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
  const colors=['#2fe6a6','#ffc24b','#58d5e0','#eaf6f5'];
  for(let i=0;i<30;i++){
    const p=document.createElement('span');p.className='particle';
    const s=5+Math.random()*7;
    p.style.cssText=`width:${s}px;height:${s}px;background:${colors[i%4]}`;
    document.body.appendChild(p);
    const a=Math.random()*Math.PI*2,d=90+Math.random()*200;
    p.animate(
      [{transform:`translate(${cx}px,${cy}px)`,opacity:1},
       {transform:`translate(${cx+Math.cos(a)*d}px,${cy+Math.sin(a)*d+60}px) rotate(${Math.random()*360}deg)`,opacity:0}],
      {duration:750+Math.random()*450,easing:'cubic-bezier(.15,.8,.4,1)'}
    ).onfinish=()=>p.remove();
  }
}
let toastT;
function toast(msg){
  const t=$('toast');t.textContent=msg;t.classList.add('show');
  clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),2200);
}

/* ================= persistência ================= */
function getStats(){try{const s=JSON.parse(localStorage.getItem(STATS));if(s&&s.d)return s;}catch(e){}return{p:0,w:0,s:0,b:0,d:{},lastWin:''};}
function updateStats(win,tries){
  const s=getStats();s.p++;
  if(win){
    s.w++;s.d[tries]=(s.d[tries]||0)+1;
    const today=todayKey();
    if(s.lastWin!==today){
      s.s=(s.lastWin===yesterdayKey())?s.s+1:1;
      s.b=Math.max(s.b,s.s);
      s.lastWin=today;
    }
  }
  localStorage.setItem(STATS,JSON.stringify(s));
}
function saveProgress(){localStorage.setItem(SAVE_KEY(),JSON.stringify({k:todayKey(),g:history}));}

/* ================= subbar ================= */
function renderSubbar(){
  const sb=$('subbar');const date=new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
  if(mode==='activity'){
    if(over){
      sb.innerHTML=`<div class="chips">
        <span class="chip accent">📚 ${esc(actData.t)}</span>
        <span class="chip done">✅ Atividade concluída</span></div>
        <button class="linkbtn" id="bRep2">📊 ver relatório</button>`;
      $('bRep2').onclick=openReport;
    }else{
      sb.innerHTML=`<div class="chips">
        <span class="chip accent">📚 ${esc(actData.t)}</span>
        ${actData.p?`<span class="chip">🎓 ${esc(actData.p)}</span>`:''}
        <span class="chip">Palavra ${actIndex+1}/${actData.w.length}</span></div>
        <button class="linkbtn" id="bExitAct">✕ sair</button>`;
      $('bExitAct').onclick=exitAct;
    }
    return;
  }
  const def=stageDef();
  if(over){
    sb.innerHTML=`<div class="chips">
      <span class="chip done">✅ ${won?'Decifrado em '+history.length+'/'+maxTries:'Não foi dessa vez'}</span>
      <span class="chip">${CAT_EMOJI[cur.c]||'🔬'} ${cur.c}</span></div>
      <button class="linkbtn" id="bReplay">↻ rever ficha do conceito</button>`;
    $('bReplay').onclick=openResult;
  }else if(mode==='daily'){
    sb.innerHTML=`<div class="chips">
      <span class="chip accent">${def.emoji} ${def.label} · Experimento #${expNum()}</span>
      <span class="chip">📅 ${date}</span>
      <span class="chip">${CAT_EMOJI[cur.c]||'🔬'} ${cur.c}</span></div>
      <button class="linkbtn" id="bFree">modo livre 🎲</button>`;
    $('bFree').onclick=startFree;
  }else{
    sb.innerHTML=`<div class="chips">
      <span class="chip accent">🎲 Modo livre · ${def.label}</span>
      <span class="chip">${CAT_EMOJI[cur.c]||'🔬'} ${cur.c}</span></div>
      <button class="linkbtn" id="bDaily">← voltar ao desafio do dia</button>`;
    $('bDaily').onclick=()=>{newGame(stageWord(),'daily');restore();};
  }
}

/* ================= modais ================= */
function openModal(id){$(id).classList.add('open');}
function closeModal(m){m.classList.remove('open');}
document.querySelectorAll('.overlay').forEach(o=>{
  const locked=o.classList.contains('locked');
  o.addEventListener('click',e=>{if(e.target===o&&!locked)closeModal(o);});
  o.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeModal(o));
});
const anyModalOpen=()=>!!document.querySelector('.overlay.open');

function openResult(){
  $('rTitle').innerHTML=won?'Experimento <span>concluído!</span>':'Experimento <span>revelado</span>';
  $('rMeta').textContent=won
    ?`Você decifrou em ${history.length}/${maxTries} tentativas. Agora, o que isso significa?`
    :`A palavra era essa — e vale aprender mesmo assim:`;
  $('rChip').textContent=(CAT_EMOJI[cur.c]||'🔬')+' '+cur.c;
  $('rWord').textContent=cur.w;
  $('rDesc').textContent=cur.d;
  $('rFact').textContent=' '+cur.t;
  const isAct=mode==='activity';
  $('bShare').style.display=isAct?'none':'';
  const last=isAct&&actIndex>=actData.w.length-1;
  $('bNext').textContent=isAct?(last?'Ver relatório 📊':'Próxima palavra →'):'🎲 Nova palavra';
  $('bNext').onclick=isAct?(last?()=>{closeModal($('mResult'));openReport();}:nextActWord):startFree;
  openModal('mResult');
}
function openStats(){
  const s=getStats();
  $('stP').textContent=s.p;
  $('stW').textContent=s.p?Math.round(s.w/s.p*100):0;
  $('stS').textContent=s.s;
  $('stB').textContent=s.b;
  const max=Math.max(1,...Object.values(s.d));
  $('dist').innerHTML=Array.from({length:8},(_,i)=>{
    const n=i+1,v=s.d[n]||0,w=Math.round(v/max*100);
    return `<div class="drow"><span>${n}</span><div class="dbar${n===history.length&&won&&mode==='daily'?' hot':''}" style="width:${v?Math.max(w,8):3}%"></div><span>${v}</span></div>`;
  }).join('');
  openModal('mStats');
}

/* ================= compartilhar ================= */
$('bShare').onclick=()=>{
  const rows=history.map(g=>evalGuess(g).map(s=>s==='correct'?'🟩':s==='present'?'🟨':'⬛').join(''));
  const head=`CiêSenha · ${stageDef().label} #${expNum()} ${CAT_EMOJI[cur.c]||'🔬'}`;
  const res=won?`Acertei em ${history.length}/${maxTries}`:`Não foi dessa vez (${history.length}/${maxTries})`;
  copyText([head,res,...rows,'jogue você também!'].join('\n'));
};
function copyText(t){
  const fb=()=>{const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');toast('Copiado! Espalhe ciência 🧪');}catch(e){toast('Não consegui copiar 😕');}ta.remove();};
  if(navigator.clipboard)navigator.clipboard.writeText(t).then(()=>toast('Copiado! Espalhe ciência 🧪'),fb);else fb();
}
$('bStats').onclick=openStats;
$('bHelp').onclick=()=>$('mHelp').classList.add('open');

/* ================= modo livre ================= */
function startFree(){
  closeModal($('mResult'));
  const list=stageDef().list;
  let e;do{e=list[Math.floor(Math.random()*list.length)];}
  while(list.length>1&&norm(e.w)===norm(stageWord().w));
  newGame(e,'free');
  toast('Modo livre: não conta nas estatísticas 🎲');
}

/* ================= atividades (Modo Professor) ================= */
function activityLink(a){return location.href.split('#')[0]+'#atividade='+toB64u(JSON.stringify(a));}
function actHash(){return toB64u(JSON.stringify({t:actData.t,w:actData.w.map(x=>x.w)})).slice(0,32);}

function parseActivity(){
  const m=location.hash.match(/atividade=([A-Za-z0-9\-_]+)/);
  if(!m)return null;
  try{
    const a=JSON.parse(fromB64u(m[1]));
    if(!a||!Array.isArray(a.w)||!a.w.length||!a.t)throw 0;
    a.t=String(a.t).slice(0,60);a.p=String(a.p||'').slice(0,40);
    a.w=a.w.slice(0,12).map(x=>({
      w:String(x.w||'').trim().toUpperCase().slice(0,14),
      c:String(x.c||'').slice(0,24),
      d:String(x.d||'').slice(0,500),
      t:String(x.t||'').slice(0,300)
    })).filter(x=>x.w.length>=3&&/^[A-ZÀ-ÖØ-Þ]+$/.test(x.w));
    if(!a.w.length)throw 0;
    return a;
  }catch(e){toast('Link de atividade inválido 😕');return null;}
}
function startActivity(a){
  actData=a;actIndex=0;actResults=[];
  let sv=null;try{sv=JSON.parse(localStorage.getItem(ACT_SAVE));}catch(e){}
  if(sv&&sv.h===actHash()&&Array.isArray(sv.r)){
    actResults=sv.r.filter(r=>r&&r.w);
    actIndex=Math.min(actResults.length,a.w.length);
  }
  $('nmTitle').textContent=a.t;
  $('nmProf').textContent=a.p?('Professor(a): '+a.p):'Atividade criada no Modo Professor';
  $('nmNome').value=localStorage.getItem(NOME_KEY)||'';
  openModal('mName');
}
function saveActProgress(){
  try{localStorage.setItem(ACT_SAVE,JSON.stringify({h:actHash(),r:actResults}));}catch(e){}
}
function exitAct(){location.hash='';location.reload();}
$('nmExit').onclick=exitAct;
$('nmGo').onclick=()=>{
  localStorage.setItem(NOME_KEY,$('nmNome').value.trim().slice(0,40));
  closeModal($('mName'));
  if(actIndex>=actData.w.length){renderSubbar();openReport();}
  else{const resumed=actIndex>0;playActWord();if(resumed)toast('Progresso recuperado 📚');}
};
function playActWord(){
  const e=actData.w[actIndex];
  newGame({w:e.w,c:e.c||'Conceito',d:e.d,t:e.t||''},'activity');
}
function nextActWord(){actIndex++;closeModal($('mResult'));playActWord();}

function reportText(){
  const nm=(localStorage.getItem(NOME_KEY)||'').trim();
  const L=['🧪 CiêSenha — Relatório da atividade'];
  L.push('📚 '+actData.t+(actData.p?(' — '+actData.p):''));
  L.push('👤 '+(nm||'Aluno(a) sem nome'));
  L.push('📅 '+new Date().toLocaleDateString('pt-BR'));
  L.push('');
  actData.w.forEach((e,i)=>{
    const r=actResults[i];
    if(!r)return L.push(`⬜ ${i+1}. ${e.w} — não jogada`);
    L.push(`${r.win?'🟩':'🟥'} ${i+1}. ${e.w} — ${r.win?('acertou em '+r.tries+'/'+triesFor(norm(e.w).length)):'não acertou ('+r.tries+' tentativas)'}`);
  });
  const wins=actResults.filter(r=>r&&r.win).length;
  L.push('');L.push(`Acertos: ${wins}/${actData.w.length}`);
  return L.join('\n');
}
function openReport(){
  $('repText').textContent=reportText();
  openModal('mReport');
}
$('repCopy').onclick=()=>copyText(reportText());
$('repWa').onclick=()=>window.open('https://api.whatsapp.com/send?text='+encodeURIComponent(reportText()),'_blank');

/* ---- painel do professor ---- */
function pfAddEntry(){
  if(document.querySelectorAll('.pf-item').length>=12)return toast('Máximo de 12 palavras por atividade');
  const d=document.createElement('div');d.className='pf-item';
  d.innerHTML=`<button class="pf-del" title="Remover palavra">✕</button>
    <div class="pf-row">
      <input class="finput pf-w" placeholder="Palavra * (3–14 letras)" maxlength="14">
      <input class="finput pf-c" placeholder="Categoria (opcional)" maxlength="24">
    </div>
    <textarea class="farea pf-d" placeholder="Explicação do conceito * (aparece para o aluno ao final)" maxlength="500"></textarea>
    <input class="finput pf-t" placeholder="Curiosidade (opcional)" maxlength="300">`;
  d.querySelector('.pf-del').onclick=()=>d.remove();
  $('pfList').appendChild(d);
}
$('pfAdd').onclick=pfAddEntry;
$('pfGen').onclick=()=>{
  const t=$('pfTitulo').value.trim();
  if(t.length<3)return toast('Dê um título à atividade 📚');
  const items=[...document.querySelectorAll('.pf-item')];
  const ws=[],errs=[];
  items.forEach((it,i)=>{
    const w=it.querySelector('.pf-w').value.trim();
    const c=it.querySelector('.pf-c').value.trim();
    const d=it.querySelector('.pf-d').value.trim();
    const f=it.querySelector('.pf-t').value.trim();
    if(!w&&!d)return;
    if(!/^[A-Za-zÀ-ÖØ-öø-ÿ]{3,14}$/.test(w))return errs.push(`palavra ${i+1}: use uma única palavra, de 3 a 14 letras`);
    if(d.length<10)return errs.push(`"${w}": escreva a explicação do conceito`);
    if(ws.some(x=>norm(x.w)===norm(w)))return errs.push(`"${w}" está repetida`);
    ws.push({w:w.toUpperCase(),c:c,d:d,t:f});
  });
  if(errs.length)return toast('⚠️ '+errs[0]);
  if(!ws.length)return toast('Adicione ao menos uma palavra');
  const a={v:1,t:t,p:$('pfProf').value.trim(),w:ws};
  const link=activityLink(a);
  if(link.length>4000)toast('Atividade grande: o link ficou longo, mas funciona ✅');
  $('pfLink').value=link;$('pfOut').hidden=false;
  $('pfOut').scrollIntoView({behavior:'smooth',block:'nearest'});
  saveTeacherActivity(a);
};
$('pfCopy').onclick=()=>copyText($('pfLink').value);
$('pfWa').onclick=()=>window.open('https://api.whatsapp.com/send?text='+encodeURIComponent('Atividade no CiêSenha 🧪 — é só abrir o link: '+$('pfLink').value),'_blank');

function saveTeacherActivity(a){
  let list=[];try{list=JSON.parse(localStorage.getItem(TEACHER_LIST))||[];}catch(e){}
  list=list.filter(it=>it.a.t!==a.t);
  list.unshift({a,date:Date.now()});
  list=list.slice(0,8);
  try{localStorage.setItem(TEACHER_LIST,JSON.stringify(list));}catch(e){toast('Não consegui salvar a atividade (o link ainda funciona)');}
  renderSaved();
}
function renderSaved(){
  const box=$('pfSavedList');
  let list=[];try{list=JSON.parse(localStorage.getItem(TEACHER_LIST))||[];}catch(e){}
  box.innerHTML='';
  if(!list.length){box.innerHTML='<p style="font-size:.78rem;color:var(--muted)">Nenhuma atividade salva ainda.</p>';return;}
  list.forEach((it,idx)=>{
    const row=document.createElement('div');row.className='saved-row';
    row.innerHTML=`<span class="t">📚 ${esc(it.a.t)} · ${it.a.w.length} palavra(s)</span>`;
    const b1=document.createElement('button');b1.textContent='🔗 copiar link';
    const b2=document.createElement('button');b2.textContent='▶ abrir';
    const b3=document.createElement('button');b3.textContent='✕';
    b1.onclick=()=>copyText(activityLink(it.a));
    b2.onclick=()=>{closeModal($('mProf'));location.hash='atividade='+toB64u(JSON.stringify(it.a));startActivity(it.a);};
    b3.onclick=()=>{list.splice(idx,1);localStorage.setItem(TEACHER_LIST,JSON.stringify(list));renderSaved();};
    row.append(b1,b2,b3);box.appendChild(row);
  });
}
function openProf(){
  if(!gameBuilt){toast('Escolha uma etapa primeiro 🌱');return;}
  if(!$('pfList').children.length)pfAddEntry();
  renderSaved();
  openModal('mProf');
}
$('bProf').onclick=openProf;
$('fProf').onclick=openProf;

/* ================= teclado físico ================= */
document.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(anyModalOpen()){
    if(e.key==='Escape')document.querySelectorAll('.overlay.open:not(.locked)').forEach(closeModal);
    return;
  }
  if(e.key==='Enter'){e.preventDefault();press('enter');}
  else if(e.key==='Backspace')press('back');
  else{const k=e.key.toLowerCase();if(/^[a-z]$/.test(k))press(k);}
});
window.addEventListener('resize',()=>{if(!history.length&&gameBuilt)buildBoard();});

/* ================= restauração ================= */
function restore(){
  if(mode!=='daily')return;
  let sv=null;try{sv=JSON.parse(localStorage.getItem(SAVE_KEY()));}catch(e){}
  if(!sv||sv.k!==todayKey()||!sv.g||!sv.g.length)return;
  for(const g of sv.g){
    for(let i=0;i<g.length;i++){const t=tileAt(rowIdx,i);t.textContent=g[i];t.classList.add('filled');}
    revealGuess(g,false);
  }
  if(!over)toast('Bem-vindo de volta! Desafio em andamento 🔬');
}

/* ================= inicialização ================= */
async function init(){
  try{
    await loadWords();
  }catch(e){
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="position:fixed;inset:0;display:grid;place-items:center;background:#07171d;color:#eaf6f5;font-family:sans-serif;text-align:center;padding:24px;z-index:999">'+
      '<div><p style="font-size:1.2rem;margin-bottom:12px">🧪 Não consegui carregar as palavras.</p>'+
      '<p style="color:#7fa6b0;font-size:.9rem">Se estiver testando no computador, rode um servidor local (ex.: <code>npx serve</code> ou Live Server). No GitHub Pages funciona direto.</p></div></div>');
    return;
  }

  /* 1) Link de atividade do professor tem prioridade absoluta */
  const actInit=parseActivity();
  if(actInit){
    startActivity(actInit);
    return;
  }

  /* 2) Ler etapa da query string (?stage=...) ou do localStorage */
  const qStage=(new URLSearchParams(location.search)).get('stage');
  if(qStage && STAGES.some(s=>s.id===qStage)){
    stage=qStage;
    localStorage.setItem('ciesenha.stage',qStage);
  }else if(!stage || !STAGES.some(s=>s.id===stage)){
    /* sem stage válido: voltar para a tela inicial */
    location.href='index.html';
    return;
  }

  /* 3) Iniciar o jogo do dia */
  newGame(stageWord(),'daily');
  restore();

  /* 4) Primeira visita: mostrar ajuda */
  if(!localStorage.getItem('ciesenha.seen')){
    localStorage.setItem('ciesenha.seen','1');
    openModal('mHelp');
  }
}
init();