// 球权轮次（Volley）机制测试。零依赖：用最小 DOM/Canvas stub 在 Node 中直接执行 game.js。
import { readFile } from 'node:fs/promises';
import { reporter } from './cdp.mjs';

const { check, finish } = reporter();

// ---- 最小 DOM / Canvas stub ----
function makeEl(id) {
  const el = {
    id, textContent: '', innerHTML: '', style: {}, dataset: {},
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    addEventListener() {}, click() { this.onclick?.(); }, onclick: null,
    getContext: () => ctxStub,
  };
  return el;
}
const ctxStub = new Proxy({}, {
  get: (_t, k) => {
    if (k === 'canvas') return { width: 1280, height: 860 };
    if (k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return () => ({ width: 10 });
    return () => {};
  },
  set: () => true,
});
const els = new Map();
const getEl = (id) => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); };

globalThis.window = globalThis;
globalThis.innerWidth = 1280;
globalThis.innerHeight = 860;
globalThis.devicePixelRatio = 1;
globalThis.performance = { now: () => 0 };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.setInterval = () => 0;
globalThis.addEventListener = () => {};
globalThis.localStorage = { _d: new Map(), getItem(k) { return this._d.get(k) ?? null; }, setItem(k, v) { this._d.set(k, String(v)); }, removeItem(k) { this._d.delete(k); } };
globalThis.document = {
  getElementById: getEl,
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener: () => {},
};
globalThis.AudioContext = undefined;
globalThis.webkitAudioContext = undefined;

const src = await readFile(new URL('./game.js', import.meta.url), 'utf8');
try {
  new Function(src)();
} catch (e) {
  check('game.js executes in stub environment', false, String(e));
  finish();
  process.exit();
}

const D = globalThis.__FORGE_DEBUG__;
check('Debug API exposed', !!D && !!D.S);
const { S, FREE_RELOADS, IGNITE_COST, MAX_STACKS } = D;

// ---- 1. 初始球数降为 2 ----
D.reset();
check('Wave resets reload counter', S.reloadsUsed === 0 && S.stacks === 0);
D.launch();
check('Initial volley fires 2 balls', S.balls.length === 2, { balls: S.balls.length, multiball: S.multiball });

// ---- 2. 锻打倍率公式 ----
D.setStacks(0);
check('Forge multiplier starts at x1.0', D.forgeMul() === 1);
D.setStacks(10);
check('10 stacks -> x3.0', Math.abs(D.forgeMul() - 3) < 1e-9, { mul: D.forgeMul() });
D.setStacks(MAX_STACKS);
check('Max stacks -> x6.0 cap', Math.abs(D.forgeMul() - 6) < 1e-9, { mul: D.forgeMul() });
D.setStacks(MAX_STACKS + 50);
check('Stacks cannot exceed cap', S.stacks === MAX_STACKS && Math.abs(D.forgeMul() - 6) < 1e-9);

// ---- 3. 装填计费：免费 N 次，之后扣炉心 ----
D.reset();
const hp0 = S.hp;
for (let i = 0; i < FREE_RELOADS; i++) { S.balls = []; D.launch(); }
check(`First ${FREE_RELOADS} reloads are free`, S.hp === hp0 && S.reloadsUsed === FREE_RELOADS, { hp: S.hp, used: S.reloadsUsed });
S.balls = [];
D.launch();
check('Reload beyond free tier costs core HP', S.hp === hp0 - IGNITE_COST, { hp: S.hp, expected: hp0 - IGNITE_COST });
S.balls = [];
D.launch();
check('Each extra reload keeps charging', S.hp === hp0 - IGNITE_COST * 2, { hp: S.hp });

// ---- 4. 熔炉爆发 ----
D.reset();
D.launch();
S.heat = 0;
check('Nova blocked when heat is not full', D.nova() === false);
const enemiesBefore = S.enemies.filter((e) => !e.dead).length;
const hpSum = (arr) => arr.filter((e) => !e.dead).reduce((a, e) => a + e.hp, 0);
D.setStacks(MAX_STACKS);
D.fillHeat();
const totalHpBefore = hpSum(S.enemies);
const fired = D.nova();
const totalHpAfter = hpSum(S.enemies);
check('Nova fires when heat is full', fired === true);
check('Nova damages the whole field', totalHpAfter < totalHpBefore || S.enemies.every((e) => e.dead), { before: totalHpBefore, after: totalHpAfter, enemies: enemiesBefore });
check('Nova consumes all heat', S.heat === 0, { heat: S.heat });

// ---- 5. 爆发不触发 brood 溅射（防止球数爆炸）----
D.reset();
D.launch();
S.fusion.brood = true;
const ballsBeforeNova = S.balls.length;
D.fillHeat();
D.nova();
check('Nova does not spawn brood balls', S.balls.length === ballsBeforeNova, { before: ballsBeforeNova, after: S.balls.length });

// ---- 6. 总倍率 = 锻打 x 连击 ----
D.setStacks(10);
S.combo = 45;
check('Total multiplier = forge x combo', Math.abs(D.totalMul() - 3 * 2) < 1e-9, { total: D.totalMul(), forge: D.forgeMul(), combo: D.comboMul() });

// ---- 7. tick 路径：接球叠层 ----
const H = globalThis.innerHeight;
// 远处的高血量假敌人：维持波次不被判定清场（否则 tick 会立刻切到 draft）
const dummy = () => [{ x: 10, y: 105, w: 40, h: 30, hp: 9e9, max: 9e9, row: 0, kind: 'normal', frozen: 0, burn: 0, angle: 0, dead: false }];
D.reset();
S.enemies = dummy();
S.paddle.x = S.paddle.target = 640;
S.stacks = 0;
// 放一颗球在挡板正上方、向下运动，让 tick 处理挡板碰撞
S.balls = [{ x: 640, y: H - 100, vx: 0, vy: 600, r: 8, damage: 1, pierce: 0, kind: 'ember', trail: [] }];
for (let i = 0; i < 20 && S.stacks === 0; i++) D.step(1 / 60);
check('Paddle catch adds a forge stack', S.stacks === 1, { stacks: S.stacks, vy: S.balls[0]?.vy, phase: S.phase });
check('Caught ball bounces upward', (S.balls[0]?.vy ?? 1) < 0, { vy: S.balls[0]?.vy });

// 连续接球持续叠层，并在上限处封顶
S.stacks = MAX_STACKS - 1;
S.balls = [{ x: 640, y: H - 100, vx: 0, vy: 600, r: 8, damage: 1, pierce: 0, kind: 'ember', trail: [] }];
for (let i = 0; i < 20 && S.stacks === MAX_STACKS - 1; i++) D.step(1 / 60);
check('Stacks cap during play', S.stacks === MAX_STACKS, { stacks: S.stacks });
S.balls = [{ x: 640, y: H - 100, vx: 0, vy: 600, r: 8, damage: 1, pierce: 0, kind: 'ember', trail: [] }];
for (let i = 0; i < 20; i++) D.step(1 / 60);
check('Stacks never exceed cap in play', S.stacks === MAX_STACKS, { stacks: S.stacks });

// ---- 8. tick 路径：丢单球 -> 层数腰斩 ----
D.reset();
S.enemies = dummy();
S.stacks = 10;
// 一颗球留在场上（向上飞，远离挡板），一颗球已越过底线
S.balls = [
  { x: 300, y: 400, vx: 0, vy: -600, r: 8, damage: 1, pierce: 0, kind: 'ember', trail: [] },
  { x: 900, y: H + 100, vx: 0, vy: 600, r: 8, damage: 1, pierce: 0, kind: 'ember', trail: [] },
];
D.step(1 / 60);
check('Losing one ball halves stacks', S.stacks === 5, { stacks: S.stacks, balls: S.balls.length });

// ---- 9. tick 路径：丢最后一球 -> 层数清零、无自动重发 ----
S.stacks = 8;
S.combo = 30;
S.balls = [{ x: 900, y: H + 100, vx: 0, vy: 600, r: 8, damage: 1, pierce: 0, kind: 'ember', trail: [] }];
const usedBefore = S.reloadsUsed;
D.step(1 / 60);
check('Losing last ball zeroes stacks and combo', S.stacks === 0 && S.combo === 0, { stacks: S.stacks, combo: S.combo });
// 旧行为：0.8s 后自动重发。推进 2 秒确认不再自动装填。
for (let i = 0; i < 120; i++) D.step(1 / 60);
check('No auto-relaunch after volley ends', S.balls.length === 0 && S.reloadsUsed === usedBefore, { balls: S.balls.length, used: S.reloadsUsed, before: usedBefore });

// ---- 10. brood 子球丢失不惩罚层数 ----
S.stacks = 10;
S.balls = [
  { x: 300, y: 400, vx: 0, vy: -600, r: 8, damage: 1, pierce: 0, kind: 'ember', trail: [] },
  { x: 900, y: H + 100, vx: 0, vy: 600, r: 5, damage: 1, pierce: 0, kind: 'ember', trail: [], temp: true },
];
D.step(1 / 60);
check('Losing a brood ball does not punish stacks', S.stacks === 10, { stacks: S.stacks });

// ---- 11. 热度满时不再衰减（保住爆发窗口）----
S.heat = 100;
for (let i = 0; i < 60; i++) D.step(1 / 60);
check('Full heat does not decay', S.heat === 100, { heat: S.heat });
S.heat = 50;
for (let i = 0; i < 60; i++) D.step(1 / 60);
check('Partial heat decays over time', S.heat < 50, { heat: S.heat });

// ---- 12. 泄漏敌人不得白拿完美奖励 ----
D.reset();
S.leaked = 2;
S.reloadsUsed = 1;
const oreBefore = S.ore;
S.enemies = [];                       // 触发清场结算
S.balls = [];
D.step(1 / 60);
check('Leaked core blocks perfect-volley bonus', S.ore === oreBefore && S.volleyBonus?.gain === 0, { ore: S.ore, bonus: S.volleyBonus });

check('No leaked globals collision', typeof D.forgeMul === 'function' && typeof D.nova === 'function');
console.log('final', JSON.stringify({ stacks: S.stacks, reloadsUsed: S.reloadsUsed, heat: S.heat, hp: S.hp, balls: S.balls.length }));
finish();
