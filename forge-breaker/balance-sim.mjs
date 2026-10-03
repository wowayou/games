// 单炉平衡分析：瞬移挡板、预设伤害、固定种子；不是玩家通关率或通过/失败测试。
import { createSimulation, readSeed, isMain, WIDTH, HEIGHT, DT } from './sim-harness.mjs';

// 模拟一炉：会瞄准的 AI（用挡板边缘把球打向最近残砖）。
// novaPolicy='greedy' 热度满即放；'hold' 留到最低砖逼近炉心时救场。
export function simWave(wave, damage, novaPolicy = 'hold', { seed = 12345, maxSeconds = 120 } = {}) {
  if (!Number.isFinite(maxSeconds) || maxSeconds <= 0) throw new Error('maxSeconds 必须为正数');
  const D = createSimulation(seed), { S } = D;
  D.reset();
  S.wave = wave;
  S.damage = damage;
  S.enemies = []; S.balls = [];
  D.setWave(wave);
  const totalHp = S.enemies.reduce((a, e) => a + e.hp, 0);
  const brickCount = S.enemies.length;
  const hp0 = S.hp;
  const CORE = HEIGHT - 145;               // 炉心判定线

  let ticks = 0, peakStacks = 0, novas = 0;
  const dt = DT, maxTicks = Math.ceil(maxSeconds / DT);
  D.launch();
  while (S.phase === 'playing' && ticks < maxTicks) {
    const falling = S.balls.filter((b) => b.vy > 0);
    const b = falling.sort((x, y) => y.y - x.y)[0] || S.balls[0];
    if (b) {
      const alive = S.enemies.filter((e) => !e.dead);
      const tgt = alive.sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))[0];
      let hitPos = 0;
      if (tgt) hitPos = Math.max(-0.85, Math.min(0.85, (tgt.x + tgt.w / 2 - b.x) / 320));
      if (Math.abs(hitPos) < 0.12) hitPos = hitPos >= 0 ? 0.12 : -0.12;
      const want = b.x - hitPos * (S.paddle.w / 2);
      S.paddle.target = S.paddle.x = Math.max(S.paddle.w / 2, Math.min(WIDTH - S.paddle.w / 2, want));
    }
    // 爆发时机
    if (S.heat >= 100 && S.balls.length) {
      const alive = S.enemies.filter((e) => !e.dead);
      const lowest = alive.reduce((m, e) => Math.max(m, e.y + e.h), 0);
      const urgent = lowest > CORE - 120;     // 最低砖距炉心不足 120px
      if (novaPolicy === 'greedy' || urgent) { D.nova(); novas++; }
    }
    if (!S.balls.length && S.enemies.some((e) => !e.dead)) D.launch();
    D.step(dt);
    peakStacks = Math.max(peakStacks, S.stacks);
    ticks++;
  }
  return {
    wave, brickCount, totalHp, novas,
    reloads: S.reloadsUsed,
    cleared: S.phase === 'draft',
    outcome: S.phase === 'draft' ? '清场' : S.phase === 'over' ? '阵亡' : '超时',
    leaked: S.leaked,
    hpLost: Math.round(hp0 - S.hp),
    seconds: +(ticks * DT).toFixed(1),
    peakStacks,
  };
}

if (isMain(import.meta.url)) {
  const seed = readSeed();
  console.log(`SEED=${seed}；1280×860，120 步/秒，单炉上限 120 秒；伤害按炉次预设，挡板可瞬移。`);
  for (const policy of ['greedy', 'hold']) {
    console.log(`\n【爆发策略：${policy === 'greedy' ? '热度满即放' : '留到残砖逼近炉心'}】`);
    console.log('炉次  砖块  总HP   damage  装填  清场  泄漏  失血  爆发  峰值层  耗时   评价');
    console.log('─'.repeat(84));
    for (const wave of [1, 3, 5, 7, 9, 11, 13, 15, 18, 21, 25]) {
      const damage = 1 * Math.pow(1.5, Math.floor(wave * 0.45));
      const r = simWave(wave, damage, policy, { seed: (seed + wave) >>> 0 });
      const verdict = !r.cleared ? r.outcome : r.leaked === 0 && r.reloads === 1 ? '★ 完美一轮' : r.reloads === 1 ? '◐ 一轮但漏血' : r.reloads <= 3 ? '○ 免费内' : '△ 炉心点火';
      console.log(
        String(r.wave).padEnd(6) + String(r.brickCount).padEnd(6) + String(r.totalHp).padEnd(7) +
        damage.toFixed(1).padEnd(8) + String(r.reloads).padEnd(6) + (r.cleared ? 'Y' : 'N').padEnd(6) +
        String(r.leaked).padEnd(6) + String(r.hpLost).padEnd(6) + String(r.novas).padEnd(6) +
        String(r.peakStacks).padEnd(8) + (r.seconds + 's').padEnd(7) + verdict
      );
    }
  }
}
