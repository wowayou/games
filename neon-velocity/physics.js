// ============================================================
//  physics.js —— 街机风格车辆动力学 + 圈数统计
//  纯逻辑：不依赖 three.js
// ============================================================

import { TRACK, clamp, lerp, makeFrame, makeHit, wrapAngle, wrapDelta } from './spline.js';

export const CAR = {
  length: 4.4,
  width: 2.0,
  radius: 2.3,          // 车车碰撞用的等效半径
  a0: 27,               // 起步加速度 (m/s²)
  vmax: 76,             // 引擎特性速度上限
  brake: 42,
  reverseMax: 13,
  dragLin: 0.03,
  dragQuad: 0.0018,
  steerBase: 1.95,      // rad/s
  steerFalloff: 0.021,  // 速度衰减系数
  gripNormal: 7.0,      // 横向速度衰减（越大越抓地）
  gripDrift: 1.7,
  nitroThrust: 1.55,
  nitroVmax: 95,
  nitroDrain: 45,
  nitroRegen: 0,
  driftNitroGain: 2.5,
  padThrust: 1.42,
  padVmax: 88,
  padTime: 1.6,
  padNitro: 18,
  wallBounce: 0.45,
  wallSpeedLoss: 0.55,  // 正面撞墙的掉速比例（按入射角缩放）
  wallScrape: 9,        // 贴墙摩擦 (m/s²)
  shoulderDrag: 15,
};

/** 3.6 = m/s → km/h */
export const toKmh = (v) => v * 3.6;

export class Vehicle {
  constructor(path, opts = {}) {
    this.path = path;
    this.isPlayer = !!opts.isPlayer;
    this.name = opts.name || 'CAR';
    this.color = opts.color ?? 0x28f7ff;
    this.slot = opts.slot ?? 0;
    this.frame = makeFrame();
    this.hit = makeHit();
    this.events = [];
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, z: 0 };
    this.reset();
  }

  reset() {
    const { path } = this;
    const row = Math.floor(this.slot / 2);
    const col = this.slot % 2;
    // 发车格：起跑线之前，左右两列错开
    this.distance = path.wrap(-TRACK.gridOffset - row * 9);
    this.lateral = col === 0 ? -4.6 : 4.6;
    this.progress = -(TRACK.gridOffset + row * 9);
    this.speed = 0;
    this.vel.x = 0; this.vel.z = 0;
    this.lapsCompleted = 0;
    this.lapStart = 0;
    this.lapTimes = [];
    this.bestLap = Infinity;
    this.finished = false;
    this.finishTime = 0;
    this.crashes = 0;
    this.health = 100;
    this.nitro = 100;
    this.nitroActive = false;
    this.padTimer = 0;
    this.wallCooldown = 0;
    this.bumpCooldown = 0;
    this.stuckTimer = 0;
    this.slip = 0;
    this.drifting = false;
    this.wrongWay = false;
    this.hintIndex = -1;
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };

    path.frameAt(this.distance, this.frame);
    const f = this.frame;
    this.heading = Math.atan2(f.tx, f.tz);
    this.pos.x = f.px + f.bx * this.lateral;
    this.pos.y = f.py + f.by * this.lateral;
    this.pos.z = f.pz + f.bz * this.lateral;
    this.hintIndex = f.index;
    this.bank = f.bank;
    this.pitch = 0;
    this.rideY = this.pos.y;
  }

  get forwardX() { return Math.sin(this.heading); }
  get forwardZ() { return Math.cos(this.heading); }
  /** 屏幕右方向（heading 递减 = 右转） */
  get rightX() { return Math.cos(this.heading); }
  get rightZ() { return -Math.sin(this.heading); }

  /** 沿赛道行进方向的速度分量（判断逆行/名次用） */
  get alongSpeed() {
    return this.vel.x * this.frame.tx + this.vel.z * this.frame.tz;
  }

  step(dt, time) {
    const { path, input } = this;
    this.events.length = 0;
    const p = CAR;

    // ---- 转向：速度越快转向越迟钝；倒车时反向 ----
    const steerRate = p.steerBase / (1 + Math.abs(this.speed) * p.steerFalloff);
    const dir = this.speed < -0.4 ? -1 : 1;
    this.heading = wrapAngle(this.heading - input.steer * steerRate * dt * dir);

    // ---- 世界速度 → 车身坐标（用更新后的朝向，得到街机式转向手感）----
    const fx = this.forwardX, fz = this.forwardZ;
    const rx = this.rightX, rz = this.rightZ;
    let vLong = this.vel.x * fx + this.vel.z * fz;
    let vLat = this.vel.x * rx + this.vel.z * rz;

    // ---- 纵向：油门 / 刹车 / 阻力 ----
    const nitroReady = input.nitro && this.nitro > 0 && input.throttle > 0;
    this.nitroActive = nitroReady;
    this.padTimer = Math.max(0, this.padTimer - dt);
    let thrustMul = 1, vmax = p.vmax;
    if (nitroReady) { thrustMul = p.nitroThrust; vmax = p.nitroVmax; }
    else if (this.padTimer > 0) { thrustMul = p.padThrust; vmax = p.padVmax; }

    if (input.throttle > 0) {
      const curve = Math.max(0, 1 - Math.max(0, vLong) / vmax);
      vLong += p.a0 * thrustMul * curve * input.throttle * dt;
    }
    if (input.brake > 0) {
      if (vLong > 0.5) vLong -= p.brake * input.brake * dt;
      else vLong -= p.a0 * 0.55 * input.brake * dt;
    }
    // 阻力
    const dragA = p.dragLin * Math.abs(vLong) + p.dragQuad * vLong * vLong;
    vLong -= Math.sign(vLong) * dragA * dt;
    // 路肩额外拖拽
    const absLat = Math.abs(this.lateral);
    if (absLat > TRACK.halfWidth) {
      vLong -= Math.sign(vLong) * p.shoulderDrag * dt;
    }
    if (vLong < -p.reverseMax) vLong = -p.reverseMax;

    if (nitroReady) this.nitro = Math.max(0, this.nitro - p.nitroDrain * dt);
    else this.nitro = Math.min(100, this.nitro + p.nitroRegen * dt);

    // ---- 横向抓地：手刹时大幅降低 ⇒ 甩尾 ----
    const grip = input.handbrake ? p.gripDrift : p.gripNormal;
    vLat *= Math.exp(-grip * dt);
    this.slip = Math.min(1, Math.abs(vLat) / 13);
    this.drifting = this.slip > 0.28 && Math.abs(vLong) > 12;
    if (this.drifting) {
      // 漂移奖励氮气：鼓励主动甩尾
      this.nitro = Math.min(100, this.nitro + p.driftNitroGain * this.slip * dt);
      this.events.push({ type: 'drift', slip: this.slip });
    }

    // ---- 回到世界坐标并积分 ----
    this.vel.x = fx * vLong + rx * vLat;
    this.vel.z = fz * vLong + rz * vLat;
    this.speed = vLong;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // ---- 投影回赛道 ----
    path.project(this.pos, this.hintIndex, this.hit);
    this.hintIndex = this.hit.index;
    const prevDistance = this.distance;
    this.distance = this.hit.distance;
    this.lateral = this.hit.lateral;
    path.frameAt(this.distance, this.frame);

    // ---- 护栏碰撞 ----
    const limit = TRACK.halfWidth + TRACK.shoulder - CAR.width * 0.5;
    this.wallCooldown = Math.max(0, this.wallCooldown - dt);
    if (Math.abs(this.lateral) > limit) {
      const side = Math.sign(this.lateral);
      this.lateral = side * limit;
      const f = this.frame;
      this.pos.x = f.px + f.bx * this.lateral;
      this.pos.z = f.pz + f.bz * this.lateral;
      // 朝墙的法向速度分量：决定这是"擦"还是"撞"
      const intoWall = this.vel.x * (f.lx * side) + this.vel.z * (f.lz * side);
      if (intoWall > 0) {
        this.vel.x -= f.lx * side * intoWall * (1 + p.wallBounce);
        this.vel.z -= f.lz * side * intoWall * (1 + p.wallBounce);
      }
      const impact = Math.max(0, intoWall);
      // 掉速按入射角缩放：贴墙摩擦只损失一点，正面撞墙才伤
      const speedTotal = Math.hypot(this.vel.x, this.vel.z) || 1;
      const angleFactor = clamp(impact / speedTotal, 0, 1);
      this.speed *= 1 - p.wallSpeedLoss * angleFactor;
      this.speed -= Math.sign(this.speed) * p.wallScrape * dt;
      if (this.wallCooldown === 0 && impact > 6) {
        this.wallCooldown = 0.45;
        this.crashes++;
        this.health = Math.max(0, this.health - clamp(impact * 0.55, 2, 16));
        this.events.push({ type: 'wall', impact, side });
      }
      // 位置被夹回后重新投影一次，保持数据一致
      path.project(this.pos, this.hintIndex, this.hit);
      this.distance = this.hit.distance;
      this.lateral = this.hit.lateral;
    }

    // ---- 卡死恢复：全油门却被护栏/几何边缘困住时，轻推回赛道中心 ----
    const trapped = input.throttle > 0.8 && Math.abs(this.speed) < 2.2 && Math.abs(this.lateral) > TRACK.halfWidth - 1;
    this.stuckTimer = trapped ? this.stuckTimer + dt : Math.max(0, this.stuckTimer - dt * 2);
    if (this.stuckTimer > 1.15) {
      const f = this.frame;
      this.lateral *= 0.58;
      this.pos.x = f.px + f.bx * this.lateral;
      this.pos.z = f.pz + f.bz * this.lateral;
      this.vel.x = f.tx * 5.5;
      this.vel.z = f.tz * 5.5;
      this.speed = 5.5;
      this.stuckTimer = 0;
      this.events.push({ type: 'recover' });
    }

    // ---- 加速带 ----
    for (const pad of path.pads) {
      if (this.distance >= pad.d0 && this.distance <= pad.d1 &&
          Math.abs(this.lateral - pad.lat) < pad.halfW) {
        if (this.padTimer < 0.6) {
          this.padTimer = p.padTime;
          this.nitro = Math.min(100, this.nitro + p.padNitro);
          this.events.push({ type: 'pad' });
        }
        break;
      }
    }

    // ---- 进度 / 圈数 ----
    const delta = wrapDelta(this.distance - prevDistance, path.total);
    this.progress += delta;
    const laps = Math.floor(this.progress / path.total);
    if (laps > this.lapsCompleted) {
      const t = time - this.lapStart;
      this.lapStart = time;
      this.lapsCompleted = laps;
      this.lapTimes.push(t);
      if (t < this.bestLap) this.bestLap = t;
      if (laps >= TRACK.laps) {
        this.finished = true;
        this.finishTime = time;
        this.events.push({ type: 'finish', time });
      } else {
        this.events.push({ type: 'lap', lap: laps + 1, lapTime: t });
      }
    } else if (laps < this.lapsCompleted) {
      this.lapsCompleted = laps; // 倒车退回上一圈，防作弊
    }
    this.wrongWay = this.alongSpeed < -4;

    // ---- 贴合路面 ----
    const f = this.frame;
    const targetY = f.py + f.by * this.lateral;
    this.rideY = lerp(this.rideY, targetY, 1 - Math.exp(-14 * dt));
    this.pos.y = this.rideY;
    this.bank = f.bank;
    this.pitch = -Math.asin(clamp(f.ty, -0.6, 0.6));
    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);
    return this.events;
  }

  get currentLap() {
    return clamp(this.lapsCompleted + 1, 1, TRACK.laps);
  }
}

/** 车对车碰撞：等质量弹开 + 交换少量动量 */
export function resolveCollisions(cars, onBump) {
  const minD = CAR.radius * 2;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      let dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      let d = Math.hypot(dx, dz);
      if (d > minD || d === 0) continue;
      const nx = dx / d, nz = dz / d;
      const push = (minD - d) * 0.5 + 0.01;
      a.pos.x -= nx * push; a.pos.z -= nz * push;
      b.pos.x += nx * push; b.pos.z += nz * push;
      // 沿法线的相对速度
      const rvn = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
      if (rvn < 0) {
        const imp = rvn * 0.85;
        a.vel.x += nx * imp; a.vel.z += nz * imp;
        b.vel.x -= nx * imp; b.vel.z -= nz * imp;
        a.speed *= 0.94; b.speed *= 0.94;
        const strength = Math.abs(rvn);
        if (strength > 3.5) {
          for (const c of [a, b]) {
            if (c.bumpCooldown === 0) {
              c.bumpCooldown = 0.4;
              c.health = Math.max(0, c.health - clamp(strength * 0.35, 1, 8));
              if (c.isPlayer) c.crashes++;
            }
          }
          if (onBump) onBump(a, b, strength, { x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2 + 0.6, z: (a.pos.z + b.pos.z) / 2 });
        }
      }
    }
  }
}

/** 按总进度排名（未完赛按进度，完赛按用时） */
export function standings(cars) {
  return [...cars].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
}
