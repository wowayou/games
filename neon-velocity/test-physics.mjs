import { TrackPath, TRACK } from './spline.js';
import { Vehicle, resolveCollisions, standings, toKmh } from './physics.js';
import { AIDriver } from './ai.js';

const assert = (cond, msg) => { if (!cond) throw new Error(`ASSERT: ${msg}`); };
const near = (a, b, eps, msg) => assert(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

const path = new TrackPath();
const report = path.analyze();
console.log('TRACK', report);
assert(report.total > 1800 && report.total < 3500, 'track length sensible');
assert(report.spacing < 2, 'mesh sampling dense enough');
assert(report.minRadius > 25, 'no impossibly sharp corner');
assert(report.maxSlope < 0.3, 'slope sensible');

for (let i = 0; i < 100; i++) {
  const d = path.total * (i / 100);
  const lat = -14 + (i % 29);
  const p = path.surfacePoint(d, lat);
  const hit = path.project(p, -1);
  const dd = Math.min(Math.abs(hit.distance - d), path.total - Math.abs(hit.distance - d));
  assert(dd < path.spacing * 1.6, `projection distance error @${i}: ${dd}`);
  near(hit.lateral, lat, 1.2, `projection lateral @${i}`);
}
console.log('✓ projection round-trips');

const player = new Vehicle(path, { isPlayer: true, slot: 0 });
player.input.throttle = 1;
// 动力测试不测驾驶技巧：每帧把车头对准赛道切线
const dynStep = (t) => {
  player.heading = Math.atan2(player.frame.tx, player.frame.tz);
  player.step(1 / 60, t);
};
for (let i = 0; i < 600; i++) dynStep(i / 60);
assert(player.speed > 30, `player accelerates (${player.speed})`);
assert(player.speed < 82, `normal speed bounded (${player.speed})`);
const baseSpeed = player.speed;
const n0 = player.nitro;
player.input.nitro = true;
for (let i = 0; i < 120; i++) dynStep(10 + i / 60);
assert(player.nitro < n0 - 20, 'nitro depletes');
assert(player.speed > baseSpeed + 3, `nitro adds speed (${baseSpeed} -> ${player.speed})`);
const n1 = player.nitro;
player.input.nitro = false;
for (let i = 0; i < 120; i++) dynStep(12 + i / 60);
assert(player.nitro <= n1 + 0.001, 'nitro does not passively regenerate');
console.log('✓ vehicle acceleration/finite nitro');

// recovery from a persistent roadside stall
const stuck = new Vehicle(path, { isPlayer: true, slot: 0 });
stuck.input.throttle = 1;
const sf = path.frameAt(stuck.distance);
stuck.lateral = TRACK.halfWidth + TRACK.shoulder - 0.4;
stuck.pos.x = sf.px + sf.bx * stuck.lateral;
stuck.pos.z = sf.pz + sf.bz * stuck.lateral;
for (let i = 0; i < 100; i++) stuck.step(1 / 60, i / 60);
console.log('RECOVERY', { speed: stuck.speed, lateral: stuck.lateral, limit: TRACK.halfWidth + TRACK.shoulder });
assert(stuck.speed > 0, 'stuck car gets recovery speed');
assert(Math.abs(stuck.lateral) < TRACK.halfWidth + TRACK.shoulder, 'stuck car stays inside the barrier');
console.log('✓ stuck-car recovery');

const dImpact = path.total * 0.3;
const f = path.frameAt(dImpact);
player.distance = dImpact;
player.pos.x = f.px + f.lx * (TRACK.halfWidth + TRACK.shoulder + 2);
player.pos.y = f.py;
player.pos.z = f.pz + f.lz * (TRACK.halfWidth + TRACK.shoulder + 2);
player.vel.x = f.lx * 30 + f.tx * 25;
player.vel.z = f.lz * 30 + f.tz * 25;
player.heading = Math.atan2(f.tx, f.tz);
const crashes = player.crashes, hp = player.health;
player.input.throttle = 0; player.input.brake = 0;
player.step(1 / 60, 20);
assert(player.crashes > crashes, 'wall collision counted');
assert(player.health < hp, 'wall damages health');
assert(Math.abs(player.lateral) <= TRACK.halfWidth + TRACK.shoulder, 'car clipped inside wall');
console.log('✓ wall collision');

const a = new Vehicle(path, { isPlayer: true, slot: 0 });
const b = new Vehicle(path, { slot: 1 });
a.pos.x = 0; a.pos.z = 0; b.pos.x = 2; b.pos.z = 0;
a.vel.x = 20; b.vel.x = -5;
let bumped = false;
resolveCollisions([a, b], () => { bumped = true; });
assert(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) >= 4.5, 'cars separated');
assert(bumped, 'bump callback fires');
console.log('✓ car collisions');

const aiCar = new Vehicle(path, { slot: 2, name: 'TEST AI' });
const ai = new AIDriver(aiCar, 0, 'normal');
const dummyPlayer = { progress: aiCar.progress, finished: false };
let maxAbsLat = 0, finishAt = Infinity;
for (let i = 0; i < 60 * 360; i++) {
  const t = i / 60;
  dummyPlayer.progress = aiCar.progress;
  ai.update(1 / 60, t, [aiCar], dummyPlayer);
  aiCar.step(1 / 60, t);
  maxAbsLat = Math.max(maxAbsLat, Math.abs(aiCar.lateral));
  if (aiCar.finished) { finishAt = t; break; }
}
console.log('AI', { finishAt, laps: aiCar.lapsCompleted, speedKmh: toKmh(aiCar.speed), maxAbsLat, crashes: aiCar.crashes });
assert(aiCar.finished, 'AI finishes three laps within simulation window');
assert(finishAt > 40 && finishAt < 360, 'AI lap time plausible');
assert(maxAbsLat < TRACK.halfWidth + TRACK.shoulder + 1, 'AI remains inside barrier');
assert(aiCar.crashes < 20, `AI crash count acceptable (${aiCar.crashes})`);
console.log('✓ AI completes race');

const s1 = { progress: 100, finished: false }, s2 = { progress: 200, finished: false }, s3 = { progress: 0, finished: true, finishTime: 99 };
const order = standings([s1, s2, s3]);
assert(order[0] === s3 && order[1] === s2, 'standings order');
console.log('✓ standings');
console.log('\nALL PHYSICS TESTS PASSED');
