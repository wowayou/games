import assert from 'node:assert/strict';
import { createGame } from './game-harness.mjs';

let count = 0;
function test(name, fn) { fn(); count++; console.log(`✓ ${name}`); }
const ball = (x, y, temp = false) => ({ x, y, vx: 0, vy: 620, r: 8, damage: 1, pierce: 0, kind: 'ember', trail: [], temp });

test('Difficulty persists separately from the existing forge save and only changes between runs', () => {
  const g = createGame();
  assert.equal(g.D.difficulty, 'relaxed');
  assert.equal(g.D.selectDifficulty('invalid'), false);
  assert.equal(g.D.selectDifficulty('standard'), true);
  g.D.reset();
  assert.equal(g.D.S.speed, 700);
  assert.equal(g.D.FREE_RELOADS, 3);
  assert.equal(g.D.selectDifficulty('relaxed'), false);
  assert.equal(g.storage.has('hellforge.meta.v1'), false);
  const next = createGame({ saved: Object.fromEntries(g.storage) });
  assert.equal(next.D.difficulty, 'standard');
  assert.equal(createGame({ saved: { 'hellforge.difficulty.v1': 'unknown' } }).D.difficulty, 'relaxed');
});

test('Enemy pressure starts at first launch; reload grace expires and pause freezes it', () => {
  const { D } = createGame(); D.reset(); const { S } = D;
  const y = S.enemies[0].y;
  for (let i = 0; i < 120; i++) D.step(1 / 60);
  assert.equal(S.enemies[0].y, y);
  D.launch(); D.step(1 / 60);
  assert.ok(S.enemies[0].y > y);
  S.balls = [ball(10, 1000)]; D.step(1 / 60);
  const waitingY = S.enemies[0].y;
  assert.equal(S.reloadGrace, 2.5);
  S.paused = true; D.step(1);
  assert.equal(S.reloadGrace, 2.5);
  S.paused = false;
  for (let i = 0; i < 120; i++) D.step(1 / 60);
  assert.equal(S.enemies[0].y, waitingY);
  for (let i = 0; i < 60; i++) D.step(1 / 60);
  assert.ok(S.enemies[0].y > waitingY);
  assert.equal(S.reloadGrace, 0);
  assert.equal(S.reloadsUsed, 1);
});

test('Single, simultaneous and temporary ball losses settle once with the correct retention', () => {
  for (const mode of ['relaxed', 'standard']) {
    const { D } = createGame(); D.selectDifficulty(mode); D.reset(); const { S } = D;
    S.stacks = 10; S.balls = [ball(640, 200), ball(20, 1000)]; D.step(1 / 60);
    assert.equal(S.stacks, mode === 'relaxed' ? 8 : 5);
    S.stacks = 10; S.balls = [ball(10, 1000), ball(900, 1000)]; D.step(1 / 60);
    assert.equal(S.stacks, mode === 'relaxed' ? 5 : 0);
    S.stacks = 10; S.balls = [ball(640, 200, true), ball(900, 1000)]; D.step(1 / 60);
    assert.equal(S.stacks, mode === 'relaxed' ? 5 : 0);
    const retained = S.stacks;
    S.balls = [ball(900, 1000, true)]; D.step(1 / 60);
    assert.equal(S.stacks, retained);
  }
});

test('Repeated launch and held Space cannot charge extra; an unaffordable deliberate reload ends the run', () => {
  const { D, dispatch } = createGame(); D.reset(); const { S } = D;
  S.paddle.x = S.paddle.target = 240;
  dispatch('keydown', { code: 'Space' });
  assert.equal(S.reloadsUsed, 1); assert.equal(S.balls[0].x, 240);
  D.launch(); assert.equal(S.reloadsUsed, 1);
  S.balls = []; S.reloadsUsed = 5;
  dispatch('keydown', { code: 'Space', repeat: true });
  assert.equal(S.hp, 120); assert.equal(S.reloadsUsed, 5);
  dispatch('keydown', { code: 'Space' });
  assert.equal(S.hp, 115); assert.equal(S.reloadsUsed, 6);
  S.balls = []; S.hp = 5; D.launch();
  assert.equal(S.phase, 'over'); assert.equal(S.balls.length, 0);
});

test('Full heat with no balls fires nova before any paid reload, including paused input', () => {
  const { D, dispatch } = createGame(); D.reset(); const { S } = D;
  S.reloadsUsed = 5; S.heat = 100; S.paused = true;
  dispatch('keydown', { code: 'Space' }); assert.equal(S.heat, 100);
  S.paused = false; dispatch('keydown', { code: 'Space' });
  assert.equal(S.heat, 0); assert.equal(S.hp, 120);
  assert.equal(S.reloadsUsed, 5); assert.equal(S.balls.length, 0);
});

test('Desktop and short mobile screens share arrival time; bosses and escorts fit horizontally', () => {
  for (const [width, height] of [[1280, 860], [390, 667], [667, 390]]) {
    const { D } = createGame({ width, height }); D.reset();
    for (const wave of [1, 4, 8, 16, 40]) {
      D.setWave(wave); const { S } = D;
      assert.ok(S.enemies.every(e => e.x >= 0 && e.x + e.w <= width));
      const gap = height - 145 - Math.max(...S.enemies.map(e => e.y + e.h));
      assert.ok(gap >= 89.99);
      const seconds = gap / S.advanceSpeed;
      assert.ok(Math.abs(seconds - Math.max(28, 55 - (wave - 1) * 1.5)) < 1e-8);
    }
  }
});

test('Clear repairs are capped, require actual kills and never reward an all-leak wave', () => {
  const { D } = createGame(); D.reset(); const { S } = D;
  S.hp = 118; S.cleared = 12; S.enemies = []; D.step(1 / 60); assert.equal(S.hp, 120);
  D.reset(); S.hp = 90; S.cleared = 3; S.enemies = []; D.step(1 / 60); assert.equal(S.hp, 93);
  D.reset(); S.hp = 90; S.cleared = 12; S.enemies = []; D.step(1 / 60); assert.equal(S.hp, 98);
  D.reset(); S.hp = 90; S.leaked = 12; S.reloadsUsed = 1; S.enemies = []; D.step(1 / 60);
  assert.equal(S.hp, 90); assert.equal(S.volleyBonus.gain, 0);
});

test('Catch builds rescue heat; new waves discard old balls and reset reload accounting', () => {
  const { D, cards } = createGame(); D.reset(); const { S } = D;
  S.balls = [ball(640, 765)]; D.step(1 / 60);
  assert.equal(S.stacks, 1); assert.ok(S.heat > 4.9);
  D.clearWave(); D.step(1 / 60); cards('[data-up]')[0].click();
  assert.equal(S.wave, 2); assert.equal(S.balls.length, 0);
  assert.equal(S.reloadsUsed, 0); assert.equal(S.stacks, 0);
});

test('Speed and paddle upgrades stop at readable limits; keyboard controls freeze during pause', () => {
  const { D, dispatch, world } = createGame(); D.reset(); const { S } = D;
  for (let i = 0; i < 30; i++) {
    D.UPGRADES.find(u => u.id === 'speed').apply(); D.UPGRADES.find(u => u.id === 'paddle').apply();
  }
  assert.equal(S.speed, 900); assert.equal(S.paddle.w, 1280 * .65);
  S.paused = true; dispatch('keydown', { code: 'KeyD' }); const x = S.paddle.x;
  D.step(.1); assert.equal(S.paddle.x, x);
  S.paused = false; D.step(.1); assert.ok(S.paddle.x > x);
  world.innerWidth = 390; world.innerHeight = 667; dispatch('resize');
  assert.equal(S.paddle.w, 390 * .65);
  assert.ok(S.paddle.x + S.paddle.w / 2 <= 390);
});

test('Maxed speed and paddle never consume a draft option', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const { D, cards } = createGame({ seed }); D.reset();
    D.S.speed = 900; D.S.paddle.baseWidth = 2000;
    D.UPGRADES.find(u => u.id === 'paddle').apply();
    D.clearWave(); D.step(1 / 60);
    const offered = cards('[data-up]');
    assert.equal(offered.length, 3);
    assert.ok(offered.every(c => !['speed', 'paddle'].includes(c.dataset.up)));
  }
});

test('Keyboard interaction with the difficulty selector does not start a run', () => {
  const { D, dispatch } = createGame();
  dispatch('keydown', { code: 'Enter', target: { matches: () => true } });
  assert.equal(D.S.phase, 'menu');
  D.reset(); dispatch('keydown', { code: 'Space', target: {} });
  assert.equal(D.S.reloadsUsed, 1);
});

console.log(`${count} difficulty checks passed`);
