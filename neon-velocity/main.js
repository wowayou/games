// ============================================================
//  main.js —— 主循环：渲染、比赛流程、相机、HUD、输入
// ============================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { TrackPath, TRACK, clamp } from './spline.js';
import { Vehicle, resolveCollisions, standings, toKmh, CAR } from './physics.js';
import { AIDriver } from './ai.js';
import { initTextures, buildTrack, buildCity, buildSky, buildCar, TEX } from './world.js';
import { Particles, SpeedLines, Rain } from './particles.js';
import { AudioSystem } from './audio.js';

const $ = (id) => document.getElementById(id);
const el = {};
['game', 'topbar', 'timing', 'speedPanel', 'minimap', 'mapCanvas', 'message', 'countdown',
 'startScreen', 'pauseScreen', 'endScreen', 'loading', 'startBtn', 'restartBtn', 'resumeBtn',
 'restartPauseBtn', 'pauseBtn', 'soundBtn', 'speed', 'gear', 'nitroBar', 'nitroPercent',
 'healthBar', 'healthPercent', 'lap', 'position', 'raceTime', 'lapTime', 'bestTime',
 'finalPosition', 'finalTime', 'finalBest', 'finalCrashes', 'resultTitle', 'resultEyebrow',
 'damageFlash', 'boostVignette', 'touchControls'].forEach((k) => (el[k] = $(k)));

const state = {
  phase: 'menu',       // menu | countdown | racing | paused | finished
  time: 0,             // 比赛计时（秒）
  countdown: 3.9,
  shake: 0,
  muted: false,
  messageTimer: 0,
};

let renderer, scene, camera, composer, path, particles, speedLines, rain, audio;
let player, cars = [], drivers = [], carVisuals = new Map();
let mapPoints = [];
const keys = Object.create(null);
const clock = { last: 0, accum: 0 };
const FIXED = 1 / 120;

/* ---------------- 初始化 ---------------- */

export async function boot() {
  path = new TrackPath();

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.85));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  el.game.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0a1e, 0.0022);

  camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.4, 3200);
  camera.rotation.order = 'YXZ';

  initTextures();
  scene.add(buildSky());
  const track = buildTrack(path);
  scene.add(track.group);
  scene.add(buildCity(path));

  scene.add(new THREE.AmbientLight(0x2a3468, 1.5));
  const hemi = new THREE.HemisphereLight(0x4a5cff, 0x14061e, 0.85);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x9fb8ff, 0.85);
  moon.position.set(-320, 420, 220);
  scene.add(moon);

  particles = new Particles(scene);
  speedLines = new SpeedLines(scene);
  rain = new Rain(scene);
  audio = new AudioSystem();

  // 后处理泛光：赛博朋克霓虹的关键
  try {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.78, 0.72, 0.62);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  } catch (err) {
    console.warn('泛光不可用，回退到直接渲染', err);
    composer = null;
  }

  buildField();
  buildMinimapPath();
  bindInput();
  onResize();
  addEventListener('resize', onResize);

  // 调试/自动化验收钩子（对玩家无影响）
  window.__DEBUG__ = {
    state, path, renderer, get cars() { return cars; }, get player() { return player; },
    get hasBloom() { return !!composer; },
    order: () => standings(cars),
    resetPlayerForTest: () => player.reset(),
    forceFinish: () => {
      player.finished = true;
      player.finishTime = state.time;
      if (!isFinite(player.bestLap)) player.bestLap = state.time;
      finishRace();
    },
  };

  // 菜单期间也转动相机，展示赛道
  el.loading.classList.add('done');
  clock.last = performance.now();
  requestAnimationFrame(frame);
}

function buildField() {
  for (const v of carVisuals.values()) scene.remove(v.group);
  carVisuals.clear();
  cars = []; drivers = [];

  player = new Vehicle(path, { isPlayer: true, slot: 0, name: '你', color: 0x28f7ff });
  cars.push(player);
  for (let i = 1; i < TRACK.cars; i++) {
    const v = new Vehicle(path, { slot: i });
    const d = new AIDriver(v, i - 1, 'hard');
    v.name = d.name;
    v.color = d.color;
    cars.push(v);
    drivers.push(d);
  }
  for (const c of cars) {
    const vis = buildCar(c.color, c.isPlayer);
    scene.add(vis.group);
    carVisuals.set(c, vis);
    syncCar(c, 0);
  }
}

function buildMinimapPath() {
  mapPoints = [];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < 160; i++) {
    const f = path.frameAt((i / 160) * path.total);
    mapPoints.push({ x: f.px, z: f.pz });
    minX = Math.min(minX, f.px); maxX = Math.max(maxX, f.px);
    minZ = Math.min(minZ, f.pz); maxZ = Math.max(maxZ, f.pz);
  }
  const w = maxX - minX, h = maxZ - minZ;
  const s = 150 / Math.max(w, h);
  mapPoints.transform = (x, z) => ({
    x: 90 + (x - (minX + maxX) / 2) * s,
    y: 90 + (z - (minZ + maxZ) / 2) * s,
  });
}

/* ---------------- 输入 ---------------- */

function bindInput() {
  addEventListener('keydown', (e) => {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (e.code === 'KeyP') togglePause();
    if (e.code === 'KeyM') toggleSound();
    if (e.code === 'KeyR' && (state.phase === 'finished' || state.phase === 'paused')) restart();
    if (e.code === 'Enter' && state.phase === 'menu') startRace();
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  el.startBtn.addEventListener('click', startRace);
  el.restartBtn.addEventListener('click', restart);
  el.restartPauseBtn.addEventListener('click', restart);
  el.resumeBtn.addEventListener('click', togglePause);
  el.pauseBtn.addEventListener('click', togglePause);
  el.soundBtn.addEventListener('click', toggleSound);

  // 触屏
  el.touchControls.querySelectorAll('button').forEach((b) => {
    const code = b.dataset.key;
    const on = (e) => { e.preventDefault(); keys[code] = true; };
    const off = (e) => { e.preventDefault(); keys[code] = false; };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('pointercancel', off);
  });
  if (matchMedia('(pointer:coarse)').matches) el.touchControls.classList.remove('hidden');
}

function readInput() {
  const i = player.input;
  const driving = state.phase === 'racing';
  i.throttle = driving && (keys.KeyW || keys.ArrowUp) ? 1 : 0;
  i.brake = driving && (keys.KeyS || keys.ArrowDown) ? 1 : 0;
  const left = keys.KeyA || keys.ArrowLeft, right = keys.KeyD || keys.ArrowRight;
  i.steer = driving ? (right ? 1 : 0) - (left ? 1 : 0) : 0;
  i.handbrake = driving && !!keys.Space;
  i.nitro = driving && (keys.ShiftLeft || keys.ShiftRight);
}

/* ---------------- 流程 ---------------- */

function startRace() {
  // 音频初始化绝不阻塞开赛：某些环境下 AudioContext.resume() 可能长期挂起
  audio.init().then(() => { audio.click(); audio.startRace(); }).catch(() => {});
  state.phase = 'countdown';
  state.countdown = 3.9;
  state.time = 0;
  el.startScreen.classList.remove('active');
  [el.topbar, el.timing, el.speedPanel, el.minimap].forEach((n) => n.classList.remove('hidden'));
  el.countdown.classList.remove('hidden');
}

function restart() {
  audio.click();
  for (const c of cars) c.reset();
  for (const d of drivers) d.nitroWait = 2 + Math.random() * 4;
  state.time = 0;
  state.countdown = 3.9;
  state.shake = 0;
  el.endScreen.classList.remove('active');
  el.pauseScreen.classList.remove('active');
  el.countdown.classList.remove('hidden');
  state.phase = 'countdown';
  audio.startRace();
}

function togglePause() {
  if (state.phase === 'racing') {
    state.phase = 'paused';
    el.pauseScreen.classList.add('active');
    audio.stopRace();
  } else if (state.phase === 'paused') {
    state.phase = 'racing';
    el.pauseScreen.classList.remove('active');
    audio.startRace();
  }
  audio.click();
}

function toggleSound() {
  state.muted = !state.muted;
  audio.setMuted(state.muted);
  el.soundBtn.textContent = state.muted ? '✕' : '♫';
}

function showMessage(text, time = 1.6) {
  el.message.textContent = text;
  el.message.classList.remove('hidden');
  state.messageTimer = time;
}

function finishRace() {
  state.phase = 'finished';
  audio.stopRace();
  const order = standings(cars);
  const pos = order.indexOf(player) + 1;
  const win = pos === 1;
  audio.finish(win);
  el.finalPosition.textContent = pos;
  el.finalTime.textContent = fmt(player.finishTime);
  el.finalBest.textContent = fmt(player.bestLap);
  el.finalCrashes.textContent = player.crashes;
  el.resultTitle.textContent = win ? '冠军！夜城属于你' : pos <= 3 ? '登上领奖台' : '再练一轮';
  el.resultEyebrow.textContent = win ? 'CHAMPION' : 'RACE COMPLETE';
  el.endScreen.classList.add('active');
}

/* ---------------- 每帧 ---------------- */

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - clock.last) / 1000;
  clock.last = now;
  if (!isFinite(dt)) dt = 0;
  dt = Math.min(dt, 0.05);

  if (state.phase === 'countdown') {
    const before = Math.ceil(state.countdown - 0.9);
    state.countdown -= dt;
    const after = Math.ceil(state.countdown - 0.9);
    if (after !== before && after >= 1) { el.countdown.textContent = after; el.countdown.classList.remove('go'); audio.beep(); }
    if (state.countdown <= 0.9 && !el.countdown.classList.contains('go')) {
      el.countdown.textContent = 'GO!';
      el.countdown.classList.add('go');
      audio.beep('go');
    }
    if (state.countdown <= 0) {
      state.phase = 'racing';
      el.countdown.classList.add('hidden');
    }
  }

  readInput();

  if (state.phase === 'racing') {
    clock.accum += dt;
    let steps = 0;
    while (clock.accum >= FIXED && steps < 6) {
      simulate(FIXED);
      clock.accum -= FIXED;
      steps++;
    }
    if (steps === 6) clock.accum = 0;
  }

  // 视觉与音频跟随（即使暂停也保持画面）
  const active = state.phase === 'racing';
  for (const c of cars) syncCar(c, active ? dt : 0);
  updateCamera(dt);
  particles.update(dt);
  const fwd = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
  speedLines.update(dt, camera, Math.abs(player.speed), fwd);
  rain.update(dt, camera);
  TEX.chevron.offset.y -= dt * 1.4;

  if (state.phase !== 'paused') {
    audio.update(player.speed, player.input.throttle, player.nitroActive || player.padTimer > 0, player.slip);
  }

  updateHUD(dt);
  drawMinimap();

  if (composer) composer.render(); else renderer.render(scene, camera);
}

function simulate(dt) {
  state.time += dt;
  for (const d of drivers) d.update(dt, state.time, cars, player);
  for (const c of cars) {
    const events = c.step(dt, state.time);
    handleEvents(c, events);
  }
  resolveCollisions(cars, (a, b, strength, at) => {
    particles.sparks(at.x, at.y, at.z, strength, 0xffe066);
    if (a.isPlayer || b.isPlayer) {
      audio.impact(strength);
      state.shake = Math.min(1, state.shake + strength / 30);
      flashDamage();
    }
  });
  if (player.finished) finishRace();
}

function handleEvents(car, events) {
  for (const e of events) {
    if (e.type === 'wall') {
      const f = car.frame;
      particles.sparks(
        f.px + f.lx * car.lateral, car.pos.y + 0.5, f.pz + f.lz * car.lateral,
        e.impact, 0xff8a3c,
      );
      if (car.isPlayer) {
        audio.impact(e.impact);
        state.shake = Math.min(1, state.shake + e.impact / 26);
        flashDamage();
      }
    } else if (e.type === 'pad') {
      particles.padBurst(car.pos.x, car.pos.y, car.pos.z);
      if (car.isPlayer) { audio.pad(); showMessage('加速带 BOOST', 1); }
    } else if (e.type === 'drift' && e.slip > 0.4) {
      particles.smoke(car);
    } else if (e.type === 'recover' && car.isPlayer) {
      showMessage('脱困辅助 · 回到赛道', 1.2);
    } else if (e.type === 'lap' && car.isPlayer) {
      audio.lap();
      showMessage(`第 ${e.lap} 圈 · 上一圈 ${fmt(e.lapTime)}`, 2);
    }
  }
}

function flashDamage() {
  el.damageFlash.classList.add('hit');
  setTimeout(() => el.damageFlash.classList.remove('hit'), 120);
}

/* ---------------- 视觉同步 ---------------- */

function syncCar(car, dt) {
  const vis = carVisuals.get(car);
  if (!vis) return;
  vis.group.position.set(car.pos.x, car.pos.y, car.pos.z);
  vis.group.rotation.order = 'YXZ';
  vis.group.rotation.y = car.heading;
  vis.group.rotation.x = car.pitch;
  // 车身随横向速度侧倾
  const lean = clamp((car.vel.x * Math.cos(car.heading) - car.vel.z * Math.sin(car.heading)) * 0.012, -0.16, 0.16);
  vis.group.rotation.z = car.bank * 0.8 + lean;

  if (dt > 0) {
    const spin = (car.speed / 0.52) * dt;
    for (const w of vis.wheels) w.rotation.x += spin;
    for (const h of vis.frontWheels) h.rotation.y = -car.input.steer * 0.42;
  }
  const boosting = car.nitroActive || car.padTimer > 0;
  const flameScale = boosting ? 1 : 0;
  for (const f of vis.flames) {
    f.material.opacity += ((boosting ? 0.85 : 0) - f.material.opacity) * 0.3;
    const target = 0.55 + (boosting ? 1 : 0) * (0.9 + Math.random() * 0.5);
    f.scale.set(target, target, flameScale ? 1 + Math.random() * 0.6 : 0.4);
  }
  vis.glow.material.opacity = 0.4 + (boosting ? 0.45 : 0) + car.slip * 0.2;
  vis.tail.material.color.setHex(car.input.brake > 0 ? 0xff2038 : 0x8c1226);

  if (dt > 0 && Math.abs(car.speed) > 3) particles.exhaust(car, boosting, dt);
}

const camDesired = new THREE.Vector3();
const camLook = new THREE.Vector3();

function updateCamera(dt) {
  const c = player;
  const sp = Math.abs(c.speed);
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
  const back = 9.2 + sp * 0.052;
  const height = 3.6 + sp * 0.014;
  camDesired.set(c.pos.x - fx * back, c.pos.y + height, c.pos.z - fz * back);

  if (state.phase === 'menu') {
    // 菜单：绕车缓慢环绕
    const a = performance.now() * 0.00016;
    camDesired.set(c.pos.x + Math.cos(a) * 15, c.pos.y + 5.5, c.pos.z + Math.sin(a) * 15);
    camera.position.lerp(camDesired, 1 - Math.exp(-2.4 * dt));
    camLook.set(c.pos.x, c.pos.y + 1.2, c.pos.z);
    camera.lookAt(camLook);
    return;
  }

  camera.position.lerp(camDesired, 1 - Math.exp(-9 * dt));
  camLook.set(c.pos.x + fx * 13, c.pos.y + 1.7, c.pos.z + fz * 13);
  camera.lookAt(camLook);

  // 碰撞抖动
  if (state.shake > 0.001) {
    state.shake = Math.max(0, state.shake - dt * 2.6);
    const s = state.shake * 0.55;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    camera.position.z += (Math.random() - 0.5) * s;
  }

  // 视场角随速度/氮气扩张
  const boosting = c.nitroActive || c.padTimer > 0;
  const targetFov = 62 + Math.min(sp, 95) * 0.13 + (boosting ? 9 : 0);
  camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-5 * dt));
  camera.updateProjectionMatrix();
  el.boostVignette.classList.toggle('active', boosting && sp > 20);
}

/* ---------------- HUD ---------------- */

function fmt(t) {
  if (!isFinite(t) || t <= 0) return '--:--.---';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
}

function updateHUD(dt) {
  const kmh = Math.max(0, Math.round(toKmh(Math.abs(player.speed))));
  el.speed.textContent = kmh;
  const gear = player.speed < -0.5 ? 'R' : kmh < 2 ? 'N' : String(Math.min(6, 1 + Math.floor(kmh / 48)));
  el.gear.textContent = gear;
  el.nitroBar.style.width = `${player.nitro}%`;
  el.nitroPercent.textContent = `${Math.round(player.nitro)}%`;
  el.healthBar.style.width = `${player.health}%`;
  el.healthPercent.textContent = `${Math.round(player.health)}%`;
  el.lap.textContent = player.currentLap;
  const order = standings(cars);
  el.position.textContent = order.indexOf(player) + 1;
  el.raceTime.textContent = fmt(state.time);
  el.lapTime.textContent = fmt(state.time - player.lapStart);
  el.bestTime.textContent = fmt(player.bestLap);

  if (state.messageTimer > 0) {
    state.messageTimer -= dt;
    if (state.messageTimer <= 0) el.message.classList.add('hidden');
  }
  if (player.wrongWay && state.phase === 'racing' && state.messageTimer <= 0) {
    showMessage('⚠ 方向错误 WRONG WAY', 0.4);
  }
}

function drawMinimap() {
  const cv = el.mapCanvas;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 180, 180);
  g.fillStyle = 'rgba(4,7,20,0.55)';
  g.fillRect(0, 0, 180, 180);
  g.beginPath();
  mapPoints.forEach((p, i) => {
    const q = mapPoints.transform(p.x, p.z);
    i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y);
  });
  g.closePath();
  g.strokeStyle = 'rgba(40,247,255,0.5)';
  g.lineWidth = 6;
  g.stroke();
  g.strokeStyle = 'rgba(150,240,255,0.22)';
  g.lineWidth = 1;
  g.stroke();

  // 起跑线
  const s = mapPoints.transform(path.frameAt(0).px, path.frameAt(0).pz);
  g.fillStyle = '#ffe548';
  g.fillRect(s.x - 2, s.y - 2, 4, 4);

  for (const c of cars) {
    const q = mapPoints.transform(c.pos.x, c.pos.z);
    g.beginPath();
    g.arc(q.x, q.y, c.isPlayer ? 4.4 : 3.2, 0, Math.PI * 2);
    g.fillStyle = c.isPlayer ? '#ffffff' : `#${c.color.toString(16).padStart(6, '0')}`;
    g.fill();
    if (c.isPlayer) { g.strokeStyle = '#28f7ff'; g.lineWidth = 2; g.stroke(); }
  }
}

function onResize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (composer) composer.setSize(w, h);
  particles.resize(h);
}
