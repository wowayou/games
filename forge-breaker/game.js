(() => {
'use strict';
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
const $=id=>document.getElementById(id); const TAU=Math.PI*2;
let W=innerWidth,H=innerHeight,dpr=1, raf=0,last=0;
const keys={}, pointer={x:0,y:0,down:false};
const META_KEY='hellforge.meta.v1';
const DEFAULT_META={vault:0,forge:{damage:0,paddle:0,ore:0,hp:0},bestWave:1,bestScore:0};
function loadMeta(){try{const raw=localStorage.getItem(META_KEY);if(!raw)return structuredClone(DEFAULT_META);const m=JSON.parse(raw);return{vault:Math.max(0,m.vault|0),forge:{damage:m.forge?.damage|0,paddle:m.forge?.paddle|0,ore:m.forge?.ore|0,hp:m.forge?.hp|0},bestWave:Math.max(1,m.bestWave|0),bestScore:Math.max(0,m.bestScore|0)}}catch{return structuredClone(DEFAULT_META)}}
function saveMeta(){try{localStorage.setItem(META_KEY,JSON.stringify(meta))}catch{}}
const meta=loadMeta();
// 难度入口：单位为像素、秒、生命值；调参说明与验证见 BALANCE.md。
const BALANCE={
 starter:{hp:120,damage:1,balls:2,pierce:3},
 paddle:{response:18,keyboardSpeed:720,maxWidthRatio:.65},
 speed:{upgrade:1.15,max:900},
 combat:{maxStacks:25,stackStep:.2,novaMul:2.5,comboDivisor:45,heatPerStack:.3,eliteDamageMul:.62,bossDamageMul:.5},
 wave:{baseRows:2,rowsEvery:2,maxRows:7,baseCols:6,colsEvery:3,maxCols:10,hpBase:1,hpPerWave:.25},
 modes:{
  relaxed:{name:'舒缓',paddleWidth:180,ballSpeed:620,freeReloads:5,igniteCost:5,
   singleLossRetention:.8,volleyRetention:.5,reloadGrace:2.5,
   approachSeconds:55,secondsPerWave:1.5,minApproachSeconds:28,
   bossHpBase:24,bossHpPerWave:8,leakDamage:4,eliteLeakDamage:8,
   hitHeat:7,catchHeat:5,heatDecay:.5,leakHeat:10,waveHeal:8},
  standard:{name:'标准',paddleWidth:145,ballSpeed:700,freeReloads:3,igniteCost:10,
   singleLossRetention:.5,volleyRetention:0,reloadGrace:1,
   approachSeconds:43,secondsPerWave:2,minApproachSeconds:18,
   bossHpBase:40,bossHpPerWave:12,leakDamage:5,eliteLeakDamage:10,
   hitHeat:4,catchHeat:0,heatDecay:2,leakHeat:20,waveHeal:0}
 }
};
const DIFFICULTY_KEY='hellforge.difficulty.v1';
let difficulty='relaxed';
try{const saved=localStorage.getItem(DIFFICULTY_KEY);if(Object.hasOwn(BALANCE.modes,saved))difficulty=saved}catch{}
let B=BALANCE.modes[difficulty];
const MAX_STACKS=BALANCE.combat.maxStacks;
const STACK_STEP=BALANCE.combat.stackStep;
const NOVA_MUL=BALANCE.combat.novaMul;
const S={phase:'menu',wave:1,ore:0,hp:120,maxHp:120,combo:0,heat:0,score:0,balls:[],enemies:[],sparks:[],oreBits:[],paddle:{x:W/2,w:120,target:W/2},shots:0,cleared:0,level:1,damage:1,speed:700,pierce:3,crit:.05,multiball:0,fire:0,ice:0,lightning:0,magnet:0,forge:{damage:0,paddle:0,ore:0,hp:0},fusion:{},boss:null,paused:false,stacks:0,reloadsUsed:0,novaFlash:0,volleyBonus:null,leaked:0};
// 锻打倍率：接球累积；总倍率 = 锻打 × 连击热度
function forgeMul(){return 1+Math.min(S.stacks,MAX_STACKS)*STACK_STEP}
function comboMul(){return 1+S.combo/BALANCE.combat.comboDivisor}
function totalMul(){return forgeMul()*comboMul()}
const BALLS={ember:{name:'余烬球',color:'#ff6030',desc:'命中施加燃烧，持续伤害',icon:'🔥'},frost:{name:'霜骨球',color:'#65dfff',desc:'命中冻结敌人，降低推进',icon:'❄'},storm:{name:'雷鸣球',color:'#ffd85b',desc:'闪电链至附近敌人',icon:'⚡'},ghost:{name:'幽魂球',color:'#bd8cff',desc:'穿透 2 个目标',icon:'☠'},vampire:{name:'血铸球',color:'#f04c85',desc:'命中时修复炉心',icon:'🩸'}};
const UPGRADES=[
 {id:'damage',icon:'⚔',name:'淬火尖锋',desc:'所有球伤害 +50%',apply:()=>S.damage*=1.50},
 {id:'paddle',icon:'▰',name:'加宽炉口',get desc(){return `挡板宽度 +30%（最多占屏宽 ${Math.round(BALANCE.paddle.maxWidthRatio*100)}%）`},apply:()=>{S.paddle.baseWidth*=1.30;fitPaddle()}},
 {id:'speed',icon:'➤',name:'疾风发射',get desc(){return `弹球速度 +${Math.round((BALANCE.speed.upgrade-1)*100)}%（有上限）`},apply:()=>S.speed=Math.min(BALANCE.speed.max,S.speed*BALANCE.speed.upgrade)},
 {id:'multiball',icon:'✣',name:'分裂核心',desc:'每次发射额外 +2 球',apply:()=>S.multiball+=2},
 {id:'pierce',icon:'◈',name:'鬼火穿刺',desc:'球穿透次数 +1',apply:()=>S.pierce++},
 {id:'crit',icon:'✦',name:'暴击符文',desc:'暴击率 +12%',apply:()=>S.crit+=.12},
 {id:'fire',icon:'🔥',name:'熔岩浇注',desc:'获得余烬球元素',apply:()=>S.fire++},
 {id:'ice',icon:'❄',name:'寒铁冷却',desc:'获得霜骨球元素',apply:()=>S.ice++},
 {id:'lightning',icon:'⚡',name:'雷炉线圈',desc:'获得雷鸣球元素',apply:()=>S.lightning++},
 {id:'magnet',icon:'🧲',name:'矿屑磁极',desc:'矿石自动吸入炉心',apply:()=>S.magnet++},
];
const FUSIONS=[
 {id:'melting',need:['fire','ice'],icon:'🌡',name:'消融之球',desc:'融合余烬+霜骨：燃烧与冻结同时施加，伤害 +60%',apply:()=>{S.fusion.melting=true;S.damage*=1.6}},
 {id:'nosferatu',need:['pierce','lightning'],icon:'🦇',name:'夜噬之球',desc:'融合穿透+雷鸣：穿透 +2 且命中回复炉心',apply:()=>{S.fusion.nosferatu=true;S.pierce+=2}},
 {id:'brood',need:['multiball','fire'],icon:'🥚',name:'孕火之球',desc:'融合分裂+熔岩：击杀时溅射子球',apply:()=>{S.fusion.brood=true;S.multiball++}},
];
const FORGE=[{id:'damage',icon:'⚔',name:'炉锤淬炼',desc:'永久伤害 +8%',cost:20,apply:()=>S.forge.damage++},{id:'paddle',icon:'▰',name:'铸造炉口',desc:'永久挡板 +10%',cost:25,apply:()=>S.forge.paddle++},{id:'ore',icon:'◆',name:'寻矿刻印',desc:'矿石掉落 +15%',cost:30,apply:()=>S.forge.ore++},{id:'hp',icon:'♥',name:'耐热炉心',desc:'最大生命 +15',cost:35,apply:()=>{S.forge.hp++;S.maxHp+=15;S.hp=S.maxHp}}];
const audio={ctx:null,muted:false,init(){if(!this.ctx){const A=window.AudioContext||window.webkitAudioContext;if(A)this.ctx=new A()}if(this.ctx?.state==='suspended')this.ctx.resume()},tone(f,d=.08,type='square',g=.05){if(!this.ctx||this.muted)return;const o=this.ctx.createOscillator(),a=this.ctx.createGain();o.type=type;o.frequency.value=f;a.gain.setValueAtTime(g,this.ctx.currentTime);a.gain.exponentialRampToValueAtTime(.001,this.ctx.currentTime+d);o.connect(a).connect(this.ctx.destination);o.start();o.stop(this.ctx.currentTime+d+.02)},hit(){this.tone(180+S.combo*8,.05,'square',.035)},forge(){this.tone(120,.3,'sawtooth',.08);setTimeout(()=>this.tone(440,.2,'sine',.06),100)},boom(){this.tone(65,.28,'sawtooth',.1)},select(){this.tone(550,.1,'triangle',.06)}};
function fitPaddle(){S.paddle.w=Math.min(S.paddle.baseWidth||B.paddleWidth,W*BALANCE.paddle.maxWidthRatio);S.paddle.x=clampPaddle(S.paddle.x);S.paddle.target=clampPaddle(S.paddle.target)}
function clampPaddle(x){return Math.max(S.paddle.w/2,Math.min(W-S.paddle.w/2,x))}
function resize(){const oldTravel=Math.max(1,H-250);dpr=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.setTransform(dpr,0,0,dpr,0,0);fitPaddle();
 // 旋转屏幕时保留敌人相对推进进度，不因高度缩小立即撞炉。
 if(S.phase==='playing'){const scale=Math.max(1,H-250)/oldTravel;for(const e of S.enemies){e.y=105+(e.y-105)*scale;e.h*=scale;e.x=Math.max(0,Math.min(W-e.w,e.x))}S.advanceSpeed*=scale}
}
addEventListener('resize',resize);resize();
function reset(){B=BALANCE.modes[difficulty];const maxHp=BALANCE.starter.hp+meta.forge.hp*15;Object.assign(S,{phase:'playing',wave:1,ore:0,hp:maxHp,maxHp,combo:0,heat:0,score:0,balls:[],enemies:[],sparks:[],oreBits:[],shots:0,cleared:0,level:1,damage:BALANCE.starter.damage*(1+meta.forge.damage*.08),speed:B.ballSpeed,pierce:BALANCE.starter.pierce,crit:.05,multiball:BALANCE.starter.balls-1,fire:0,ice:0,lightning:0,magnet:0,forge:{...meta.forge},fusion:{},boss:null,paused:false,stacks:0,reloadsUsed:0,novaFlash:0,volleyBonus:null,leaked:0,reloadGrace:0,advanceSpeed:0});S.paddle.baseWidth=B.paddleWidth*(1+meta.forge.paddle*.1);S.paddle.x=W/2;S.paddle.target=W/2;fitPaddle();spawnWave();ui();}
function spawnBoss(){const hp=B.bossHpBase+S.wave*B.bossHpPerWave,bw=Math.min(260,W-40);S.enemies.push({x:(W-bw)/2,y:135,w:bw,h:74,hp,max:hp,row:0,kind:'boss',frozen:0,burn:0,angle:0,dead:false});const ew=Math.min(48,(W-70)/6),left=(W-(ew*6+50))/2;for(let i=0;i<6;i++){const gh=4+Math.floor(S.wave*1.2);S.enemies.push({x:left+i*(ew+10),y:232,w:ew,h:26,hp:gh,max:gh,row:1,kind:'normal',frozen:0,burn:0,angle:0,dead:false})}}
function spawnWave(){S.reloadsUsed=0;S.stacks=0;S.volleyBonus=null;S.leaked=0;S.reloadGrace=0;S.balls=[];S.enemies=[];S.cleared=0;
 if(S.wave%4===0)spawnBoss();
 else{const cfg=BALANCE.wave,rows=Math.min(cfg.baseRows+Math.floor(S.wave/cfg.rowsEvery),cfg.maxRows),cols=Math.min(cfg.baseCols+Math.floor(S.wave/cfg.colsEvery),cfg.maxCols);const gap=5, ew=Math.min(64,(W-100)/cols-gap), left=(W-(cols*(ew+gap)-gap))/2;for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){if(Math.random()<Math.min(.12+S.wave*.025,.4)&&r>1)continue;const hp=BALANCE.wave.hpBase+Math.floor(S.wave*BALANCE.wave.hpPerWave);S.enemies.push({x:left+c*(ew+gap),y:105+r*42,w:ew,h:30,hp,max:hp,row:r,kind:r===0&&S.wave>=3?'elite':'normal',frozen:0,burn:0,angle:Math.random()*TAU,dead:false});}}
 // 按抵达炉心的时间调压；短屏压缩出生区域，保留至少 90px 缓冲。
 const bottom=Math.max(...S.enemies.map(e=>e.y+e.h));
 const scale=Math.min(1,Math.max(30,H-145-90-105)/(bottom-105));
 for(const e of S.enemies){e.y=105+(e.y-105)*scale;e.h*=scale}
 const distance=H-145-Math.max(...S.enemies.map(e=>e.y+e.h));
 S.advanceSpeed=Math.max(1,distance)/Math.max(B.minApproachSeconds,B.approachSeconds-(S.wave-1)*B.secondsPerWave);
}
function launch(x=S.paddle.x){if(S.phase!=='playing'||S.paused||S.balls.length||!S.enemies.some(e=>!e.dead))return; audio.init();x=clampPaddle(x);S.paddle.x=S.paddle.target=x;S.reloadGrace=0;
 // 装填计费：前 B.freeReloads 次免费，之后每次强行点火扣炉心
 S.reloadsUsed++;
 if(S.reloadsUsed>B.freeReloads){S.hp-=B.igniteCost;toast('强行点火 · 炉心 −'+B.igniteCost);audio.boom();if(S.hp<=0){gameOver();return}}
 const count=1+S.multiball;for(let i=0;i<count;i++){const spread=(i-(count-1)/2)*.13;S.balls.push({x,y:H-100,vx:Math.sin(spread)*S.speed,vy:-Math.cos(spread)*S.speed,r:8,damage:S.damage*(Math.random()<S.crit?2.2:1),pierce:S.pierce,kind:chooseBall(),trail:[]});}S.shots++;audio.tone(260,.12,'sawtooth',.05);ui()}
// 熔炉爆发：热度满时手动释放，全屏伤害 = damage × NOVA_MUL × 锻打倍率
function nova(){if(S.phase!=='playing'||S.paused||S.heat<100)return false;const dmg=S.damage*NOVA_MUL*forgeMul();S.novaFlash=.45;audio.forge();for(const e of [...S.enemies]){if(e.dead)continue;damageEnemy(e,{x:e.x+e.w/2,y:e.y+e.h/2,damage:dmg,kind:'storm',pierce:0},true)}S.heat=0;burst(W/2,H*.4,'#ffcf5b',44);toast('⚒ 熔炉爆发 ×'+forgeMul().toFixed(1));ui();return true}
// 轮次结算：需零泄漏（无敌人撞进炉心）才有奖励，装填次数越少奖励越高
function awardVolley(){const r=S.reloadsUsed,tier=r<1?0:S.leaked>0?0:r===1?1:r===2?.5:r===3?.25:0;if(tier<=0){S.volleyBonus={reloads:r,gain:0,leaked:S.leaked};return}const gain=Math.round((12+S.wave*4)*tier*(1+S.forge.ore*.15));S.ore+=gain;S.score+=gain*25;S.volleyBonus={reloads:r,gain,leaked:0};toast(r===1?('⚒ 完美一轮 · 矿石 +'+gain):('轮次结算 · 矿石 +'+gain))}
function chooseBall(){const opts=['ember'];if(S.fire)opts.push('ember');if(S.ice)opts.push('frost');if(S.lightning)opts.push('storm');if(S.pierce>1)opts.push('ghost');if(S.forge.hp)opts.push('vampire');return opts[(Math.random()*opts.length)|0]}
function readyFusions(){return FUSIONS.filter(f=>!S.fusion[f.id]&&f.need.every(k=>S[k]>0))}
function chooseUpgrades(){S.phase='draft';
 // 轮次结算文案：装填次数越少评价越高
 const repaired=Math.min(S.maxHp-S.hp,Math.min(B.waveHeal,S.cleared));S.hp+=repaired;
 const vb=S.volleyBonus,el=$('draftEyelash');
 if(el)el.textContent=vb?(vb.reloads===1&&vb.gain>0?`⚒ 完美一轮 · 单次装填零泄漏 · 矿石 +${vb.gain}`:vb.gain>0?`本炉装填 ${vb.reloads} 次 · 轮次奖励 矿石 +${vb.gain}`:vb.leaked>0?`炉心被击穿 ${vb.leaked} 次 · 无轮次奖励`:`本炉装填 ${vb.reloads} 次 · 无轮次奖励`):'熔炉共鸣 · 选择一项锻造';
 if(el&&repaired>0)el.textContent+=` · 炉心修复 +${Math.ceil(repaired)}`;
 const fus=readyFusions();const base=UPGRADES.filter(u=>(u.id!=='speed'||S.speed<BALANCE.speed.max)&&(u.id!=='paddle'||S.paddle.w<W*BALANCE.paddle.maxWidthRatio)).sort(()=>Math.random()-.5).slice(0,fus.length?2:3);const pool=fus.length?[fus[0],...base]:base;$('cards').innerHTML=pool.map((u,i)=>`<div class="card" data-up="${u.id}"><span class="icon">${u.icon}</span><h3>${u.name}</h3><p>${u.desc}</p><small>${FUSIONS.some(f=>f.id===u.id)?'★ 球种融合':'选择锻造 · '+(i+1)}</small></div>`).join('');document.querySelectorAll('[data-up]').forEach(n=>n.onclick=()=>{const u=[...UPGRADES,...FUSIONS].find(x=>x.id===n.dataset.up);u.apply();audio.select();S.level++;$('draft').classList.remove('active');toast(u.name);if(S.wave%2===0){forge()}else{S.wave++;S.phase='playing';spawnWave()}ui()});$('draft').classList.add('active');}
function spend(cost){const fromRun=Math.min(S.ore,cost);S.ore-=fromRun;const rest=cost-fromRun;if(rest>0){meta.vault-=rest;saveMeta()}}
function forge(){S.phase='forge';const pool=[...FORGE].sort(()=>Math.random()-.5);$('forgeCards').innerHTML=pool.map(u=>`<div class="card" data-forge="${u.id}"><span class="icon">${u.icon}</span><h3>${u.name}</h3><p>${u.desc}</p><small>${u.cost} 矿石 · 永久升级</small></div>`).join('');document.querySelectorAll('[data-forge]').forEach(n=>n.onclick=()=>{const u=FORGE.find(x=>x.id===n.dataset.forge);if(S.ore+meta.vault<u.cost){toast('矿石不足');return}spend(u.cost);u.apply();meta.forge[u.id]=S.forge[u.id];saveMeta();audio.forge();n.classList.add('bought');toast('锻造完成 · '+u.name);ui()});$('forge').classList.add('active');}
$('continue').onclick=()=>{audio.select();$('forge').classList.remove('active');S.wave++;S.phase='playing';spawnWave();ui()};
function damageEnemy(e,b,isNova){if(e.dead)return;
 // 爆发的伤害已含锻打倍率，此处只再乘连击热度，避免重复计算
 const mul=isNova?comboMul():totalMul();
 let dmg=b.damage*mul*(e.kind==='elite'?BALANCE.combat.eliteDamageMul:e.kind==='boss'?BALANCE.combat.bossDamageMul:1);
 if(S.fusion.nosferatu)S.hp=Math.min(S.maxHp,S.hp+.35);if(b.kind==='vampire')S.hp=Math.min(S.maxHp,S.hp+.8);e.hp-=dmg;e.burn=S.fire?1.4:0;e.frozen=S.ice?.7:0;if(S.fusion.melting){e.burn=1.8;e.frozen=.9}S.combo++;
 // 命中与接球都蓄热；锻打层数仍能提高命中蓄能效率。
 if(!isNova)S.heat=Math.min(100,S.heat+B.hitHeat+S.stacks*BALANCE.combat.heatPerStack);
 S.score+=Math.round(dmg*10*(1+S.combo/20));burst(b.x,b.y,BALLS[b.kind]?.color||'#ffb52e',5);audio.hit();if(S.lightning&&Math.random()<.38)chain(e);if(e.hp<=0){e.dead=true;S.cleared++;if(S.fusion.brood&&!isNova)for(let i=0;i<3;i++)S.balls.push({x:e.x+e.w/2,y:e.y,vx:(Math.random()-.5)*S.speed,vy:-S.speed*.6,r:5,damage:S.damage*.6,pierce:1,kind:'ember',trail:[],temp:true});const gain=Math.round((1+Math.floor(Math.random()*3)+Math.floor(S.wave/3))*(e.kind==='boss'?9:e.kind==='elite'?3:1)*(1+S.forge.ore*.15));dropOre(e.x+e.w/2,e.y+e.h/2,gain);burst(e.x+e.w/2,e.y+e.h/2,'#ffb52e',16);audio.tone(300+S.combo*10,.08,'sine',.045)}}
function chain(e){const target=S.enemies.filter(x=>!x.dead&&x!==e).sort((a,b)=>Math.hypot(a.x-e.x,a.y-e.y)-Math.hypot(b.x-e.x,b.y-e.y))[0];if(target){target.hp-=S.damage*.45;burst(target.x+target.w/2,target.y+target.h/2,'#ffe45e',7)}}
function dropOre(x,y,n){S.oreBits.push({x,y,vx:(Math.random()-.5)*30,vy:-80-Math.random()*80,n,r:5,life:8})}
function burst(x,y,color,n){for(let i=0;i<n;i++){const a=Math.random()*TAU,s=40+Math.random()*140;S.sparks.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-30,life:.35+Math.random()*.5,color,r:1+Math.random()*3})}}
function tick(dt){if(S.phase!=='playing'||S.paused)return;const p=S.paddle;
 if(keys.KeyA||keys.ArrowLeft)p.target-=BALANCE.paddle.keyboardSpeed*dt;
 if(keys.KeyD||keys.ArrowRight)p.target+=BALANCE.paddle.keyboardSpeed*dt;
 p.target=clampPaddle(p.target);p.x+=(p.target-p.x)*(1-Math.exp(-BALANCE.paddle.response*dt));
 const advanceDt=S.reloadsUsed===0?0:Math.max(0,dt-S.reloadGrace);
 S.reloadGrace=Math.max(0,S.reloadGrace-dt);
 for(const e of S.enemies){if(e.dead)continue;e.angle+=dt*2;e.frozen=Math.max(0,e.frozen-dt);e.burn=Math.max(0,e.burn-dt);if(e.burn>0)e.hp-=dt*S.damage*.2;e.y+=S.advanceSpeed*(e.frozen?0.28:1)*advanceDt;if(e.y+e.h>H-145){S.hp-=e.kind==='elite'?B.eliteLeakDamage:B.leakDamage;e.dead=true;S.leaked++;S.combo=0;S.heat=Math.max(0,S.heat-B.leakHeat);burst(e.x+e.w/2,e.y,'#f22',20);audio.boom()}}
// 子步进：高速球每步移动不超过 4px，防止穿透
const maxStep=4,maxDt=0.004;
for(const b of S.balls){
  const speed=Math.hypot(b.vx,b.vy);const dist=speed*dt;const steps=Math.max(1,Math.ceil(dist/maxStep));
  const subDt=Math.min(dt/steps,maxDt);
  b.trail.push({x:b.x,y:b.y});if(b.trail.length>18)b.trail.shift();
  for(let s=0;s<steps;s++){
    b.x+=b.vx*subDt;b.y+=b.vy*subDt;
    // 左右墙反弹
    if(b.x<b.r){b.x=b.r+0.5;b.vx=Math.abs(b.vx);audio.hit()}
    if(b.x>W-b.r){b.x=W-b.r-0.5;b.vx=-Math.abs(b.vx);audio.hit()}
    // 顶部反弹（敌人区域下沿）
    if(b.y<b.r+70){b.y=b.r+70+0.5;b.vy=Math.abs(b.vy);audio.hit()}
    // 挡板碰撞：扩大判定区间，防止穿透
    if(b.y+b.r>H-83&&b.y-b.r<H-70&&b.vy>0&&b.x>p.x-p.w/2-b.r&&b.x<p.x+p.w/2+b.r){
      b.y=H-83-b.r;
      // 挡板反弹：命中位置决定角度，保持总速度恒定
      const hitPos=(b.x-p.x)/(p.w/2); // -1 到 1
      const angle=Math.max(-1,Math.min(1,hitPos))*1.0; // 最大 ±57°
      b.vx=S.speed*Math.sin(angle);b.vy=-S.speed*Math.cos(angle);
      S.combo=Math.max(S.combo,1);
      // 接球累积锻打层数（多球 → 蓄层更快，但更难维持）
      if(!b.temp){S.stacks=Math.min(MAX_STACKS,S.stacks+1);S.heat=Math.min(100,S.heat+B.catchHeat)}
      audio.hit();break}
    // 敌人碰撞：基于穿透深度的反弹
    for(const e of S.enemies){
      if(e.dead)continue;
      if(b.x+b.r>e.x&&b.x-b.r<e.x+e.w&&b.y+b.r>e.y&&b.y-b.r<e.y+e.h){
        damageEnemy(e,b);
        if(b.pierce>0)b.pierce--;
        else{
          // 计算各轴穿透深度
          const penLeft=b.x+b.r-e.x,penRight=e.x+e.w-(b.x-b.r);
          const penTop=b.y+b.r-e.y,penBottom=e.y+e.h-(b.y-b.r);
          const minPenX=Math.min(penLeft,penRight),minPenY=Math.min(penTop,penBottom);
          // 选穿透较浅的轴反弹
          if(minPenX<minPenY){
            // 水平反弹：仅当球朝墙运动时才翻转
            if((penLeft<penRight&&b.vx>0)||(penRight<penLeft&&b.vx<0))b.vx*=-1;
            // 推出砖块
            b.x+=penLeft<penRight?minPenX:-minPenX;
          }else{
            if((penTop<penBottom&&b.vy>0)||(penBottom<penTop&&b.vy<0))b.vy*=-1;
            b.y+=penTop<penBottom?minPenY:-minPenY;
          }
          // 保持速度恒定（防止反弹后变快/变慢）
          const sp=Math.hypot(b.vx,b.vy)||1;
          b.vx=b.vx/sp*S.speed;b.vy=b.vy/sp*S.speed;
        }
        break}
    }
  }
}
// 只对核心球计失误；同时失去多球只结算一次整轮惩罚。
const hadBalls=S.balls.length>0;
const lostCore=S.balls.filter(b=>b.y>=H+36&&!b.temp).length;
S.balls=S.balls.filter(b=>b.y<H+36);
if(lostCore>0){
 const volleyEnded=!S.balls.some(b=>!b.temp);
 S.stacks=Math.floor(S.stacks*(volleyEnded?B.volleyRetention:Math.pow(B.singleLossRetention,lostCore)));
 if(volleyEnded)S.combo=0;
 if(S.enemies.some(e=>!e.dead))toast(volleyEnded?`轮次结束 · 保留 ${S.stacks} 层锻打`:`失球 · 剩余 ${S.stacks} 层锻打`);
}
if(hadBalls&&!S.balls.length)S.reloadGrace=B.reloadGrace;
for(const o of S.oreBits){o.vy+=180*dt;o.x+=o.vx*dt;o.y+=o.vy*dt;const dx=p.x-o.x,dy=H-83-o.y;if(S.magnet){o.vx+=dx*dt*3;o.vy+=dy*dt*3}if(Math.hypot(dx,dy)<32){S.ore+=o.n;o.life=0;audio.tone(700,.05,'triangle',.04)}}S.oreBits=S.oreBits.filter(o=>o.life>0&&o.y<H+30);for(const q of S.sparks){q.life-=dt;q.x+=q.vx*dt;q.y+=q.vy*dt;q.vy+=180*dt}S.sparks=S.sparks.filter(q=>q.life>0);S.enemies=S.enemies.filter(e=>!e.dead||e.y<H);if(S.hp<=0){gameOver();return}if(!S.enemies.some(e=>!e.dead)){awardVolley();chooseUpgrades()}else if(S.cleared>0&&S.cleared%14===0){/* combo milestone */}
// 热度满时不再衰减，让玩家自行决定爆发时机
if(S.heat<100)S.heat=Math.max(0,S.heat-dt*B.heatDecay);ui()}
function gameOver(){S.phase='over';meta.bestWave=Math.max(meta.bestWave,S.wave);meta.bestScore=Math.max(meta.bestScore,S.score);saveMeta();$('overWave').textContent=S.wave;$('overOre').textContent=S.ore;$('gameover').classList.add('active');ui();audio.boom()}
function draw(){ctx.clearRect(0,0,W,H);const grd=ctx.createRadialGradient(W/2,H*.75,20,W/2,H*.5,Math.max(W,H)*.75);grd.addColorStop(0,'#602514');grd.addColorStop(.42,'#26100b');grd.addColorStop(1,'#080304');ctx.fillStyle=grd;ctx.fillRect(0,0,W,H);drawGrid();for(const e of S.enemies)if(!e.dead)drawEnemy(e);for(const b of S.balls)drawBall(b);for(const o of S.oreBits)drawOre(o);for(const q of S.sparks)drawSpark(q);drawPaddle();
// 熔炉爆发闪光
if(S.novaFlash>0){ctx.save();ctx.globalAlpha=Math.min(.7,S.novaFlash*1.4);ctx.fillStyle='#ffcf5b';ctx.fillRect(0,70,W,H-70);ctx.restore()}
// 球全部丢失时显示发射提示，并明示装填代价
if(S.phase==='playing'&&S.heat<100&&!S.balls.length&&S.enemies.some(e=>!e.dead)){const free=B.freeReloads-S.reloadsUsed;ctx.save();ctx.globalAlpha=.5+Math.sin(performance.now()/300)*.3;ctx.fillStyle=free>0?'#ffcf5b':'#ff5a3c';ctx.font='bold '+Math.min(22,W/22)+'px Cinzel';ctx.textAlign='center';ctx.fillText(free>0?('点击 / 空格 装填（剩余免费 '+free+' 次）'):('⚠ 强行点火 · 炉心 −'+B.igniteCost),W/2,H-120);ctx.restore()}
// 热度满：提示可释放爆发
if(S.phase==='playing'&&S.heat>=100){ctx.save();ctx.globalAlpha=.55+Math.sin(performance.now()/180)*.35;ctx.fillStyle='#ffd05a';ctx.font='bold '+Math.min(20,W/24)+'px Cinzel';ctx.textAlign='center';ctx.fillText('点击 / 空格 释放爆发 ×'+forgeMul().toFixed(1),W/2,H-120);ctx.restore()}
// 目标提示
if(S.phase==='playing'){ctx.save();ctx.globalAlpha=.4;ctx.fillStyle='#ae8b6c';ctx.font='12px Cinzel';ctx.textAlign='center';ctx.fillText(S.reloadsUsed===0?'准备就绪 · 首次装填后敌人开始推进':S.reloadGrace>0?`装填缓冲 ${S.reloadGrace.toFixed(1)} 秒 · 敌人暂缓推进`:'目标：摧毁所有敌人 · 总倍率 ×'+totalMul().toFixed(1),W/2,H-148);ctx.restore()}}
function drawGrid(){ctx.save();ctx.globalAlpha=.12;ctx.strokeStyle='#ff7c35';for(let y=80;y<H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}for(let x=-H;x<W+H;x+=50){ctx.beginPath();ctx.moveTo(W/2,70);ctx.lineTo(x,H);ctx.stroke()}ctx.restore()}
function drawEnemy(e){const c=e.kind==='boss'?'#ff3b2f':e.kind==='elite'?'#b92e22':['#c14d23','#8c3022','#be772d'][e.row%3];ctx.save();ctx.shadowBlur=15;ctx.shadowColor=c;ctx.fillStyle=c;ctx.fillRect(e.x,e.y,e.w,e.h);ctx.fillStyle='#2b0b08';ctx.fillRect(e.x+3,e.y+3,e.w-6,e.h-6);ctx.strokeStyle=e.frozen?'#7ef5ff':c;ctx.lineWidth=2;ctx.strokeRect(e.x,e.y,e.w,e.h);ctx.fillStyle='#ffe06a';ctx.fillRect(e.x+5,e.y+e.h-6,(e.w-10)*Math.max(0,e.hp/e.max),3);ctx.fillStyle=e.kind==='elite'?'#ffdd5c':'#ff8b45';ctx.font='12px Cinzel';ctx.fillText(e.kind==='boss'?'熔铸巨像 '+Math.ceil(e.hp):e.kind==='elite'?'◆':String(Math.ceil(e.hp)),e.x+e.w/2-(e.kind==='boss'?55:4),e.y+19);ctx.restore()}
function drawBall(b){const col=BALLS[b.kind]?.color||'#ff702e';for(let i=0;i<b.trail.length;i++){const t=b.trail[i],a=i/b.trail.length;ctx.globalAlpha=a*.25;ctx.fillStyle=col;ctx.beginPath();ctx.arc(t.x,t.y,b.r*a,0,TAU);ctx.fill()}ctx.globalAlpha=1;ctx.shadowBlur=18;ctx.shadowColor=col;ctx.fillStyle=col;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,TAU);ctx.fill();ctx.shadowBlur=0}
function drawPaddle(){const p=S.paddle;ctx.save();ctx.shadowBlur=18;ctx.shadowColor='#ff541d';ctx.fillStyle='#db5a25';ctx.fillRect(p.x-p.w/2,H-83,p.w,13);ctx.fillStyle='#ffcf5b';ctx.fillRect(p.x-p.w/2+5,H-80,p.w-10,3);ctx.restore()}
function drawOre(o){ctx.save();ctx.shadowBlur=14;ctx.shadowColor='#ffd05a';ctx.fillStyle='#ffd05a';ctx.translate(o.x,o.y);ctx.rotate(performance.now()/500);ctx.beginPath();ctx.moveTo(0,-o.r);ctx.lineTo(o.r,0);ctx.lineTo(0,o.r);ctx.lineTo(-o.r,0);ctx.closePath();ctx.fill();ctx.restore()}
function drawSpark(q){ctx.globalAlpha=Math.max(0,q.life*2);ctx.fillStyle=q.color;ctx.fillRect(q.x,q.y,q.r,q.r);ctx.globalAlpha=1}
function ui(){ $('wave').textContent=S.wave;const vaultEl=$('vault');if(vaultEl)vaultEl.textContent=meta.vault;const bestEl=$('overBest');if(bestEl)bestEl.textContent=meta.bestWave;$('combo').textContent=S.combo;$('ore').textContent=S.ore;$('hp').textContent=`${Math.max(0,Math.ceil(S.hp))} / ${S.maxHp}`;$('hpbar').style.width=`${Math.max(0,S.hp/S.maxHp*100)}%`;
// 锻打层数
const st=Math.min(S.stacks,MAX_STACKS);$('forgex').textContent=forgeMul().toFixed(1);$('stackbar').style.width=`${st/MAX_STACKS*100}%`;$('stackInfo').textContent=`${st} / ${MAX_STACKS} 层`;
// 熔炉热度 + 总倍率
$('heatbar').style.width=`${S.heat}%`;$('heatx').textContent=totalMul().toFixed(1);$('heatInfo').textContent=S.heat>=100?'⚡ 点击 / 空格 爆发':B.catchHeat?`命中蓄热 · 接球 +${B.catchHeat}`:'命中敌人积攒热度';
// 装填指示器
const free=Math.max(0,B.freeReloads-S.reloadsUsed),over=Math.max(0,S.reloadsUsed-B.freeReloads);$('reloadPips').textContent='●'.repeat(free)+'○'.repeat(B.freeReloads-free);$('reloadInfo').textContent=over>0?`已强行点火 ${over} 次 · −${over*B.igniteCost} 炉心`:S.reloadsUsed===0?`尚未装填 · 免费 ${B.freeReloads} 次`:`本炉第 ${S.reloadsUsed} 次 · 免费剩 ${free}`;
$('next').textContent=B.name+' · '+(S.wave%4===0?'熔铸巨像':'钢铁守卫');var _rem=S.enemies.filter(e=>!e.dead).length;$('waveInfo').textContent=_rem>0?('摧毁全部敌人 ('+_rem+' 剩余)'):('球 '+S.balls.length+' 即将进入下一炉');$('ballList').innerHTML=Object.entries(BALLS).filter(([id])=>id==='ember'||(id==='frost'&&S.ice)||(id==='storm'&&S.lightning)||(id==='ghost'&&S.pierce)||(id==='vampire'&&S.forge.hp)).map(([id,b])=>`<div class="ball-tag"><i style="color:${b.color};background:${b.color}"></i>${b.icon} ${b.name}<em>LV.${S.level}</em></div>`).join('')}
function toast(t){const x=$('toast');x.textContent=t;x.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>x.classList.remove('show'),1500)}
// 爆发闪光在渲染循环里衰减：tick 在 draft/forge/暂停时不执行，否则闪光会永久残留
function loop(t){const dt=Math.min(.033,(t-last)/1000||0);last=t;if(S.novaFlash>0)S.novaFlash=Math.max(0,S.novaFlash-dt);tick(dt);draw();raf=requestAnimationFrame(loop)}
function primaryAction(x){if(S.phase!=='playing'||S.paused)return;if(S.heat>=100)nova();else if(!S.balls.length)launch(x)}
addEventListener('keydown',e=>{if(e.target?.matches?.('select,input,textarea'))return;keys[e.code]=true;if(['Space','ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code))e.preventDefault();
 if(e.code==='Space'&&!e.repeat)primaryAction();
 if(e.code==='Enter'&&!e.repeat){if(S.phase==='menu')$('start').click();else if(S.phase==='forge')$('continue').click()}
 if((e.code==='KeyP'||e.code==='Escape')&&!e.repeat&&S.phase==='playing'){S.paused=!S.paused;$('pause').classList[S.paused?'add':'remove']('active')}
 if(e.code==='KeyR'&&S.phase==='over'){$('gameover').classList.remove('active');reset()}
 if(e.code==='KeyF'&&S.phase==='playing'&&!S.paused){if(S.ore<=0){toast('没有可入库的矿石')}else{meta.vault+=S.ore;S.ore=0;saveMeta();toast('矿石已存入金库，死亡不再丢失');ui()}}
});
addEventListener('keyup',e=>keys[e.code]=false);
addEventListener('blur',()=>{for(const k of Object.keys(keys))keys[k]=false;pointer.down=false});
canvas.addEventListener('pointermove',e=>{pointer.x=e.clientX;pointer.y=e.clientY;if(!S.paused)S.paddle.target=clampPaddle(e.clientX)});
canvas.addEventListener('pointerdown',e=>{pointer.down=true;if(!S.paused)S.paddle.target=clampPaddle(e.clientX);primaryAction(e.clientX)});
addEventListener('pointerup',()=>pointer.down=false);
document.querySelectorAll('#touch button').forEach(b=>{
 b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys[b.dataset.k]=true;if(b.dataset.k==='Space')primaryAction()};
 b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>keys[b.dataset.k]=false;
});
function selectDifficulty(id){if(!Object.hasOwn(BALANCE.modes,id)||(S.phase!=='menu'&&S.phase!=='over'))return false;difficulty=id;B=BALANCE.modes[id];try{localStorage.setItem(DIFFICULTY_KEY,id)}catch{}difficultyUI();ui();return true}
function difficultyUI(){document.querySelectorAll('[data-difficulty]').forEach(el=>el.value=difficulty);const el=$('difficultyInfo');if(el)el.textContent=`${B.name} · 每炉 ${B.freeReloads} 次免费装填 · 超出每次 −${B.igniteCost} 炉心`;
 const stack=$('stackRule');if(stack)stack.textContent=`挡板每接一次球 → 锻打层数 +1（伤害最高 ×${(1+MAX_STACKS*STACK_STEP).toFixed(1)}）`;
 const loss=$('lossRule');if(loss)loss.textContent=`失球保留 ${Math.round(B.singleLossRetention*100)}% 锻打；全失保留 ${Math.round(B.volleyRetention*100)}%`;
 const reload=$('reloadRule');if(reload)reload.textContent=`点击 / 空格装填，每炉 ${B.freeReloads} 次免费；全失后缓冲 ${B.reloadGrace} 秒`;
 const repair=$('repairRule');if(repair)repair.textContent=B.waveHeal?`每炉按击杀修复最多 ${B.waveHeal} 炉心；一轮零泄漏有重赏`:'一轮零泄漏清场 → 完美一轮，矿石重赏';
}
document.querySelectorAll('[data-difficulty]').forEach(el=>el.onchange=()=>selectDifficulty(el.value));difficultyUI();
$('start').onclick=()=>{audio.init();$('menu').classList.remove('active');reset()};$('restart').onclick=()=>{$('gameover').classList.remove('active');reset()};$('sound').onclick=()=>{audio.muted=!audio.muted;$('sound').textContent=audio.muted?'×':'♫'};var pauseBtn=$('pauseBtn');if(pauseBtn)pauseBtn.onclick=()=>{if(S.phase==='playing'){S.paused=!S.paused;$('pause').classList[S.paused?'add':'remove']('active')}};var resumeBtn=$('resumeBtn');if(resumeBtn)resumeBtn.onclick=()=>{S.paused=false;$('pause').classList.remove('active')};ui();draw();raf=requestAnimationFrame(loop);window.__FORGE_DEBUG__={S,meta,reset,launch,nova,saveMeta,forgeMul,comboMul,totalMul,BALANCE,get balance(){return B},get difficulty(){return difficulty},get FREE_RELOADS(){return B.freeReloads},get IGNITE_COST(){return B.igniteCost},MAX_STACKS,selectDifficulty,UPGRADES,clearWave(){for(const e of S.enemies)e.dead=true},grantOre(n){S.ore+=n;ui()},setWave(n){S.wave=n;S.enemies=[];S.balls=[];spawnWave();ui()},setStacks(n){S.stacks=Math.max(0,Math.min(MAX_STACKS,n|0));ui()},fillHeat(){S.heat=100;ui()},step(dt=1/60){tick(dt)}};
})();
