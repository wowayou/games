'use strict';
/* ================================================================
   棋阵塔 / Tower of Chess  —  roguelike 自走棋
   零依赖 Canvas 2D + 原生 JS
   ================================================================ */

/* ========== 1. 数据定义 ========== */
const FAC = {
  fire:  { c:'#ff6b4a', n:'火', icon:'🔥' },
  water: { c:'#4a9eff', n:'水', icon:'💧' },
  earth: { c:'#6bcb77', n:'土', icon:'🪨' },
  wind:  { c:'#5ce6d8', n:'风', icon:'🌪️' },
  light: { c:'#ffd84a', n:'光', icon:'✨' },
};
const ROLE = {
  tank:    { n:'坦', icon:'🛡️', shape:'shield' },
  mage:    { n:'法', icon:'🔮', shape:'diamond' },
  archer:  { n:'射', icon:'🏹', shape:'diamond' },
  healer:  { n:'奶', icon:'💚', shape:'circle' },
  assassin:{ n:'刺', icon:'🗡️', shape:'star' },
};

const TEMPLATES = [
  { id:'flame-mage', name:'焰法师', fac:'fire', role:'mage',
    hp:72, atk:16, rng:2, spd:1.0, cost:2,
    skill:{type:'burn',val:5,dur:2,desc:'攻击附加燃烧'} },
  { id:'ember-guard', name:'烬卫', fac:'fire', role:'tank',
    hp:150, atk:9, rng:1, spd:0.8, cost:2,
    skill:{type:'thorns',val:6,dur:0,desc:'受击反弹'} },
  { id:'blaze-archer', name:'烈焰弓手', fac:'fire', role:'archer',
    hp:62, atk:17, rng:3, spd:1.1, cost:2,
    skill:{type:'burn',val:4,dur:2,desc:'箭矢附加燃烧'} },
  { id:'tide-healer', name:'潮汐医者', fac:'water', role:'healer',
    hp:82, atk:7, rng:2, spd:0.9, cost:3,
    skill:{type:'heal',val:16,dur:0,desc:'每3tick治疗最低血友军'} },
  { id:'frost-archer', name:'霜射手', fac:'water', role:'archer',
    hp:64, atk:18, rng:3, spd:1.1, cost:2,
    skill:{type:'slow',val:0.5,dur:2,desc:'攻击减速'} },
  { id:'stone-bulwark', name:'磐岩壁垒', fac:'earth', role:'tank',
    hp:190, atk:7, rng:1, spd:0.7, cost:3,
    skill:{type:'shield',val:35,dur:0,desc:'开战获得护盾'} },
  { id:'thorn-warden', name:'荆棘守卫', fac:'earth', role:'tank',
    hp:130, atk:11, rng:1, spd:0.85, cost:2,
    skill:{type:'thorns',val:8,dur:0,desc:'高额反伤'} },
  { id:'gale-assassin', name:'疾风刺客', fac:'wind', role:'assassin',
    hp:58, atk:24, rng:1, spd:1.4, cost:3,
    skill:{type:'crit',val:2.0,dur:0,desc:'35%暴击2倍'} },
  { id:'storm-mage', name:'雷暴法师', fac:'wind', role:'mage',
    hp:70, atk:13, rng:2, spd:1.0, cost:2,
    skill:{type:'chain',val:7,dur:0,desc:'攻击溅射相邻敌人'} },
  { id:'light-paladin', name:'圣光骑士', fac:'light', role:'tank',
    hp:135, atk:12, rng:1, spd:0.9, cost:3,
    skill:{type:'lifesteal',val:0.3,dur:0,desc:'攻击吸血30%'} },
  { id:'dawn-healer', name:'晨光牧师', fac:'light', role:'healer',
    hp:78, atk:8, rng:2, spd:0.95, cost:2,
    skill:{type:'heal',val:12,dur:0,desc:'每3tick治疗'} },
];
const TPL = Object.fromEntries(TEMPLATES.map(t=>[t.id,t]));

const SYNS = [
  {fac:'fire', cnt:2, desc:'火系2:攻击+20%', eff:{atkMul:1.2}},
  {fac:'fire', cnt:3, desc:'火系3:燃烧翻倍', eff:{burnX2:true}},
  {fac:'water',cnt:2, desc:'水系2:每5tick回血8%', eff:{regen:true}},
  {fac:'earth',cnt:2, desc:'土系2:护甲+15%', eff:{defMul:0.15}},
  {fac:'wind', cnt:2, desc:'风系2:攻速+25%', eff:{spdMul:1.25}},
  {fac:'wind', cnt:3, desc:'风系3:15%连击', eff:{combo:true}},
  {fac:'light',cnt:2, desc:'光系2:吸血+10%', eff:{vamp:0.10}},
];

/* ========== 2. 游戏状态 ========== */
const G = {
  state:'menu', floor:1, maxFloor:10, gold:10, hp:20, maxHp:20,
  board:new Array(6).fill(null), bench:[], shop:[], enemy:[],
  battle:null, tutor:'auto', selectedBench:-1, selectedCell:-1,
  log:[], syns:[], seed:0x12345678, rng:null,
  animFrame:0, // 用于呼吸光效
};
function makeRng(s){return function(){s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
G.rng = makeRng(G.seed);
const rnd=(n)=>Math.floor(G.rng()*n);
const pick=(a)=>a[rnd(a.length)];
const chance=(p)=>G.rng()<p;

/* ========== 3. 棋子工厂 ========== */
function starMul(s){return [1,1.8,3.0][s-1]||1}
function makePiece(tid,star=1){
  const t=TPL[tid]; if(!t) return null;
  const m=starMul(star);
  return {tid,name:t.name,fac:t.fac,role:t.role,star,
    maxHp:Math.round(t.hp*m), hp:Math.round(t.hp*m),
    atk:Math.round(t.atk*m), rng:t.rng, spd:t.spd, cost:t.cost,
    skill:{...t.skill},
    x:-1,y:-1, bx:0,by:0, // 战场坐标
    alive:true, cd:0, target:null, shield:0, burn:0, burnDmg:0, slow:0,
    hitFlash:0, // 受击闪烁
  };
}

/* ========== 4. 商店 ========== */
function rollShop(){
  G.shop=[];
  for(let i=0;i<5;i++) G.shop.push({tid:pick(TEMPLATES).id, sold:false});
  renderShop();
}
function reroll(){
  if(G.gold<1){ tutorSay('金币不够刷新'); return; }
  G.gold--; rollShop(); updateHUD();
}
function buyPiece(i){
  if(G.state!=='recruit') return;
  const card=G.shop[i]; if(!card||card.sold) return;
  const t=TPL[card.tid]; if(G.gold<t.cost){ tutorSay('金币不够'); return; }
  if(G.bench.length+G.board.filter(Boolean).length>=9){ tutorSay('阵容满了'); return; }
  G.gold-=t.cost; card.sold=true;
  const p=makePiece(card.tid,1); G.bench.push(p);
  tryMerge(p); updateHUD(); renderShop(); renderBoard(); renderBench();
  if(G.tutor==='auto'&&G.floor<=3) tutorRecruitAdvice(p);
}
function tryMerge(np){
  const same=G.bench.filter(p=>p&&p.tid===np.tid&&p.star===np.star);
  if(same.length>=3){
    const rm=[]; for(let i=G.bench.length-1;i>=0&&rm.length<2;i--){
      if(G.bench[i]!==np&&G.bench[i].tid===np.tid&&G.bench[i].star===np.star) rm.push(i);
    }
    rm.forEach(i=>G.bench.splice(i,1));
    np.star++; const m=starMul(np.star); const t=TPL[np.tid];
    np.maxHp=Math.round(t.hp*m); np.hp=np.maxHp; np.atk=Math.round(t.atk*m);
    tutorSay(`✨ ${np.name} 升到 ${np.star}★！`);
  }
}

/* ========== 5. 布阵 ========== */
function placeFromBench(benchIdx,slot){
  if(G.state!=='recruit') return;
  const p=G.bench[benchIdx]; if(!p) return;
  if(G.board[slot]){ G.bench[benchIdx]=G.board[slot]; G.board[slot].x=-1; G.board[slot].y=-1; }
  else G.bench.splice(benchIdx,1);
  G.board[slot]=p; p.x=slot%3; p.y=Math.floor(slot/3);
  G.selectedBench=-1; G.selectedCell=-1; renderBoard(); renderBench();
}
function removeFromBoard(slot){
  if(G.state!=='recruit') return;
  const p=G.board[slot]; if(!p) return;
  G.board[slot]=null; G.bench.push(p); p.x=-1; p.y=-1;
  G.selectedBench=G.bench.length-1; renderBoard(); renderBench();
}

/* ========== 6. AI导师 ========== */
const TUT={
  intro:'欢迎来到棋阵塔！前3层我来带你打：自动招募、自动布阵、自动开战。你观察学习即可，随时按 T 接管。',
  win:(f)=>`第${f}层通关！金币+奖励，HP+2。`,
  lose:'这层输了，HP-3。别灰心，前几层重在熟悉机制。',
  handoff:'前3层你已看过完整流程。从这层开始由你操作，按 T 可随时呼叫我给建议。',
};
let tutTimer=null;
function tutorSay(txt){
  const el=document.getElementById('tutor-panel');
  document.getElementById('tutor-text').textContent=txt;
  el.classList.remove('hidden');
  if(tutTimer) clearTimeout(tutTimer);
  tutTimer=setTimeout(()=>el.classList.add('hidden'),7000);
}
function tutorRecruitAdvice(p){
  const reasons={
    'flame-mage':'焰法师：远程输出+燃烧，打肉盾好用',
    'ember-guard':'烬卫：前排坦克+反伤，保护后排',
    'blaze-archer':'烈焰弓手：远程高伤+燃烧',
    'tide-healer':'潮汐医者：治疗续航',
    'frost-archer':'霜射手：远程+减速，克制刺客',
    'stone-bulwark':'磐岩壁垒：超肉前排，自带护盾',
    'thorn-warden':'荆棘守卫：中排反伤坦克',
    'gale-assassin':'疾风刺客：高暴击切后排',
    'storm-mage':'雷暴法师：溅射打密集阵容',
    'light-paladin':'圣光骑士：能抗能吸血',
    'dawn-healer':'晨光牧师：低成本治疗',
  };
  tutorSay('我招了'+p.name+'：'+(reasons[p.tid]||''));
}
function tutorAutoPlay(){
  if(G.tutor!=='auto'||G.floor>3||G.state!=='recruit') return;
  const advice=analyzeEnemy(G.enemy);
  const teamSz=()=>G.board.filter(Boolean).length+G.bench.length;
  for(let i=0;i<G.shop.length;i++){
    const c=G.shop[i]; if(c.sold) continue;
    const t=TPL[c.tid]; if(G.gold<t.cost) continue;
    if(teamSz()<3||shouldBuy(t,advice)) buyPiece(i);
  }
  autoArrange();
  if(teamSz()<3&&G.gold>=1){ reroll(); setTimeout(tutorAutoPlay,600); return; }
  // 自动开战
  if(G.board.filter(Boolean).length>=1){
    setTimeout(()=>{ if(G.state==='recruit'&&G.tutor==='auto'&&G.floor<=3) startBattle(); }, 1000);
  }
}
function analyzeEnemy(en){
  const r={phys:0,magic:0,healer:false,tank:false,n:en.length};
  for(const p of en){ if(p.role==='healer') r.healer=true; if(p.role==='tank') r.tank=true; if(p.role==='mage') r.magic++; else r.phys++; }
  return r;
}
function shouldBuy(t,advice){
  const all=[...G.board.filter(Boolean),...G.bench];
  const facs={}; for(const p of all) facs[p.fac]=(facs[p.fac]||0)+1;
  for(const f in facs){ if(t.fac===f&&facs[f]<3) return true; }
  if(advice.healer&&t.role==='assassin') return true;
  if(advice.phys>=2&&t.role==='tank') return true;
  if(all.length<3) return true;
  return false;
}
function autoArrange(){
  const bench=[...G.bench]; G.bench=[];
  for(const p of bench){
    let placed=false;
    if(p.role==='tank'){ for(let s=0;s<3;s++){ if(!G.board[s]){G.board[s]=p;p.x=s%3;p.y=0;placed=true;break;} } }
    if(!placed){ for(let s=3;s<6;s++){ if(!G.board[s]){G.board[s]=p;p.x=s%3;p.y=1;placed=true;break;} } }
    if(!placed){ for(let s=0;s<6;s++){ if(!G.board[s]){G.board[s]=p;p.x=s%3;p.y=Math.floor(s/3);placed=true;break;} } }
    if(!placed) G.bench.push(p);
  }
  renderBoard(); renderBench();
}

/* ========== 7. 敌人生成 ========== */
function genEnemy(floor){
  const boss=floor%3===0;
  const cnt=boss?4:Math.min(3+Math.floor(floor/2),6);
  const en=[];
  const starBoost=floor>=7?2:(floor>=4?1:0);
  const mul=1+floor*0.08;
  if(boss){
    const b=makePiece('stone-bulwark',3); b.name='塔之守卫';
    b.maxHp=Math.round(b.maxHp*1.8); b.hp=b.maxHp; b.atk=Math.round(b.atk*1.4);
    en.push(b);
    for(let i=1;i<cnt;i++){ const e=makePiece(pick(TEMPLATES).id,Math.min(2,1+starBoost)); scaleE(e,mul); en.push(e); }
  } else {
    for(let i=0;i<cnt;i++){
      const star=Math.min(3,1+(chance(0.3+floor*0.05)?1:0)+starBoost);
      const e=makePiece(pick(TEMPLATES).id,star); scaleE(e,mul); en.push(e);
    }
  }
  return en;
}
function scaleE(p,m){ p.maxHp=Math.round(p.maxHp*m); p.hp=p.maxHp; p.atk=Math.round(p.atk*m); }

/* ========== 8. 战场坐标 ========== */
const CV={W:680,H:300,cellW:60,cellH:60,ox:20,oy:40,gap:4};
// 9列x2行，玩家在左0-2列，敌人在右6-8列
function slotToXY(x,y,isEnemy){
  const col=isEnemy?(8-x):x;
  return { x:CV.ox+col*(CV.cellW+CV.gap)+CV.cellW/2, y:CV.oy+y*(CV.cellH+CV.gap)+CV.cellH/2 };
}

/* ========== 9. 战斗 ========== */
const TICK=380; // ms per tick
let battleTimer=null;

function startBattle(){
  const pieces=G.board.filter(Boolean);
  if(!pieces.length){ tutorSay('场上没有棋子！从商店招募或按T让我帮你。'); return; }
  G.state='battle';
  const combatants=[];
  for(const p of pieces){
    const t=TPL[p.tid]; const m=starMul(p.star);
    p.maxHp=Math.round(t.hp*m); p.hp=p.maxHp; p.atk=Math.round(t.atk*m); p.spd=t.spd;
    const w=slotToXY(p.x,p.y,false); p.bx=w.x; p.by=w.y;
    p.alive=true; p.cd=0; p.target=null; p.shield=0; p.burn=0; p.slow=0; p.hitFlash=0;
    if(p.skill.type==='shield') p.shield=p.skill.val*p.star;
    combatants.push({piece:p,side:'player'});
  }
  for(let i=0;i<G.enemy.length;i++){
    const p=G.enemy[i]; p.x=i%3; p.y=Math.floor(i/3);
    const w=slotToXY(p.x,p.y,true); p.bx=w.x; p.by=w.y;
    p.alive=true; p.cd=0; p.target=null; p.shield=0; p.burn=0; p.slow=0; p.hitFlash=0;
    if(p.skill.type==='shield') p.shield=p.skill.val*p.star;
    combatants.push({piece:p,side:'enemy'});
  }
  G.battle={combatants,tick:0,over:false,winner:null,fx:[],floats:[]};
  applySynergies(combatants);
  if(G.tutor!=='off') tutorSay('开战！棋子会自动行动，观察它们的站位和技能。');
  document.getElementById('fight-btn').classList.add('hidden');
  battleLoop();
}
function applySynergies(combatants){
  const myPieces=combatants.filter(c=>c.side==='player').map(c=>c.piece);
  const facs={}; for(const p of myPieces) facs[p.fac]=(facs[p.fac]||0)+1;
  G.syns=[];
  for(const s of SYNS){ if((facs[s.fac]||0)>=s.count){ G.syns.push(s); for(const p of myPieces){
    if(s.eff.atkMul) p.atk=Math.round(p.atk*s.eff.atkMul);
    if(s.eff.spdMul) p.spd*=s.eff.spdMul;
    if(s.eff.defMul) p.shield=(p.shield||0)+Math.round(p.maxHp*s.eff.defMul);
  }}}
  renderSynergy();
}
function battleLoop(){
  if(!G.battle||G.battle.over) return;
  simTick(); drawBattle();
  if(G.battle.over){ onBattleEnd(); return; }
  battleTimer=setTimeout(battleLoop,TICK);
}
function simTick(){
  G.battle.tick++;
  const living=G.battle.combatants.filter(c=>c.piece.alive);
  living.sort((a,b)=>b.piece.spd-a.piece.spd);
  for(const c of living){ if(c.piece.alive) takeAction(c); }
  // 持续效果
  for(const c of G.battle.combatants){
    const p=c.piece; if(!p.alive) continue;
    if(p.burn>0){ p.hp-=p.burnDmg; p.burn--; p.hitFlash=8; addFloat(p,'-'+p.burnDmg,'#ff6b4a'); if(p.hp<=0){p.alive=false;addLog(p.name+'被烧死');} }
    if(p.slow>0) p.slow--;
    if(p.hitFlash>0) p.hitFlash--;
  }
  // 水系回血
  if(G.battle.tick%5===0&&G.syns.find(s=>s.eff.regen)){
    for(const c of G.battle.combatants){ if(c.side==='player'&&c.piece.alive){ const h=Math.round(c.piece.maxHp*0.08); c.piece.hp=Math.min(c.piece.maxHp,c.piece.hp+h); addFloat(c.piece,'+'+h,'#4a9eff'); } }
    addLog('水系羁绊回血');
  }
  // 胜负
  const pa=G.battle.combatants.some(c=>c.side==='player'&&c.piece.alive);
  const ea=G.battle.combatants.some(c=>c.side==='enemy'&&c.piece.alive);
  if(!pa||!ea){ G.battle.over=true; G.battle.winner=pa?'player':'enemy'; }
}
function takeAction(c){
  const p=c.piece;
  const foes=G.battle.combatants.filter(o=>o.side!==c.side&&o.piece.alive);
  if(!foes.length) return;
  let tgt=null,md=Infinity;
  for(const f of foes){ const d=Math.hypot(p.bx-f.piece.bx,p.by-f.piece.by); if(d<md){md=d;tgt=f;} }
  p.target=tgt;
  const range=p.rng*CV.cellW*0.8;
  if(md<=range){ attack(p,tgt.piece,c.side); }
  else {
    const dx=tgt.piece.bx-p.bx, dy=tgt.piece.by-p.by;
    const d=Math.hypot(dx,dy)||1;
    const mv=CV.cellW*0.35*p.spd*(p.slow>0?0.5:1);
    p.bx+=(dx/d)*mv; p.by+=(dy/d)*mv;
  }
  // 治疗
  if(p.skill.type==='heal'&&G.battle.tick%3===0){
    const allies=G.battle.combatants.filter(o=>o.side===c.side&&o.piece.alive&&o.piece!==p);
    if(allies.length){
      allies.sort((a,b)=>(a.piece.hp/a.piece.maxHp)-(b.piece.hp/b.piece.maxHp));
      const ht=allies[0].piece; const h=p.skill.val*p.star;
      ht.hp=Math.min(ht.maxHp,ht.hp+h); addFloat(ht,'+'+h,'#3ddc84');
      addLog(p.name+'治疗'+ht.name+' '+h);
    }
  }
}
function attack(atk,def,side){
  let dmg=atk.atk; let crit=false;
  if(atk.skill.type==='crit'&&chance(0.35)){ dmg=Math.round(dmg*atk.skill.val); crit=true; }
  if(def.shield>0){ const a=Math.min(def.shield,dmg); def.shield-=a; dmg-=a; }
  if(dmg>0){
    def.hp-=dmg; def.hitFlash=10;
    addFloat(def,'-'+dmg+(crit?'!':''),crit?'#ffd23f':'#ff4757');
    addLog(atk.name+(crit?'暴击！':'')+'→'+def.name+' '+dmg);
    if(def.hp<=0){ def.alive=false; addLog(def.name+'被击败'); }
  }
  // 燃烧
  if(atk.skill.type==='burn'&&def.alive){
    const bd=atk.skill.val*atk.star*(G.syns.find(s=>s.eff.burnX2)?2:1);
    def.burn=atk.skill.dur; def.burnDmg=bd;
  }
  if(atk.skill.type==='slow') def.slow=atk.skill.dur;
  // 溅射
  if(atk.skill.type==='chain'){
    const sp=G.battle.combatants.filter(o=>o.side!==side&&o.piece.alive&&o.piece!==def&&Math.hypot(o.piece.bx-def.bx,o.piece.by-def.by)<CV.cellW*1.2);
    for(const s of sp){ s.piece.hp-=atk.skill.val*atk.star; s.piece.hitFlash=8; addFloat(s.piece,'-'+atk.skill.val*atk.star,'#5ce6d8'); if(s.piece.hp<=0){s.piece.alive=false;} }
  }
  // 反伤
  if(def.skill.type==='thorns'&&def.alive){ atk.hp-=def.skill.val*def.star; atk.hitFlash=6; addFloat(atk,'-'+def.skill.val*def.star,'#ff8c42'); if(atk.hp<=0){atk.alive=false;} }
  // 吸血
  let vamp=0;
  if(atk.skill.type==='lifesteal') vamp=dmg*atk.skill.val;
  const vSyn=G.syns.find(s=>s.eff.vamp); if(vSyn) vamp+=dmg*vSyn.eff.vamp;
  if(vamp>0){ atk.hp=Math.min(atk.maxHp,atk.hp+Math.round(vamp)); }
  // 连击
  if(G.syns.find(s=>s.eff.combo)&&chance(0.15)&&def.alive){
    def.hp-=Math.round(atk.atk*0.5); addFloat(def,'-'+Math.round(atk.atk*0.5),'#5ce6d8'); addLog('风系连击'); if(def.hp<=0){def.alive=false;}
  }
}
function addFloat(p,txt,color){
  G.battle.floats.push({x:p.bx,y:p.by-20,txt,color,life:30,vy:-0.8});
}
function addLog(msg){
  G.log.push(msg); if(G.log.length>50) G.log.shift();
  document.getElementById('battle-log').textContent=G.log.slice(-3).join('  ·  ');
}

/* ========== 10. Canvas绘图 ========== */
const canvas=document.getElementById('battle-canvas');
const ctx=canvas.getContext('2d');

function drawBattle(){
  G.animFrame++;
  ctx.fillStyle='#050711'; ctx.fillRect(0,0,CV.W,CV.H);
  // 背景渐变
  const grad=ctx.createLinearGradient(0,0,CV.W,0);
  grad.addColorStop(0,'rgba(74,158,255,0.04)'); grad.addColorStop(0.5,'rgba(0,0,0,0)'); grad.addColorStop(1,'rgba(255,107,74,0.04)');
  ctx.fillStyle=grad; ctx.fillRect(0,0,CV.W,CV.H);
  // 格子
  ctx.strokeStyle='rgba(255,255,255,0.05)'; ctx.lineWidth=1;
  for(let c=0;c<9;c++){ for(let r=0;r<2;r++){
    const x=CV.ox+c*(CV.cellW+CV.gap), y=CV.oy+r*(CV.cellH+CV.gap);
    ctx.strokeRect(x,y,CV.cellW,CV.cellH);
  }}
  // 中线
  ctx.strokeStyle='rgba(255,210,63,0.15)'; ctx.lineWidth=1.5;
  ctx.setLineDash([6,4]);
  const midX=CV.ox+4.5*(CV.cellW+CV.gap);
  ctx.beginPath(); ctx.moveTo(midX,CV.oy-10); ctx.lineTo(midX,CV.oy+2*CV.cellH+CV.gap+10); ctx.stroke();
  ctx.setLineDash([]);
  // 标签
  ctx.font='bold 11px "Noto Sans SC"'; ctx.textAlign='left'; ctx.textBaseline='top';
  ctx.fillStyle='#4a9eff'; ctx.fillText('我方',CV.ox,CV.oy-16);
  ctx.textAlign='right'; ctx.fillStyle='#ff6b4a'; ctx.fillText('敌方',CV.ox+9*(CV.cellW+CV.gap),CV.oy-16);
  ctx.textAlign='left';

  if(!G.battle){
    // 静态布阵预览
    for(let i=0;i<6;i++){ const p=G.board[i]; if(p){ const w=slotToXY(p.x,p.y,false); p.bx=w.x; p.by=w.y; drawPiece(p,false); } }
    for(let i=0;i<G.enemy.length;i++){ const p=G.enemy[i]; p.x=i%3; p.y=Math.floor(i/3); const w=slotToXY(p.x,p.y,true); p.bx=w.x; p.by=w.y; drawPiece(p,true); }
    return;
  }
  // 棋子
  for(const c of G.battle.combatants){ if(c.piece.alive) drawPiece(c.piece,c.side==='enemy'); }
  // 飘字
  for(const f of G.battle.floats){
    const alpha=f.life/30;
    ctx.globalAlpha=alpha; ctx.fillStyle=f.color; ctx.font='bold 13px "Noto Sans SC"';
    ctx.textAlign='center'; ctx.fillText(f.txt,f.x,f.y);
    f.y+=f.vy; f.life--; ctx.globalAlpha=1;
  }
  G.battle.floats=G.battle.floats.filter(f=>f.life>0);
  // tick
  if(G.battle){
    ctx.fillStyle='rgba(255,255,255,0.2)'; ctx.font='10px monospace'; ctx.textAlign='right';
    ctx.fillText('T:'+G.battle.tick,CV.W-8,CV.H-14); ctx.textAlign='left';
  }
}

function drawPiece(p,isEnemy){
  const x=p.bx,y=p.by,r=18;
  const fc=FAC[p.fac].c;
  const shape=ROLE[p.role].shape;
  // 呼吸光晕
  const pulse=0.5+0.5*Math.sin(G.animFrame*0.06);
  ctx.save(); ctx.translate(x,y);
  if(isEnemy) ctx.scale(-1,1);
  // 光晕
  const glow=ctx.createRadialGradient(0,0,0,0,0,r*2);
  glow.addColorStop(0,fc+'40'); glow.addColorStop(1,fc+'00');
  ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(0,0,r*2,0,Math.PI*2); ctx.fill();
  // 受击闪烁
  if(p.hitFlash>0){ ctx.shadowColor='#fff'; ctx.shadowBlur=8*p.hitFlash/10; }
  // 星级边框
  for(let s=0;s<p.star;s++){
    ctx.strokeStyle='#ffd23f'; ctx.lineWidth=1.5;
    drawShape(0,0,r+3+s*2,shape); ctx.stroke();
  }
  // 主体填充
  const bodyGrad=ctx.createLinearGradient(0,-r,0,r);
  bodyGrad.addColorStop(0,fc); bodyGrad.addColorStop(1,shadeColor(fc,-30));
  ctx.fillStyle=bodyGrad; ctx.strokeStyle='#000'; ctx.lineWidth=1.5;
  drawShape(0,0,r,shape); ctx.fill(); ctx.stroke();
  ctx.shadowBlur=0;
  // 内部高光
  ctx.fillStyle='rgba(255,255,255,0.15)';
  drawShape(-r*0.2,-r*0.3,r*0.5,shape); ctx.fill();
  // 职业图标
  ctx.fillStyle='#fff'; ctx.font='bold 11px "Noto Sans SC"';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(ROLE[p.role].n,0,1);
  ctx.restore();
  // HP条
  const bw=36,bh=3,bx=x-bw/2,by=y+r+5;
  ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(bx-1,by-1,bw+2,bh+2);
  ctx.fillStyle='#2a1015'; ctx.fillRect(bx,by,bw,bh);
  const hpPct=Math.max(0,p.hp/p.maxHp);
  ctx.fillStyle=isEnemy?'#ff4757':'#3ddc84'; ctx.fillRect(bx,by,bw*hpPct,bh);
  if(p.shield>0){ ctx.fillStyle='#5ce6d8'; ctx.fillRect(bx+bw*hpPct,by,Math.min(bw*(1-hpPct),p.shield/p.maxHp*bw),bh); }
  // 状态标记
  if(p.burn>0){ ctx.fillStyle='#ff6b4a'; ctx.font='9px sans-serif'; ctx.textAlign='center'; ctx.fillText('🔥',x+r-3,y-r+2); }
  if(p.slow>0){ ctx.fillStyle='#4a9eff'; ctx.font='9px sans-serif'; ctx.fillText('❄',x-r,y-r+2); }
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
}
function drawShape(cx,cy,r,shape){
  ctx.beginPath();
  switch(shape){
    case 'shield': ctx.moveTo(0,-r);ctx.lineTo(r*0.8,-r*0.3);ctx.lineTo(r*0.6,r*0.7);ctx.lineTo(0,r);ctx.lineTo(-r*0.6,r*0.7);ctx.lineTo(-r*0.8,-r*0.3);ctx.closePath(); break;
    case 'diamond':ctx.moveTo(0,-r);ctx.lineTo(r,0);ctx.lineTo(0,r);ctx.lineTo(-r,0);ctx.closePath(); break;
    case 'circle': ctx.arc(cx,cy,r,0,Math.PI*2); break;
    case 'star': for(let i=0;i<10;i++){const a=(Math.PI/5)*i-Math.PI/2;const rr=i%2?r:r*0.45;const px=cx+Math.cos(a)*rr,py=cy+Math.sin(a)*rr;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath(); break;
    case 'rect': ctx.rect(cx-r*0.8,cy-r*0.8,r*1.6,r*1.6); break;
  }
}
function shadeColor(hex,amt){
  let c=parseInt(hex.slice(1),16); let r=(c>>16)+amt, g=((c>>8)&0xff)+amt, b=(c&0xff)+amt;
  r=Math.max(0,Math.min(255,r)); g=Math.max(0,Math.min(255,g)); b=Math.max(0,Math.min(255,b));
  return '#'+((r<<16)|(g<<8)|b).toString(16).padStart(6,'0');
}

/* ========== 11. 战斗结束 ========== */
function onBattleEnd(){
  const won=G.battle.winner==='player';
  const ov=document.getElementById('battle-overlay');
  const res=document.getElementById('overlay-result');
  if(won){
    G.gold+=5+G.floor; G.hp=Math.min(G.maxHp,G.hp+2);
    res.textContent='胜 利'; res.className='overlay-result win';
    if(G.tutor!=='off') tutorSay(TUT.win(G.floor));
  } else {
    G.hp-=3; res.textContent='失 败'; res.className='overlay-result lose';
    if(G.tutor!=='off') tutorSay(TUT.lose);
  }
  ov.classList.remove('hidden');
  setTimeout(()=>ov.classList.add('hidden'),1800);
  G.state='result'; updateHUD();
  if(G.hp<=0){ G.state='dead'; showSplash('💀 挑战失败','你倒在了第'+G.floor+'层','↻ 重新挑战',restart); return; }
  if(G.floor>=G.maxFloor&&won){ G.state='win'; showSplash('🏆 通关！','恭喜征服棋阵塔！','↻ 再来一局',restart); return; }
  document.getElementById('next-btn').classList.remove('hidden');
  drawBattle();
}
function nextFloor(){
  G.floor++; G.state='recruit';
  G.enemy=genEnemy(G.floor);
  G.board=G.board.map(p=>p?{...p,hp:p.maxHp,alive:true,burn:0,slow:0,shield:0,hitFlash:0}:null);
  G.syns=[]; renderSynergy();
  rollShop(); updateHUD(); renderEnemy(); renderBoard();
  document.getElementById('next-btn').classList.add('hidden');
  document.getElementById('fight-btn').classList.remove('hidden');
  drawBattle();
  if(G.tutor==='auto'&&G.floor<=3){ setTimeout(()=>{ tutorSay('第'+G.floor+'层开始！让我看看...'); setTimeout(tutorAutoPlay,1500); },400); }
  else if(G.tutor==='auto'&&G.floor===4){ tutorSay(TUT.handoff); G.tutor='advisor'; updateTutorBtn(); }
}
function restart(){
  G.floor=1; G.gold=10; G.hp=G.maxHp; G.board=new Array(6).fill(null); G.bench=[]; G.enemy=[]; G.syns=[];
  G.state='recruit'; G.seed=0x12345678+(Date.now()%100000); G.rng=makeRng(G.seed);
  startRun();
}
function startRun(){
  G.state='recruit'; G.enemy=genEnemy(G.floor); rollShop(); updateHUD(); renderEnemy(); renderBoard(); renderBench();
  document.getElementById('splash').classList.add('hidden');
  document.getElementById('fight-btn').classList.remove('hidden');
  document.getElementById('next-btn').classList.add('hidden');
  document.getElementById('restart-btn').classList.add('hidden');
  drawBattle();
  if(G.tutor==='auto'){ setTimeout(()=>{ tutorSay(TUT.intro); setTimeout(tutorAutoPlay,2000); },400); }
}

/* ========== 12. UI渲染 ========== */
function updateHUD(){
  document.getElementById('floor-badge').innerHTML='第 <b>'+G.floor+'</b> 层';
  document.getElementById('gold-badge').innerHTML='💰 <b>'+G.gold+'</b>';
  document.getElementById('hp-text').textContent=G.hp+'/'+G.maxHp;
  document.getElementById('hp-fill').style.width=(G.hp/G.maxHp*100)+'%';
}
function renderEnemy(){
  const grid=document.getElementById('enemy-board'); grid.innerHTML='';
  let power=0;
  for(let i=0;i<6;i++){
    const cell=document.createElement('div'); cell.className='cell'; if(i<3)cell.classList.add('front');
    const p=G.enemy[i]; if(p){ power+=p.maxHp+p.atk; cell.appendChild(makeCard(p,true)); }
    grid.appendChild(cell);
  }
  document.getElementById('enemy-power').textContent='战力 '+power;
}
function renderBoard(){
  const grid=document.getElementById('player-board'); grid.innerHTML='';
  for(let i=0;i<6;i++){
    const cell=document.createElement('div'); cell.className='cell';
    if(i<3)cell.classList.add('front');
    if(G.selectedCell===i)cell.classList.add('selected');
    const p=G.board[i];
    if(p){ cell.appendChild(makeCard(p,false)); cell.onclick=()=>removeFromBoard(i); }
    else { cell.classList.add('empty'); cell.onclick=()=>{
      if(G.bench.length){ const bi=G.selectedBench>=0?G.selectedBench:G.bench.length-1; placeFromBench(bi,i); }
    }; }
    grid.appendChild(cell);
  }
  renderBench();
}
function renderBench(){
  const el=document.getElementById('bench'); el.innerHTML='';
  G.bench.forEach((p,i)=>{
    const item=document.createElement('div'); item.className='bench-item';
    if(G.selectedBench===i) item.classList.add('selected');
    const card=makeCard(p,false); card.style.width='100%'; card.style.height='100%';
    item.appendChild(card);
    item.onclick=()=>{ G.selectedBench=i; renderBench(); };
    el.appendChild(item);
  });
}
function makeCard(p,isEnemy){
  const card=document.createElement('div'); card.className='piece-card'+(isEnemy?' enemy':'');
  const fc=FAC[p.fac].c;
  const icon=ROLE[p.role].icon;
  card.innerHTML=
    '<div class="pc-glow" style="background:'+fc+'"></div>'+
    '<div class="pc-stars">'+'★'.repeat(p.star)+'</div>'+
    '<div class="pc-icon">'+icon+'</div>'+
    '<div class="pc-name" style="color:'+fc+'">'+p.name+'</div>'+
    '<div class="pc-hp">'+p.hp+'</div>';
  return card;
}
function renderShop(){
  const grid=document.getElementById('shop'); grid.innerHTML='';
  for(let i=0;i<5;i++){
    const c=G.shop[i]; const el=document.createElement('div'); el.className='shop-card';
    if(!c||c.sold){ el.classList.add('sold'); el.innerHTML='<div style="color:#444;font-size:11px;padding:12px">已售</div>'; }
    else {
      const t=TPL[c.tid]; const fc=FAC[t.fac].c;
      el.innerHTML=
        '<div class="sc-icon" style="filter:drop-shadow(0 0 4px '+fc+'80)">'+ROLE[t.role].icon+'</div>'+
        '<div class="sc-name" style="color:'+fc+'">'+t.name+'</div>'+
        '<div class="sc-faction">'+FAC[t.fac].n+'·'+ROLE[t.role].n+'</div>'+
        '<div class="sc-cost">'+t.cost+'💰</div>';
      el.title=t.skill.desc; el.onclick=()=>buyPiece(i);
    }
    grid.appendChild(el);
  }
}
function renderSynergy(){
  const el=document.getElementById('synergy-tags'); el.innerHTML='';
  if(!G.syns||!G.syns.length){ el.innerHTML='<span style="font-size:9px;color:var(--dim)">无羁绊</span>'; return; }
  for(const s of G.syns){ const tag=document.createElement('span'); tag.className='syn-tag '+s.fac; tag.textContent=s.desc.split(':')[0]; el.appendChild(tag); }
}
function showSplash(title,sub,btn,cb){
  const sp=document.getElementById('splash');
  sp.querySelector('.splash-content').innerHTML=
    '<div class="splash-icon">'+(title.includes('失败')?'💀':title.includes('通关')?'🏆':'⚔️')+'</div>'+
    '<h1 class="splash-title">'+title+'</h1><p class="splash-sub">'+sub+'</p>'+
    '<button id="splash-btn" class="action-btn primary big">'+btn+'</button>';
  sp.classList.remove('hidden');
  document.getElementById('splash-btn').onclick=cb;
}
function updateTutorBtn(){
  const btn=document.getElementById('tutor-toggle');
  const labels={auto:'导师·自动',advisor:'导师·顾问',off:'导师·关闭'};
  btn.querySelector('.tutor-label').textContent=labels[G.tutor];
  btn.classList.toggle('active',G.tutor!=='off');
}
function toggleTutor(){
  const modes=['auto','advisor','off'];
  G.tutor=modes[(modes.indexOf(G.tutor)+1)%3]; updateTutorBtn();
  const desc={auto:'导师切换为【自动】，会帮你操作',advisor:'导师切换为【顾问】，你操作时给建议',off:'导师已关闭'};
  tutorSay(desc[G.tutor]);
  if(G.tutor==='auto'&&G.state==='recruit'&&G.floor<=3) setTimeout(tutorAutoPlay,500);
}

/* ========== 13. 事件 & 初始化 ========== */
document.getElementById('start-btn').onclick=startRun;
document.getElementById('fight-btn').onclick=startBattle;
document.getElementById('next-btn').onclick=nextFloor;
document.getElementById('reroll-btn').onclick=reroll;
document.getElementById('tutor-toggle').onclick=toggleTutor;
document.addEventListener('keydown',e=>{
  if(e.key==='t'||e.key==='T')toggleTutor();
  if(e.key===' '&&G.state==='recruit'){e.preventDefault();startBattle();}
});

// 静态动画循环（呼吸光效）
function animLoop(){ if(G.state==='battle'||G.state==='recruit'||G.state==='result') drawBattle(); requestAnimationFrame(animLoop); }

updateHUD(); updateTutorBtn(); renderBoard(); drawBattle();
requestAnimationFrame(animLoop);
window.__GAME__=G;
