import assert from 'node:assert/strict';
import test from 'node:test';
import { simWave } from '../forge-breaker/balance-sim.mjs';
import { playRun } from '../forge-breaker/skill-sim.mjs';
import { createSimulation, readSeed, DT } from '../forge-breaker/sim-harness.mjs';

test('same seed replays actual single-wave and multi-wave simulation results', () => {
  const options = { seed: 73, maxWave: 2 };
  assert.deepEqual(simWave(7, 3, 'hold', options), simWave(7, 3, 'hold', options));
  assert.deepEqual(playRun(8, 0, true, options), playRun(8, 0, true, options));
});

test('game seed changes enemy generation without replacing host Math.random', () => {
  const random = Math.random;
  const layout = seed => {
    const d = createSimulation(seed);
    d.reset(); d.setWave(7);
    return JSON.stringify(d.S.enemies);
  };
  assert.notEqual(layout(1), layout(2));
  assert.equal(Math.random, random);
});

test('time limit cannot be reported as a clear or target completion', () => {
  const options = { maxSeconds: DT };
  const wave = simWave(1, 1, 'hold', options);
  assert.equal(wave.cleared, false);
  assert.equal(wave.outcome, '超时');
  const run = playRun(8, 0, true, options);
  assert.equal(run.outcome, '超时');
  assert.equal(run.completedWave, 0);
});

test('target completion stops on the cleared wave without launching a phantom next wave', () => {
  const run = playRun(8, 0, true, { maxWave: 1 });
  assert.equal(run.outcome, '完成目标');
  assert.equal(run.completedWave, 1);
  assert.equal(run.wave, 1);
  assert.equal(run.log.length, 1);
});

test('seed input rejects malformed values instead of silently coercing them', () => {
  const previous = process.env.SEED;
  try {
    for (const value of ['', '-1', '1.5', 'oops', '4294967296']) {
      process.env.SEED = value;
      assert.throws(readSeed, /SEED/);
    }
    for (const value of ['0', '4294967295']) {
      process.env.SEED = value;
      assert.equal(readSeed(), Number(value));
    }
  } finally {
    if (previous === undefined) delete process.env.SEED;
    else process.env.SEED = previous;
  }
});
