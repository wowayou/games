// 操作误差分析：固定种子、跟踪误差和目标更新间隔，不代表真实玩家水平分布。
// 每炉结束直接给予伤害 ×1.5，跳过选卡/购物；这是统一比较条件，不是完整游戏流程。
import { createSimulation, randomSource, readSeed, isMain, WIDTH, HEIGHT, DT } from './sim-harness.mjs';
const CORE = HEIGHT - 145;

// 预判球在挡板线的落点（含左右墙反射折叠）
function predictX(b) {
  const PADY = HEIGHT - 83, r = b.r || 8;
  if (b.vy <= 0) return null;
  const t = (PADY - b.y) / b.vy;
  if (t < 0) return null;
  let x = b.x + b.vx * t;
  const lo = r, hi = WIDTH - r, span = hi - lo;
  // 折叠到 [lo,hi]：等价于连续镜面反射
  let u = (x - lo) % (2 * span);
  if (u < 0) u += 2 * span;
  return lo + (u > span ? 2 * span - u : u);
}

// err: 瞄准误差(px)  lag: 目标更新间隔(帧)  novaSkill: 是否会留爆发救场
export function playRun(err, lag, novaSkill, { seed = 12345, maxWave = 30, maxSeconds = 900 } = {}) {
  if (!Number.isInteger(maxWave) || maxWave < 1) throw new Error('maxWave 必须为正整数');
  if (!Number.isFinite(maxSeconds) || maxSeconds <= 0) throw new Error('maxSeconds 必须为正数');
  const D = createSimulation(seed), { S } = D;
  // 操作误差与游戏随机流分开；每档从相同游戏种子开始，后续事件会使随机消费顺序分叉。
  const rnd = randomSource(seed);
  D.reset();
  const dt = DT, maxTicks = Math.ceil(maxSeconds / DT);
  let completedWave = 0;
  let ticks = 0, ignites = 0, novas = 0, lagCounter = 0, cachedTarget = 640;
  let waveStart = 0, waveHp = S.hp, peak = 0;
  const log = [];
  const closeWave = () => {
    log.push(`  炉${String(S.wave).padStart(2)}: 装填${S.reloadsUsed} 泄漏${S.leaked} 失血${Math.round(waveHp - S.hp)} 峰值层${peak} 用时${((ticks - waveStart) * DT).toFixed(1)}s HP=${Math.max(0, Math.round(S.hp))}`);
    waveStart = ticks; waveHp = S.hp; peak = 0;
  };
  while (S.phase !== 'over') {
    if (S.phase === 'draft') {
      closeWave();
      completedWave = S.wave;
      if (completedWave === maxWave || ticks >= maxTicks) break;
      S.level++; S.damage *= 1.5;
      S.wave++; S.phase = 'playing'; D.setWave(S.wave); D.launch();
      waveHp = S.hp;
      continue;
    }
    if (S.phase !== 'playing') throw new Error(`非预期阶段：${S.phase}`);
    if (ticks >= maxTicks) break;

    // 追最早落到挡板线的球
    let best = null, bestT = Infinity;
    for (const b of S.balls) {
      if (b.vy <= 0) continue;
      const t = (HEIGHT - 83 - b.y) / b.vy;
      if (t >= 0 && t < bestT) { bestT = t; best = b; }
    }
    if (best) {
      if (lagCounter-- <= 0) {                       // 仅在跟踪下落球时计数，每 lag 帧更新判断
        lagCounter = Math.max(0, lag - 1);
        const px = predictX(best);
        if (px !== null) {
          const alive = S.enemies.filter((e) => !e.dead);
          const tgt = alive.sort((p, q) => Math.abs(p.x + p.w / 2 - px) - Math.abs(q.x + q.w / 2 - px))[0];
          let hitPos = tgt ? Math.max(-0.85, Math.min(0.85, (tgt.x + tgt.w / 2 - px) / 320)) : 0;
          if (Math.abs(hitPos) < 0.12) hitPos = hitPos >= 0 ? 0.12 : -0.12;
          cachedTarget = px - hitPos * (S.paddle.w / 2) + (rnd() - 0.5) * 2 * err;
        }
      }
      S.paddle.target = Math.max(S.paddle.w / 2, Math.min(WIDTH - S.paddle.w / 2, cachedTarget));
    }
    if (S.heat >= 100 && S.balls.length) {
      const alive = S.enemies.filter((e) => !e.dead);
      const lowest = alive.reduce((m, e) => Math.max(m, e.y + e.h), 0);
      if (!novaSkill || lowest > CORE - 140) { D.nova(); novas++; }
    }
    if (!S.balls.length && S.enemies.some((e) => !e.dead)) {
      if (S.reloadsUsed >= D.FREE_RELOADS) ignites++;
      D.launch();
    }
    D.step(dt);
    peak = Math.max(peak, S.stacks);
    ticks++;
  }
  if (completedWave !== S.wave) closeWave();
  const outcome = completedWave === maxWave ? '完成目标' : S.phase === 'over' ? '阵亡' : '超时';
  return { wave: S.wave, completedWave, outcome, ignites, novas, hp: Math.max(0, Math.round(S.hp)), seconds: Math.round(ticks * DT), log };
}

if (isMain(import.meta.url)) {
  const seed = readSeed();
  console.log(`SEED=${seed}；1280×860，120 步/秒，上限 900 秒；每炉伤害 ×1.5，跳过选卡/购物。`);
  const tiers = [
    ['低误差 (8px, 每帧更新, 留爆发)', 8, 0, true],
    ['中低误差 (30px, 每6帧更新, 留爆发)', 30, 6, true],
    ['中高误差 (70px, 每12帧更新, 满热爆发)', 70, 12, false],
    ['高误差 (130px, 每20帧更新, 满热爆发)', 130, 20, false],
  ];
  console.log('操作模型                               到达炉次  结局    炉心点火  爆发  剩余HP  用时');
  console.log('─'.repeat(92));
  for (const [name, err, lag, skill] of tiers) {
    const r = playRun(err, lag, skill, { seed });
    console.log(
      name.padEnd(39) + String(r.wave).padEnd(10) + r.outcome.padEnd(8) +
      String(r.ignites).padEnd(10) + String(r.novas).padEnd(6) + String(r.hp).padEnd(8) + r.seconds + 's'
    );
    r.log.forEach((l) => console.log(l));
  }
}
