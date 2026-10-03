// Deterministic comparison; uses actual draft choices, no permanent upgrades or injected damage.
// node difficulty-sim.mjs [path/to/before-game.js]
import { readFileSync } from 'node:fs';
import { createGame } from './game-harness.mjs';

const source = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : undefined;
function run(seed, width, height, error, reaction) {
  const { D, cards, element } = createGame({ seed, width, height, source });
  const { S } = D;
  let controllerSeed = seed;
  const random = () => { controllerSeed = (Math.imul(controllerSeed, 1664525) + 1013904223) >>> 0; return controllerSeed / 2 ** 32; };
  D.reset();
  const dt = 1 / 60, maxWave = 8;
  let time = 0, nextReaction = 0, emptyTime = 0, killed = 0, leaked = 0, novas = 0, wave = 1;
  let paid = 0, complete = 0, perfect = 0;
  function record() { killed += S.cleared; leaked += S.leaked; paid += Math.max(0, S.reloadsUsed - D.FREE_RELOADS); }
  while (S.phase !== 'over' && time < 900 && S.wave <= maxWave) {
    if (S.phase === 'draft') {
      record(); complete++; if (S.leaked === 0) perfect++;
      const options = cards('[data-up]');
      options[Math.floor(random() * options.length)].click();
      if (S.phase === 'forge') element('continue').click();
      wave = S.wave; emptyTime = 0;
      continue;
    }
    if (S.phase !== 'playing') throw new Error(`Unexpected phase: ${S.phase}`);
    if (time >= nextReaction) {
      nextReaction = time + reaction;
      const falling = S.balls.filter(b => b.vy > 0 && b.y < height - 83)
        .sort((a, b) => (height - 83 - a.y) / a.vy - (height - 83 - b.y) / b.vy);
      const b = falling[0];
      if (b) {
        const span = width - b.r * 2;
        let u = (b.x + b.vx * (height - 83 - b.y) / b.vy - b.r) % (span * 2);
        if (u < 0) u += span * 2;
        const landing = b.r + (u > span ? span * 2 - u : u);
        const target = S.enemies.filter(e => !e.dead).sort((a, c) => Math.abs(a.x + a.w / 2 - landing) - Math.abs(c.x + c.w / 2 - landing))[0];
        const angle = target ? Math.max(-.7, Math.min(.7, (target.x + target.w / 2 - landing) / 320)) : .15;
        S.paddle.target = Math.max(S.paddle.w / 2, Math.min(width - S.paddle.w / 2, landing - angle * S.paddle.w / 2 + (random() - .5) * error * 2));
      }
      if (S.heat >= 100) { D.nova(); novas++; }
    }
    if (!S.balls.length) {
      emptyTime += dt;
      if (emptyTime >= .7) { D.launch(S.paddle.x); emptyTime = 0; }
    } else emptyTime = 0;
    D.step(dt); time += dt;
  }
  if (S.wave <= maxWave) record();
  return { complete, reached: Math.min(wave, maxWave + 1), survived: S.wave > maxWave,
    killed, leaked, paid, novas, perfect, hp: Math.max(0, S.hp), seconds: time };
}

const output = [];
for (const [screen, w, h] of [['desktop', 1280, 860], ['mobile', 390, 667]]) {
  for (const [skill, err, reaction] of [['ordinary', 70, .18], ['beginner', 115, .3]]) {
    const samples = Array.from({ length: 12 }, (_, i) => run(20261003 + i, w, h, err * (screen === 'mobile' ? .55 : 1), reaction));
    const avg = key => +(samples.reduce((n, s) => n + s[key], 0) / samples.length).toFixed(1);
    const sum = key => samples.reduce((n, s) => n + s[key], 0);
    output.push({ screen, skill, runs: samples.length, survived8: sum('survived'), avgCompleted: avg('complete'),
      killPercent: +(100 * sum('killed') / (sum('killed') + sum('leaked'))).toFixed(1),
      avgLeaks: avg('leaked'), avgPaid: avg('paid'), avgNovas: avg('novas'), avgSeconds: avg('seconds') });
  }
}
console.table(output);
