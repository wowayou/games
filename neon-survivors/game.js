/* ============================================================
 * NEON SURVIVORS - game.js
 * 纯前端割草生存游戏，无依赖，无后端
 * 机制：移动躲避 + 自动攻击 + 升级选技能 + 波次推进
 * ============================================================ */
'use strict';

/* ---------- DOM ---------- */
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d', { alpha: false });
const $ = (id) => document.getElementById(id);
const hud = $('hud'), pauseBtn = $('pause-btn');
const titleScreen = $('title-screen'), upgradeScreen = $('upgrade-screen');
const pauseScreen = $('pause-screen'), endScreen = $('end-screen');
const upgradeCards = $('upgrade-cards');
const joystick = $('joystick'), joyBase = $('joystick-base'), joyStick = $('joystick-stick');

/* ---------- Canvas resize ---------- */
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  cvs.width = W * DPR; cvs.height = H * DPR;
  cvs.style.width = W + 'px'; cvs.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
resize();

/* ---------- Util ---------- */
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const len = (x, y) => Math.hypot(x, y);
const TAU = Math.PI * 2;

/* ---------- Input ---------- */
const Input = {
  keys: {}, ptr: { x: 0, y: 0, down: false },
  move: { x: 0, y: 0 }, // normalized -1..1
  touch: false,
};
window.addEventListener('keydown', e => {
  Input.keys[e.key.toLowerCase()] = true;
  if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) e.preventDefault();
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') togglePause();
  if (e.key === 'm' || e.key === 'M') Audio.toggleMute();
});
window.addEventListener('keyup', e => { Input.keys[e.key.toLowerCase()] = false; });

function readKeyboard() {
  let x = 0, y = 0;
  if (Input.keys['a'] || Input.keys['arrowleft']) x -= 1;
  if (Input.keys['d'] || Input.keys['arrowright']) x += 1;
  if (Input.keys['w'] || Input.keys['arrowup']) y -= 1;
  if (Input.keys['s'] || Input.keys['arrowdown']) y += 1;
  const m = len(x, y);
  if (m > 1) { x /= m; y /= m; }
  Input.move.x = x; Input.move.y = y;
}

/* ---- virtual joystick (touch) ---- */
let joyActive = false, joyId = null, joyCenter = { x: 0, y: 0 };
function joyStart(e) {
  const t = e.changedTouches ? e.changedTouches[0] : e;
  joyActive = true; joyId = e.changedTouches ? t.identifier : 'mouse';
  const r = joyBase.getBoundingClientRect();
  joyCenter.x = r.left + r.width / 2; joyCenter.y = r.top + r.height / 2;
  joyMove(e);
}
function joyMove(e) {
  if (!joyActive) return;
  e.preventDefault();
  let t = e;
  if (e.changedTouches) { for (const c of e.changedTouches) if (c.identifier === joyId) { t = c; break; } }
  if (!t) return;
  let dx = t.clientX - joyCenter.x, dy = t.clientY - joyCenter.y;
  const d = len(dx, dy), max = 55;
  if (d > max) { dx = dx / d * max; dy = dy / d * max; }
  joyStick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  Input.move.x = dx / max; Input.move.y = dy / max;
  Input.touch = true;
}
function joyEnd(e) {
  joyActive = false; joyId = null;
  joyStick.style.transform = 'translate(-50%,-50%)';
  Input.move.x = 0; Input.move.y = 0;
}
joyBase.addEventListener('touchstart', joyStart, { passive: false });
joyBase.addEventListener('touchmove', joyMove, { passive: false });
joyBase.addEventListener('touchend', joyEnd);
joyBase.addEventListener('touchcancel', joyEnd);

function isTouchDevice() { return 'ontouchstart' in window || navigator.maxTouchPoints > 0; }

/* ============================================================
 * AUDIO - Web Audio API 合成音效，无外部资源
 * ============================================================ */
const Audio = (() => {
  let ctxA = null, master = null, muted = false;
  function init() {
    if (ctxA) return;
    try {
      ctxA = new (window.AudioContext || window.webkitAudioContext)();
      master = ctxA.createGain(); master.gain.value = 0.32; master.connect(ctxA.destination);
    } catch (e) { ctxA = null; }
  }
  function resume() { if (ctxA && ctxA.state === 'suspended') ctxA.resume(); }
  function tone(freq, dur, type = 'square', vol = 0.3, slide = 0) {
    if (!ctxA || muted) return;
    const t = ctxA.currentTime;
    const osc = ctxA.createOscillator(), g = ctxA.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(master); osc.start(t); osc.stop(t + dur);
  }
  function noise(dur, vol = 0.2, filterFreq = 1200) {
    if (!ctxA || muted) return;
    const t = ctxA.currentTime;
    const buf = ctxA.createBuffer(1, ctxA.sampleRate * dur, ctxA.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctxA.createBufferSource(); src.buffer = buf;
    const filt = ctxA.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = filterFreq;
    const g = ctxA.createGain(); g.gain.value = vol;
    src.connect(filt); filt.connect(g); g.connect(master); src.start(t);
  }
  return {
    init, resume,
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.32; return muted; },
    shoot: () => tone(880, 0.06, 'square', 0.12, -300),
    laser: () => tone(1400, 0.08, 'sawtooth', 0.10, -800),
    hit: () => tone(220, 0.05, 'triangle', 0.15, -80),
    explode: () => { noise(0.18, 0.22, 800); tone(110, 0.18, 'sawtooth', 0.15, -60); },
    pickup: () => { tone(660, 0.07, 'square', 0.14); setTimeout(() => tone(990, 0.07, 'square', 0.14), 50); },
    levelup: () => { tone(523, 0.1, 'triangle', 0.18); setTimeout(() => tone(659, 0.1, 'triangle', 0.18), 80); setTimeout(() => tone(784, 0.15, 'triangle', 0.18), 160); },
    hurt: () => { noise(0.15, 0.3, 600); tone(160, 0.12, 'sawtooth', 0.2, -100); },
    death: () => { tone(440, 0.4, 'sawtooth', 0.25, -380); noise(0.5, 0.3, 400); },
    boss: () => { tone(80, 0.6, 'sawtooth', 0.25); setTimeout(() => tone(60, 0.8, 'sawtooth', 0.2), 100); },
  };
})();

/* ============================================================
 * GAME DATA
 * ============================================================ */

/* ---- Weapons (player auto-attacks) ----
 * Each weapon: { id, name, icon, desc, rarity, color,
 *   maxLevel, fire(player, lv, state) }
 * fire() schedules spawning projectiles via state.spawn(proj)
 */
const WEAPONS = [
  {
    id: 'pulse', name: '脉冲弹', rarity: '普通', color: '#28f7ff',
    maxLevel: 6,
    desc: lv => `追踪最近敌人发射 ${1 + Math.floor(lv / 2)} 发脉冲弹`,
    fire(p, lv, S) {
      const n = 1 + Math.floor(lv / 2);
      const tgt = S.nearestEnemy(p.x, p.y);
      const base = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : p.facing;
      for (let i = 0; i < n; i++) {
        const ang = base + (i - (n - 1) / 2) * 0.18;
        S.spawn({ x: p.x, y: p.y, vx: Math.cos(ang) * 420, vy: Math.sin(ang) * 420,
          r: 6 + lv, dmg: 8 + lv * 3, life: 1.1, color: '#28f7ff', type: 'pulse' });
      }
      Audio.shoot();
    },
    cooldown: lv => 0.42 - lv * 0.03,
  },
  {
    id: 'orbit', name: '轨道光刃', rarity: '普通', color: '#7c5cff',
    maxLevel: 6,
    desc: lv => `${1 + lv}把光刃环绕飞行`,
    fire(p, lv, S) {
      // orbitals managed by player state; here we just refresh count
      S.player.orbitCount = 1 + lv;
      S.player.orbitDmg = 6 + lv * 4;
      S.player.orbitR = 70 + lv * 8;
    },
    cooldown: () => 999, // persistent, not fired on timer
    persistent: true,
  },
  {
    id: 'spread', name: '散射爆', rarity: '稀有', color: '#ff2aa8',
    maxLevel: 5,
    desc: lv => `朝最近敌人扇形射出 ${3 + lv} 发`,
    fire(p, lv, S) {
      const tgt = S.nearestEnemy(p.x, p.y);
      const n = 3 + lv;
      const base = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : p.facing;
      const spread = 0.9;
      for (let i = 0; i < n; i++) {
        const ang = base + (i - (n - 1) / 2) * (spread / n);
        S.spawn({ x: p.x, y: p.y, vx: Math.cos(ang) * 360, vy: Math.sin(ang) * 360,
          r: 5 + lv, dmg: 6 + lv * 2, life: 0.9, color: '#ff2aa8', type: 'spread' });
      }
      Audio.laser();
    },
    cooldown: lv => 0.75 - lv * 0.05,
  },
  {
    id: 'laser', name: '聚焦射线', rarity: '史诗', color: '#ffd24a',
    maxLevel: 5,
    desc: lv => `持续灼烧最近敌人，每秒 ${(10 + lv * 6)} 伤害`,
    fire(p, lv, S) {
      const tgt = S.nearestEnemy(p.x, p.y, 600);
      if (!tgt) return;
      S.player.laserTarget = tgt;
      S.player.laserDmg = 10 + lv * 6;
      S.player.laserActive = true;
    },
    cooldown: () => 999,
    persistent: true,
  },
  {
    id: 'mine', name: '感应雷', rarity: '稀有', color: '#62ecd5',
    maxLevel: 5,
    desc: lv => `每隔片刻在脚下埋雷，引爆 ${40 + lv * 20} 范围伤害`,
    fire(p, lv, S) {
      S.spawn({ x: p.x + rand(-20, 20), y: p.y + rand(-20, 20), vx: 0, vy: 0,
        r: 10, dmg: 0, life: 4, color: '#62ecd5', type: 'mine', mineR: 40 + lv * 20, mineDmg: 30 + lv * 15, armed: 0.4 });
    },
    cooldown: lv => 1.6 - lv * 0.12,
  },
  {
    id: 'boomerang', name: '回旋刃', rarity: '史诗', color: '#ff9b37',
    maxLevel: 5,
    desc: lv => `掷出 ${1 + (lv >= 3 ? 1 : 0)} 把回旋刃，穿透敌人`,
    fire(p, lv, S) {
      const n = 1 + (lv >= 3 ? 1 : 0);
      const base = p.facing;
      for (let i = 0; i < n; i++) {
        const ang = base + (i - (n - 1) / 2) * 0.5;
        S.spawn({ x: p.x, y: p.y, vx: Math.cos(ang) * 260, vy: Math.sin(ang) * 260,
          r: 9 + lv, dmg: 12 + lv * 5, life: 1.8, color: '#ff9b37', type: 'boom',
          px: p.x, py: p.y, t: 0, hitSet: new Set() });
      }
      Audio.laser();
    },
    cooldown: lv => 1.2 - lv * 0.08,
  },
];

const WEAPON_MAP = Object.fromEntries(WEAPONS.map(w => [w.id, w]));

/* ---- Passive upgrades ---- */
const PASSIVES = [
  { id: 'speed', name: '疾步', rarity: '普通', color: '#28f7ff', maxLevel: 5,
    desc: lv => `移动速度 +${lv * 12}%`, apply: (p, lv) => { p.spdMul = 1 + lv * 0.12; } },
  { id: 'hp', name: '强化外壳', rarity: '普通', color: '#62ecd5', maxLevel: 5,
    desc: lv => `最大生命 +${lv * 25}，并回满`, apply: (p, lv) => { p.maxHp = 100 + lv * 25; p.hp = p.maxHp; } },
  { id: 'dmg', name: '攻击强化', rarity: '普通', color: '#ff2aa8', maxLevel: 5,
    desc: lv => `全武器伤害 +${lv * 15}%`, apply: (p, lv) => { p.dmgMul = 1 + lv * 0.15; } },
  { id: 'cd', name: '冷却缩减', rarity: '稀有', color: '#7c5cff', maxLevel: 5,
    desc: lv => `武器冷却 -${lv * 8}%`, apply: (p, lv) => { p.cdMul = 1 - lv * 0.08; } },
  { id: 'pickup', name: '磁吸场', rarity: '稀有', color: '#ffd24a', maxLevel: 3,
    desc: lv => `拾取范围 +${lv * 60}%`, apply: (p, lv) => { p.pickupR = 60 * (1 + lv * 0.6); } },
  { id: 'regen', name: '纳米修复', rarity: '史诗', color: '#62ecd5', maxLevel: 3,
    desc: lv => `每秒恢复 ${lv * 1.5} 生命`, apply: (p, lv) => { p.regen = lv * 1.5; } },
  { id: 'pierce', name: '穿透弹头', rarity: '稀有', color: '#28f7ff', maxLevel: 2,
    desc: lv => `弹道穿透 +${lv} 个敌人`, apply: (p, lv) => { p.pierce = lv; } },
  { id: 'magnet', name: '金币磁铁', rarity: '普通', color: '#ffd24a', maxLevel: 3,
    desc: lv => `金币吸引 +${lv * 100}%`, apply: (p, lv) => { p.goldMul = 1 + lv; } },
];
const PASSIVE_MAP = Object.fromEntries(PASSIVES.map(p => [p.id, p]));

/* ---- Enemy types ---- */
const ENEMY_TYPES = {
  drone: { hp: 12, r: 11, spd: 52, dmg: 8, xp: 3, gold: 1, color: '#ff5577', shape: 'tri' },
  runner: { hp: 8, r: 8, spd: 95, dmg: 6, xp: 4, gold: 1, color: '#ffaa44', shape: 'tri' },
  tank: { hp: 55, r: 16, spd: 32, dmg: 14, xp: 10, gold: 3, color: '#aa44ff', shape: 'square' },
  swarm: { hp: 5, r: 6, spd: 70, dmg: 4, xp: 2, gold: 1, color: '#ff8855', shape: 'tri' },
  shooter: { hp: 18, r: 12, spd: 38, dmg: 10, xp: 8, gold: 2, color: '#55ffaa', shape: 'diamond', ranged: true },
  brute: { hp: 200, r: 24, spd: 26, dmg: 22, xp: 30, gold: 10, color: '#ff2266', shape: 'square', boss: true },
};

/* ============================================================
 * GAME STATE
 * ============================================================ */
const G = {
  state: 'title', // title | playing | paused | upgrade | dead
  time: 0,        // seconds survived
  kills: 0,
  gold: 0,
  level: 1,
  xp: 0,
  xpNeed: 5,
  spawnTimer: 0,
  bossTimer: 60,  // boss every 60s
  waveNum: 0,
  shake: 0,
  flash: 0,
  cam: { x: 0, y: 0 }, // camera offset (world follows player)
  enemies: [],
  projectiles: [],
  particles: [],
  pickups: [],   // xp gems & gold
  floatTexts: [],
  player: null,
};

/* ---- Player factory ---- */
function makePlayer() {
  return {
    x: 0, y: 0, r: 12, facing: 0,
    hp: 100, maxHp: 100,
    spd: 160, spdMul: 1, dmgMul: 1, cdMul: 1,
    pickupR: 60, regen: 0, pierce: 0, goldMul: 1,
    invuln: 0,
    // weapon levels: { weaponId: level }
    weapons: { pulse: 1 },
    weaponTimers: {},
    // orbit
    orbitCount: 0, orbitDmg: 0, orbitR: 70, orbitAngle: 0,
    // laser
    laserActive: false, laserTarget: null, laserDmg: 0, laserTick: 0,
  };
}

/* ---- Spawn helpers (bound to G) ---- */
G.spawn = (p) => G.projectiles.push(p);
G.nearestEnemy = (x, y, maxD = Infinity) => {
  let best = null, bd = maxD * maxD;
  for (const e of G.enemies) {
    const d = dist2(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
};

/* ---- Enemy spawning ---- */
function spawnEnemy(type, x, y) {
  const t = ENEMY_TYPES[type];
  const scale = 1 + G.time * 0.008; // enemies scale gently with time
  G.enemies.push({
    type, x, y, r: t.r, hp: t.hp * scale, maxHp: t.hp * scale,
    spd: t.spd, dmg: t.dmg * scale, xp: t.xp, gold: t.gold,
    color: t.color, shape: t.shape, ranged: t.ranged, boss: t.boss,
    hitFlash: 0, shootTimer: rand(1, 2.5), knockX: 0, knockY: 0,
  });
}

function spawnWave() {
  G.waveNum++;
  const t = G.time;
  // choose enemy types based on time
  let pool = ['drone'];
  if (t > 15) pool.push('runner');
  if (t > 35) pool.push('swarm');
  if (t > 50) pool.push('tank');
  if (t > 80) pool.push('shooter');
  const count = Math.floor(4 + t * 0.18 + G.waveNum * 0.5);
  for (let i = 0; i < count; i++) {
    const ang = rand(0, TAU);
    const d = rand(380, 560);
    spawnEnemy(pick(pool), G.player.x + Math.cos(ang) * d, G.player.y + Math.sin(ang) * d);
  }
}

function spawnBoss() {
  const ang = rand(0, TAU);
  const x = G.player.x + Math.cos(ang) * 500, y = G.player.y + Math.sin(ang) * 500;
  spawnEnemy('brute', x, y);
  G.enemies[G.enemies.length - 1].hp *= (1 + G.time * 0.008);
  G.enemies[G.enemies.length - 1].maxHp = G.enemies[G.enemies.length - 1].hp;
  Audio.boss();
  spawnFloatText(x, y, 'BOSS!', '#ff2266', 24);
  G.flash = 0.5;
}

/* ---- Particles & effects ---- */
function spawnParticles(x, y, color, n, spd, life) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(spd * 0.3, spd);
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      r: rand(1.5, 3.5), life, maxLife: life, color });
  }
}
function spawnFloatText(x, y, text, color, size) {
  G.floatTexts.push({ x, y, text, color, size: size || 12, life: 0.9, maxLife: 0.9, vy: -30 });
}
function spawnPickup(x, y, kind, value) {
  G.pickups.push({ x, y, vx: rand(-40, 40), vy: rand(-40, 40), kind, value, r: kind === 'gold' ? 5 : 4, life: 30, t: 0 });
}

/* ---- Damage to enemy ---- */
function damageEnemy(e, dmg, srcX, srcY) {
  e.hp -= dmg;
  e.hitFlash = 0.12;
  if (srcX !== undefined) {
    const d = len(e.x - srcX, e.y - srcY) || 1;
    e.knockX += (e.x - srcX) / d * 30;
    e.knockY += (e.y - srcY) / d * 30;
  }
  if (e.hp <= 0 && !e.dead) {
    e.dead = true;
    G.kills++;
    spawnParticles(e.x, e.y, e.color, e.boss ? 30 : 12, e.boss ? 200 : 120, e.boss ? 0.8 : 0.5);
    spawnPickup(e.x, e.y, 'xp', e.xp);
    if (e.gold > 0) spawnPickup(e.x, e.y, 'gold', e.gold);
    if (e.boss) { Audio.explode(); G.shake = 0.5; G.flash = 0.3; spawnFloatText(e.x, e.y, '+' + e.xp + ' XP', '#ffd24a', 18); }
    else Audio.hit();
  }
}

/* ============================================================
 * UPDATE
 * ============================================================ */
function updatePlayer(dt) {
  const p = G.player;
  // movement
  if (G.state === 'playing') {
    if (!Input.touch) readKeyboard();
    const mx = Input.move.x, my = Input.move.y;
    const spd = p.spd * p.spdMul;
    p.x += mx * spd * dt;
    p.y += my * spd * dt;
    if (mx || my) p.facing = Math.atan2(my, mx);
  }
  // camera follows player (centered)
  G.cam.x = lerp(G.cam.x, p.x - W / 2, 0.12);
  G.cam.y = lerp(G.cam.y, p.y - H / 2, 0.12);

  // regen
  if (p.regen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
  // invuln
  if (p.invuln > 0) p.invuln -= dt;

  // weapon firing
  if (G.state === 'playing') {
    for (const wid in p.weapons) {
      const lv = p.weapons[wid];
      const w = WEAPON_MAP[wid];
      if (!w) continue;
      p.weaponTimers[wid] = (p.weaponTimers[wid] || 0) - dt;
      if (w.persistent) {
        // persistent weapons: apply every frame (orbit angle, laser target)
        if (wid === 'laser') { if (p.weaponTimers[wid] <= 0) { w.fire(p, lv, G); p.weaponTimers[wid] = 0.1; } }
        else if (p.weaponTimers[wid] <= 0) { w.fire(p, lv, G); p.weaponTimers[wid] = 999; }
        continue;
      }
      const cd = w.cooldown(lv) * p.cdMul;
      if (p.weaponTimers[wid] <= 0) {
        w.fire(p, lv, G);
        p.weaponTimers[wid] = cd;
      }
    }
  }

  // orbit weapons
  if (p.orbitCount > 0) {
    p.orbitAngle += dt * 3;
    for (let i = 0; i < p.orbitCount; i++) {
      const a = p.orbitAngle + (i / p.orbitCount) * TAU;
      const ox = p.x + Math.cos(a) * p.orbitR, oy = p.y + Math.sin(a) * p.orbitR;
      for (const e of G.enemies) {
        if (e.dead) continue;
        if (dist2(ox, oy, e.x, e.y) < (e.r + 12) ** 2) {
          damageEnemy(e, p.orbitDmg * p.dmgMul * dt * 3, ox, oy);
        }
      }
    }
  }

  // laser
  if (p.laserActive && p.laserTarget && !p.laserTarget.dead) {
    p.laserTick -= dt;
    if (p.laserTick <= 0) {
      damageEnemy(p.laserTarget, p.laserDmg * p.dmgMul, p.x, p.y);
      p.laserTick = 0.15;
      spawnParticles(p.laserTarget.x, p.laserTarget.y, '#ffd24a', 3, 80, 0.3);
    }
  } else { p.laserActive = false; }
}

function updateEnemies(dt) {
  const p = G.player;
  for (const e of G.enemies) {
    if (e.dead) continue;
    // move toward player
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = len(dx, dy) || 1;
    e.x += (dx / d) * e.spd * dt + e.knockX * dt;
    e.y += (dy / d) * e.spd * dt + e.knockY * dt;
    e.knockX *= 0.88; e.knockY *= 0.88;
    if (e.hitFlash > 0) e.hitFlash -= dt;

    // ranged enemies shoot
    if (e.ranged) {
      e.shootTimer -= dt;
      if (e.shootTimer <= 0 && d < 450) {
        e.shootTimer = rand(1.5, 3);
        G.projectiles.push({ x: e.x, y: e.y, vx: (dx / d) * 150, vy: (dy / d) * 150,
          r: 6, dmg: e.dmg * 0.6, life: 3, color: '#55ffaa', type: 'enemy', hostile: true });
      }
    }

    // contact damage to player
    if (dist2(e.x, e.y, p.x, p.y) < (e.r + p.r) ** 2) {
      if (p.invuln <= 0) {
        p.hp -= e.dmg;
        p.invuln = 0.6;
        G.shake = 0.3;
        G.flash = 0.2;
        Audio.hurt();
        spawnFloatText(p.x, p.y - 20, '-' + Math.round(e.dmg), '#ff4466', 14);
        if (p.hp <= 0) { p.hp = 0; gameOver(); }
      }
    }
  }
  // remove dead
  G.enemies = G.enemies.filter(e => !e.dead);
}

function updateProjectiles(dt) {
  const p = G.player;
  for (const pr of G.projectiles) {
    if (pr.dead) continue;
    pr.life -= dt;
    if (pr.life <= 0) { pr.dead = true; continue; }

    if (pr.type === 'boom') {
      // boomerang: go out then return
      pr.t = (pr.t || 0) + dt;
      const phase = pr.t / 1.8;
      if (phase < 0.5) {
        // outward
        pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      } else {
        // return to player
        const dx = p.x - pr.x, dy = p.y - pr.y, d = len(dx, dy) || 1;
        pr.x += (dx / d) * 320 * dt; pr.y += (dy / d) * 320 * dt;
        if (d < 20) pr.dead = true;
      }
    } else if (pr.type === 'mine') {
      pr.armed -= dt;
      if (pr.armed <= 0) {
        // check nearby enemies
        let hit = false;
        for (const e of G.enemies) {
          if (e.dead) continue;
          if (dist2(pr.x, pr.y, e.x, e.y) < (pr.mineR + e.r) ** 2) { hit = true; break; }
        }
        if (hit || pr.life < 0.2) {
          pr.dead = true;
          // explode
          for (const e of G.enemies) {
            if (e.dead) continue;
            const d2 = dist2(pr.x, pr.y, e.x, e.y);
            if (d2 < pr.mineR * pr.mineR) {
              damageEnemy(e, pr.mineDmg * p.dmgMul, pr.x, pr.y);
            }
          }
          spawnParticles(pr.x, pr.y, '#62ecd5', 20, 180, 0.5);
          Audio.explode();
          G.shake = 0.2;
        }
      }
    } else {
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    }

    if (pr.hostile) {
      // enemy projectile hits player
      if (dist2(pr.x, pr.y, p.x, p.y) < (pr.r + p.r) ** 2) {
        pr.dead = true;
        if (p.invuln <= 0) {
          p.hp -= pr.dmg; p.invuln = 0.4; G.shake = 0.2; Audio.hurt();
          if (p.hp <= 0) { p.hp = 0; gameOver(); }
        }
      }
      continue;
    }

    // player projectile hits enemies
    if (pr.type !== 'mine' && pr.type !== 'boom' && !pr.hitSet) pr.hitSet = new Set();
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (pr.hitSet && pr.hitSet.has(e)) continue;
      if (dist2(pr.x, pr.y, e.x, e.y) < (pr.r + e.r) ** 2) {
        damageEnemy(e, pr.dmg * p.dmgMul, pr.x, pr.y);
        if (pr.type === 'boom') { pr.hitSet.add(e); }
        else if (p.pierce > 0 && pr.hitSet.size < p.pierce + 1) { pr.hitSet.add(e); }
        else { pr.dead = true; break; }
      }
    }
  }
  G.projectiles = G.projectiles.filter(p => !p.dead);
}

function updatePickups(dt) {
  const p = G.player;
  for (const pk of G.pickups) {
    pk.t += dt; pk.life -= dt;
    if (pk.life <= 0) { pk.dead = true; continue; }
    // initial scatter
    pk.x += pk.vx * dt; pk.y += pk.vy * dt;
    pk.vx *= 0.9; pk.vy *= 0.9;
    // attraction
    const d2 = dist2(pk.x, pk.y, p.x, p.y);
    const attractR = pk.kind === 'gold' ? p.pickupR * (1 + p.goldMul * 0.3) : p.pickupR;
    if (d2 < attractR * attractR) {
      const d = Math.sqrt(d2) || 1;
      const pull = 200 + (1 - d / attractR) * 400;
      pk.x += (p.x - pk.x) / d * pull * dt;
      pk.y += (p.y - pk.y) / d * pull * dt;
    }
    // collect
    if (d2 < (p.r + pk.r + 4) ** 2) {
      pk.dead = true;
      if (pk.kind === 'xp') { gainXP(pk.value); }
      else { G.gold += pk.value * p.goldMul | 0; spawnFloatText(pk.x, pk.y, '+' + (pk.value * p.goldMul | 0), '#ffd24a', 11); }
      Audio.pickup();
    }
  }
  G.pickups = G.pickups.filter(p => !p.dead);
}

function updateParticles(dt) {
  for (const pt of G.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.vx *= 0.94; pt.vy *= 0.94;
  }
  G.particles = G.particles.filter(p => p.life > 0);
  for (const ft of G.floatTexts) {
    ft.life -= dt; ft.y += ft.vy * dt; ft.vy *= 0.92;
  }
  G.floatTexts = G.floatTexts.filter(f => f.life > 0);
}

/* ---- XP & leveling ---- */
function gainXP(amt) {
  G.xp += amt;
  while (G.xp >= G.xpNeed) {
    G.xp -= G.xpNeed;
    G.level++;
    G.xpNeed = Math.floor(G.xpNeed * 1.35 + 2);
    offerUpgrades();
  }
}

/* ============================================================
 * UPGRADE SYSTEM
 * ============================================================ */
function offerUpgrades() {
  const p = G.player;
  const options = [];
  // existing weapons: level up or new weapons
  for (const w of WEAPONS) {
    const cur = p.weapons[w.id] || 0;
    if (cur === 0) {
      // new weapon (only if < 4 weapons owned, and weight by rarity)
      if (Object.keys(p.weapons).length < 5) options.push({ kind: 'weapon', id: w.id, lv: 1 });
    } else if (cur < w.maxLevel) {
      options.push({ kind: 'weapon', id: w.id, lv: cur + 1 });
    }
  }
  // passives
  for (const ps of PASSIVES) {
    const cur = p.passives?.[ps.id] || 0;
    if (cur < ps.maxLevel) options.push({ kind: 'passive', id: ps.id, lv: cur + 1 });
  }
  if (!p.passives) p.passives = {};

  // pick 3 random
  const shuffled = options.sort(() => Math.random() - 0.5).slice(0, 3);
  if (shuffled.length === 0) {
    // fallback: heal
    shuffled.push({ kind: 'heal', id: 'heal', lv: 1 });
  }

  upgradeCards.innerHTML = '';
  for (const opt of shuffled) {
    let name, desc, color, rarity, iconSvg, lvLabel;
    if (opt.kind === 'weapon') {
      const w = WEAPON_MAP[opt.id];
      name = w.name; color = w.color; rarity = w.rarity;
      desc = w.desc(opt.lv); iconSvg = weaponIcon(opt.id, color);
      lvLabel = p.weapons[opt.id] ? 'Lv ' + p.weapons[opt.id] + '→' + opt.lv : '新！';
    } else if (opt.kind === 'passive') {
      const ps = PASSIVE_MAP[opt.id];
      name = ps.name; color = ps.color; rarity = ps.rarity;
      desc = ps.desc(opt.lv); iconSvg = passiveIcon(opt.id, color);
      lvLabel = (p.passives[opt.id] || 0) > 0 ? 'Lv ' + (p.passives[opt.id] || 0) + '→' + opt.lv : '新！';
    } else {
      name = '紧急修复'; color = '#62ecd5'; rarity = '特殊';
      desc = '回复 50% 最大生命'; iconSvg = healIcon(); lvLabel = '';
    }
    const card = document.createElement('div');
    card.className = 'card';
    card.style.borderColor = color + '66';
    card.innerHTML = `<div class="card-icon">${iconSvg}</div>
      <div class="card-name" style="color:${color}">${name}</div>
      <div class="rarity" style="color:${rarityColor(rarity)}">${rarity}</div>
      <div class="card-desc">${desc}</div>
      ${lvLabel ? `<div class="level">${lvLabel}</div>` : ''}`;
    card.onclick = () => chooseUpgrade(opt);
    upgradeCards.appendChild(card);
  }

  G.state = 'upgrade';
  upgradeScreen.classList.remove('hidden');
}

function rarityColor(r) {
  return r === '史诗' ? '#ffd24a' : r === '稀有' ? '#7c5cff' : '#5a7aa8';
}

function chooseUpgrade(opt) {
  const p = G.player;
  if (opt.kind === 'weapon') {
    p.weapons[opt.id] = opt.lv;
    p.weaponTimers[opt.id] = 0;
  } else if (opt.kind === 'passive') {
    p.passives[opt.id] = opt.lv;
    PASSIVE_MAP[opt.id].apply(p, opt.lv);
  } else if (opt.kind === 'heal') {
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.5);
  }
  Audio.levelup();
  upgradeScreen.classList.add('hidden');
  G.state = 'playing';
}

/* ---- weapon icons (inline SVG) ---- */
function weaponIcon(id, c) {
  const icons = {
    pulse: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="6" fill="${c}"/><circle cx="20" cy="20" r="12" fill="none" stroke="${c}" stroke-width="1.5" opacity=".5"/></svg>`,
    orbit: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="3" fill="${c}"/><circle cx="20" cy="20" r="14" fill="none" stroke="${c}" stroke-width="1.5" opacity=".4"/><circle cx="34" cy="20" r="4" fill="${c}"/><circle cx="6" cy="20" r="4" fill="${c}"/></svg>`,
    spread: `<svg viewBox="0 0 40 40"><path d="M8 20 L32 12 M8 20 L34 20 M8 20 L32 28" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/></svg>`,
    laser: `<svg viewBox="0 0 40 40"><circle cx="10" cy="20" r="4" fill="${c}"/><rect x="14" y="18" width="20" height="4" fill="${c}" opacity=".7"/></svg>`,
    mine: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="5" fill="${c}"/><path d="M20 8 v-4 M20 36 v-4 M8 20 h-4 M36 20 h-4 M11 11 l-3-3 M29 29 l3 3 M29 11 l3-3 M11 29 l-3 3" stroke="${c}" stroke-width="2"/></svg>`,
    boom: `<svg viewBox="0 0 40 40"><path d="M20 6 Q30 14 30 20 Q30 26 20 34 Q10 26 10 20 Q10 14 20 6 Z" fill="${c}" opacity=".8"/></svg>`,
  };
  return icons[id] || icons.pulse;
}
function passiveIcon(id, c) {
  const icons = {
    speed: `<svg viewBox="0 0 40 40"><path d="M14 6 L8 20 L16 20 L12 34 L26 16 L18 16 L24 6 Z" fill="${c}"/></svg>`,
    hp: `<svg viewBox="0 0 40 40"><path d="M20 34 L8 20 Q4 14 8 10 Q12 6 16 10 L20 14 L24 10 Q28 6 32 10 Q36 14 32 20 Z" fill="${c}"/></svg>`,
    dmg: `<svg viewBox="0 0 40 40"><path d="M20 4 L24 16 L36 20 L24 24 L20 36 L16 24 L4 20 L16 16 Z" fill="${c}"/></svg>`,
    cd: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="14" fill="none" stroke="${c}" stroke-width="2.5"/><path d="M20 10 L20 20 L28 24" stroke="${c}" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`,
    pickup: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="6" fill="${c}"/><circle cx="20" cy="20" r="13" fill="none" stroke="${c}" stroke-width="1.5" stroke-dasharray="3 2" opacity=".5"/></svg>`,
    regen: `<svg viewBox="0 0 40 40"><rect x="18" y="6" width="4" height="28" fill="${c}"/><rect x="6" y="18" width="28" height="4" fill="${c}"/></svg>`,
    pierce: `<svg viewBox="0 0 40 40"><path d="M4 20 L36 20" stroke="${c}" stroke-width="3" stroke-linecap="round"/><circle cx="14" cy="20" r="3" fill="${c}"/><circle cx="26" cy="20" r="3" fill="${c}"/></svg>`,
    magnet: `<svg viewBox="0 0 40 40"><path d="M8 8 L8 20 Q8 28 16 28 Q24 28 24 20 L24 8 M24 8 L32 8 L32 20 Q32 32 16 32 Q0 32 0 20 L0 8 Z" fill="${c}" opacity=".85"/></svg>`,
  };
  return icons[id] || icons.dmg;
}
function healIcon() {
  return `<svg viewBox="0 0 40 40"><path d="M20 34 L8 20 Q4 14 8 10 Q12 6 16 10 L20 14 L24 10 Q28 6 32 10 Q36 14 32 20 Z" fill="#62ecd5"/><rect x="18" y="14" width="4" height="12" fill="#fff"/><rect x="13" y="18" width="14" height="4" fill="#fff"/></svg>`;
}

/* ============================================================
 * GAME FLOW
 * ============================================================ */
function startGame() {
  Audio.init(); Audio.resume();
  G.state = 'playing';
  G.time = 0; G.kills = 0; G.gold = 0;
  G.level = 1; G.xp = 0; G.xpNeed = 5;
  G.spawnTimer = 1; G.bossTimer = 60; G.waveNum = 0;
  G.enemies = []; G.projectiles = []; G.particles = [];
  G.pickups = []; G.floatTexts = [];
  G.shake = 0; G.flash = 0; G.cam = { x: 0, y: 0 };
  G.player = makePlayer();
  G.player.x = 0; G.player.y = 0;
  G.cam.x = -W / 2; G.cam.y = -H / 2;
  titleScreen.classList.add('hidden');
  endScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  pauseBtn.classList.remove('hidden');
  if (isTouchDevice()) joystick.classList.remove('hidden');
  spawnWave();
}

function togglePause() {
  if (G.state === 'playing') {
    G.state = 'paused';
    pauseScreen.classList.remove('hidden');
  } else if (G.state === 'paused') {
    G.state = 'playing';
    pauseScreen.classList.add('hidden');
  }
}

function gameOver() {
  if (G.state === 'dead') return;
  G.state = 'dead';
  Audio.death();
  G.shake = 0.6; G.flash = 0.5;
  const mins = Math.floor(G.time / 60), secs = Math.floor(G.time % 60);
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
  // best time in localStorage
  let best = 0;
  try { best = parseFloat(localStorage.getItem('neon-survivors-best') || '0'); } catch (e) {}
  const isBest = G.time > best;
  if (isBest) { try { localStorage.setItem('neon-survivors-best', G.time.toString()); } catch (e) {} }
  const stats = $('end-stats');
  const rows = [
    ['生存时间', timeStr],
    ['击杀数', G.kills],
    ['等级', G.level],
    ['金币', G.gold],
    ['武器数', Object.keys(G.player.weapons).length],
  ];
  stats.innerHTML = rows.map(([k, v]) => `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')
    + (isBest ? `<div class="row best"><span class="k">新纪录！</span><span class="v">${timeStr}</span></div>` : '');
  setTimeout(() => endScreen.classList.remove('hidden'), 800);
}

function showBestTime() {
  let best = 0;
  try { best = parseFloat(localStorage.getItem('neon-survivors-best') || '0'); } catch (e) {}
  if (best > 0) {
    const m = Math.floor(best / 60), s = Math.floor(best % 60);
    $('best-time').textContent = `最佳生存：${m}:${s.toString().padStart(2, '0')}`;
  }
}

function shareResult() {
  const mins = Math.floor(G.time / 60), secs = Math.floor(G.time % 60);
  const text = `我在《霓虹幸存者 NEON SURVIVORS》生存了 ${mins}:${secs.toString().padStart(2, '0')}，击杀 ${G.kills} 敌，达到 ${G.level} 级！来挑战我：https://wowayou.github.io/games/neon-survivors/`;
  if (navigator.share) {
    navigator.share({ title: '霓虹幸存者', text, url: 'https://wowayou.github.io/games/neon-survivors/' }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(text).then(() => {
      spawnFloatText(W / 2, H / 2, '已复制到剪贴板', '#28f7ff', 16);
    }).catch(() => {});
  }
}

/* ---- main update ---- */
function update(dt) {
  if (G.state !== 'playing') return;
  G.time += dt;
  G.spawnTimer -= dt;
  G.bossTimer -= dt;

  // wave spawning
  if (G.spawnTimer <= 0) {
    spawnWave();
    G.spawnTimer = Math.max(3, 8 - G.time * 0.03);
  }
  // boss
  if (G.bossTimer <= 0) {
    spawnBoss();
    G.bossTimer = 60;
  }

  updatePlayer(dt);
  updateEnemies(dt);
  updateProjectiles(dt);
  updatePickups(dt);

  // decay effects
  if (G.shake > 0) G.shake -= dt * 2;
  if (G.flash > 0) G.flash -= dt * 2.5;

  // HUD update
  const m = Math.floor(G.time / 60), s = Math.floor(G.time % 60);
  $('hud-time').textContent = `${m}:${s.toString().padStart(2, '0')}`;
  $('hud-level').textContent = G.level;
  $('hud-kills').textContent = G.kills;
  $('hud-gold').textContent = G.gold;
  $('hud-xp').style.width = (G.xp / G.xpNeed * 100) + '%';
}

/* ============================================================
 * RENDER
 * ============================================================ */
function render() {
  // background: dark with grid
  ctx.save();
  ctx.fillStyle = '#05050d';
  ctx.fillRect(0, 0, W, H);

  // screen shake
  let sx = 0, sy = 0;
  if (G.shake > 0) { sx = rand(-1, 1) * G.shake * 12; sy = rand(-1, 1) * G.shake * 12; }

  if (G.state === 'title') { renderStars(); ctx.restore(); return; }

  ctx.translate(sx, sy);

  const cam = G.cam;
  ctx.translate(-cam.x, -cam.y);

  // world grid
  renderGrid(cam);

  // pickups
  for (const pk of G.pickups) {
    const alpha = pk.life < 3 ? pk.life / 3 : 1;
    ctx.globalAlpha = alpha;
    if (pk.kind === 'xp') {
      ctx.fillStyle = '#7c5cff';
      ctx.beginPath();
      ctx.arc(pk.x, pk.y, pk.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#28f7ff';
      ctx.beginPath();
      ctx.arc(pk.x, pk.y, pk.r * 0.5, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath();
      ctx.arc(pk.x, pk.y, pk.r, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // enemies
  for (const e of G.enemies) {
    drawEnemy(e);
  }

  // player projectiles
  for (const pr of G.projectiles) {
    if (pr.hostile) {
      ctx.fillStyle = pr.color;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.r, 0, TAU);
      ctx.fill();
      continue;
    }
    if (pr.type === 'mine') {
      const blink = pr.armed > 0 ? (Math.sin(G.time * 20) > 0 ? 1 : 0.3) : 1;
      ctx.globalAlpha = blink;
      ctx.fillStyle = pr.color;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.r, 0, TAU);
      ctx.fill();
      // ring
      ctx.strokeStyle = pr.color;
      ctx.globalAlpha = blink * 0.3;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.mineR, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = pr.color;
      ctx.shadowColor = pr.color; ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.r, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // laser beam
  const p = G.player;
  if (p && p.laserActive && p.laserTarget && !p.laserTarget.dead) {
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 3 + Math.sin(G.time * 30) * 1;
    ctx.shadowColor = '#ffd24a'; ctx.shadowBlur = 12;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.laserTarget.x, p.laserTarget.y);
    ctx.stroke();
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }

  // player
  if (p) drawPlayer(p);

  // orbit weapons
  if (p && p.orbitCount > 0) {
    for (let i = 0; i < p.orbitCount; i++) {
      const a = p.orbitAngle + (i / p.orbitCount) * TAU;
      const ox = p.x + Math.cos(a) * p.orbitR, oy = p.y + Math.sin(a) * p.orbitR;
      ctx.fillStyle = '#7c5cff';
      ctx.shadowColor = '#7c5cff'; ctx.shadowBlur = 10;
      ctx.beginPath();
      // blade shape
      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -8); ctx.lineTo(4, 6); ctx.lineTo(-4, 6); ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.shadowBlur = 0;
    }
  }

  // particles
  for (const pt of G.particles) {
    ctx.globalAlpha = pt.life / pt.maxLife;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // float texts
  for (const ft of G.floatTexts) {
    ctx.globalAlpha = ft.life / ft.maxLife;
    ctx.fillStyle = ft.color;
    ctx.font = `900 ${ft.size}px Orbitron`;
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, ft.x, ft.y);
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  // flash overlay
  if (G.flash > 0) {
    ctx.fillStyle = `rgba(255,40,120,${G.flash * 0.3})`;
    ctx.fillRect(0, 0, W, H);
  }

  // vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function renderGrid(cam) {
  const grid = 80;
  const x0 = Math.floor(cam.x / grid) * grid;
  const y0 = Math.floor(cam.y / grid) * grid;
  const cols = Math.ceil(W / grid) + 2, rows = Math.ceil(H / grid) + 2;
  ctx.strokeStyle = '#ffffff08';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= cols; i++) {
    const x = x0 + i * grid;
    ctx.moveTo(x, cam.y); ctx.lineTo(x, cam.y + rows * grid);
  }
  for (let j = 0; j <= rows; j++) {
    const y = y0 + j * grid;
    ctx.moveTo(cam.x, y); ctx.lineTo(cam.x + cols * grid, y);
  }
  ctx.stroke();
}

// starfield for title
let stars = [];
function renderStars() {
  if (stars.length === 0) for (let i = 0; i < 120; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.5, s: Math.random() * 0.3 + 0.1 });
  ctx.fillStyle = '#05050d';
  ctx.fillRect(0, 0, W, H);
  for (const st of stars) {
    st.y += st.s; if (st.y > H) { st.y = 0; st.x = Math.random() * W; }
    ctx.globalAlpha = 0.4 + Math.sin(G.time * 2 + st.x) * 0.3;
    ctx.fillStyle = '#28f7ff';
    ctx.fillRect(st.x, st.y, st.r, st.r);
  }
  ctx.globalAlpha = 1;
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const flash = e.hitFlash > 0;
  const col = flash ? '#ffffff' : e.color;
  ctx.fillStyle = col;
  ctx.shadowColor = e.color; ctx.shadowBlur = e.boss ? 20 : 8;
  if (e.shape === 'tri') {
    const ang = Math.atan2(G.player.y - e.y, G.player.x - e.x);
    ctx.rotate(ang + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -e.r); ctx.lineTo(e.r * 0.85, e.r * 0.7); ctx.lineTo(-e.r * 0.85, e.r * 0.7);
    ctx.closePath(); ctx.fill();
  } else if (e.shape === 'square') {
    ctx.rotate(G.time);
    ctx.fillRect(-e.r, -e.r, e.r * 2, e.r * 2);
  } else { // diamond
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-e.r, -e.r, e.r * 2, e.r * 2);
  }
  ctx.shadowBlur = 0;
  ctx.restore();

  // HP bar for tanks/bosses
  if (e.boss || e.type === 'tank') {
    const w = e.r * 2, h = 3;
    const ratio = e.hp / e.maxHp;
    ctx.fillStyle = '#0008';
    ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w, h);
    ctx.fillStyle = e.boss ? '#ff2266' : '#aa44ff';
    ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w * ratio, h);
  }
}

function drawPlayer(p) {
  ctx.save();
  // invuln flicker
  if (p.invuln > 0 && Math.floor(G.time * 20) % 2 === 0) ctx.globalAlpha = 0.4;
  ctx.translate(p.x, p.y);
  ctx.rotate(p.facing);
  // body: arrow/ship shape
  ctx.fillStyle = '#28f7ff';
  ctx.shadowColor = '#28f7ff'; ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(p.r, 0);
  ctx.lineTo(-p.r * 0.7, p.r * 0.7);
  ctx.lineTo(-p.r * 0.4, 0);
  ctx.lineTo(-p.r * 0.7, -p.r * 0.7);
  ctx.closePath();
  ctx.fill();
  // core
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, p.r * 0.3, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  // HP bar above player
  const w = 36, h = 4;
  ctx.fillStyle = '#0008';
  ctx.fillRect(p.x - w / 2, p.y - p.r - 12, w, h);
  const ratio = p.hp / p.maxHp;
  ctx.fillStyle = ratio > 0.5 ? '#62ecd5' : ratio > 0.25 ? '#ffd24a' : '#ff4466';
  ctx.fillRect(p.x - w / 2, p.y - p.r - 12, w * ratio, h);
}

/* ============================================================
 * MAIN LOOP
 * ============================================================ */
let lastT = performance.now();
function loop(now) {
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.1) dt = 0.1; // clamp for tab switch
  // always advance time for title stars
  if (G.state === 'title') G.time += dt;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

/* ============================================================
 * EVENT WIRING
 * ============================================================ */
$('start-btn').onclick = startGame;
$('end-restart-btn').onclick = startGame;
$('end-share-btn').onclick = shareResult;
$('resume-btn').onclick = togglePause;
$('restart-btn').onclick = () => { pauseScreen.classList.add('hidden'); startGame(); };
pauseBtn.onclick = togglePause;
showBestTime();
requestAnimationFrame(loop);

/* ---- Debug API for smoke testing ---- */
window.__NS__ = {
  G, startGame, togglePause,
  get state() { return { state: G.state, time: G.time, kills: G.kills, level: G.level,
    enemies: G.enemies.length, projectiles: G.projectiles.length, weapons: G.player ? Object.keys(G.player.weapons) : [] }; },
  forceLevelUp: () => { if (G.player) { G.xp = G.xpNeed; gainXP(0); } },
  spawnEnemyAt: (type, x, y) => spawnEnemy(type, x || 100, y || 0),
};
