// ============================================================
//  ai.js —— AI 车手：前视追踪 + 弯道限速 + 避让 + 橡皮筋
//  纯逻辑：不依赖 three.js
// ============================================================

import { TRACK, clamp, makeFrame, wrapAngle, wrapDelta } from './spline.js';
import { CAR } from './physics.js';

/** 难度会缩放 AI 的整体水平 */
export const DIFFICULTY = {
  easy:   { skill: 0.82, rubber: 0.03, pace: 0.96 },
  normal: { skill: 0.96, rubber: 0.06, pace: 1.02 },
  hard:   { skill: 1.08, rubber: 0.02, pace: 1.08 },
};

const NAMES = ['KIRA-09', 'RONIN', 'HELIX', 'V0LT', 'MANTIS'];
const COLORS = [0xff2aa8, 0xffe548, 0x8d45ff, 0x2bff88, 0xff7418];

export class AIDriver {
  constructor(vehicle, index, difficulty = 'normal') {
    const d = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.v = vehicle;
    this.frame = makeFrame();
    this.aim = makeFrame();
    // 每台车给一点性格差异，避免四台车走同一条线
    this.skill = clamp(d.skill + (index - 1) * 0.022, 0.7, 1.12);
    this.rubber = d.rubber;
    this.pace = d.pace;
    this.bias = (index % 2 === 0 ? 1 : -1) * (1.6 + index * 0.9);
    this.apex = 0.62 + 0.07 * index;
    this.phase = index * 1.7;
    this.name = NAMES[index % NAMES.length];
    this.color = COLORS[index % COLORS.length];
    this.nitroWait = 2 + index * 1.4;
  }

  update(dt, time, cars, player) {
    const v = this.v;
    const path = v.path;
    const input = v.input;
    if (v.finished) {
      input.throttle = 0.3; input.brake = 0; input.steer = 0; input.nitro = false;
      return;
    }

    // ---- 目标点：速度越快看得越远 ----
    const look = clamp(11 + Math.abs(v.speed) * 0.72, 12, 62);
    const aheadD = v.distance + look;
    path.frameAt(aheadD, this.aim);

    // ---- 走线：内切弯心 + 性格偏移 ----
    const k = path.curvatureAt(v.distance + look * 0.6);
    const room = TRACK.halfWidth - 3.4;
    // κ>0 = 左转 ⇒ 贴左侧（lateral 正方向为左）
    let targetLat = clamp(Math.sign(k) * Math.min(Math.abs(k) * 620, 1) * room * this.apex, -room, room);
    targetLat += this.bias * 0.5 + Math.sin(time * 0.35 + this.phase) * 1.4;

    // ---- 避让：前方近距离有车就往旁边挪 ----
    for (const o of cars) {
      if (o === v) continue;
      const gap = wrapDelta(o.distance - v.distance, path.total);
      if (gap > 0 && gap < 26) {
        const side = o.lateral > v.lateral ? -1 : 1;
        const urgency = 1 - gap / 26;
        targetLat = clamp(o.lateral + side * (4.6 + urgency * 3.4), -room, room);
      }
    }
    targetLat = clamp(targetLat, -room, room);

    // ---- 纯追踪转向 ----
    const tx = this.aim.px + this.aim.bx * targetLat - v.pos.x;
    const tz = this.aim.pz + this.aim.bz * targetLat - v.pos.z;
    const desired = Math.atan2(tx, tz);
    const err = wrapAngle(desired - v.heading);
    // steer 为正 ⇒ heading 递减，故取负号
    input.steer = clamp(-err * 2.15, -1, 1);

    // ---- 弯道限速：取运动学与横向加速度两者的较小值 ----
    const kMax = Math.max(path.maxCurvature(v.distance, 78), 1e-5);
    const R = 1 / kMax;
    const latAccel = 19.5 * this.skill;
    const vLat = Math.sqrt(latAccel * R);
    // 由 ω = steerBase/(1+kv)·v 反解可行速度
    const s = CAR.steerBase, kf = CAR.steerFalloff;
    const disc = 1 + 4 * kf * s * R;
    const vKin = (Math.sqrt(disc) - 1) / (2 * kf) * 0.98;
    let target = Math.min(vLat, vKin, CAR.nitroVmax) * (0.93 + 0.07 * this.skill) * this.pace;

    // ---- 橡皮筋：拉开太远时互相拉近，保持胶着 ----
    if (player && !player.finished) {
      const behind = (player.progress - v.progress) / path.total; // >0 = AI 落后
      target *= 1 + clamp(behind, -0.5, 0.5) * this.rubber * 2;
    }

    if (v.speed < target - 1.5) { input.throttle = 1; input.brake = 0; }
    else if (v.speed > target + 2.5) { input.throttle = 0; input.brake = clamp((v.speed - target) / 14, 0.25, 1); }
    else { input.throttle = 0.65; input.brake = 0; }

    // ---- 氮气：直道 + 有余量才放 ----
    const straight = path.maxCurvature(v.distance, 110) < 0.0042;
    this.nitroWait -= dt;
    input.nitro = straight && v.nitro > 45 && this.nitroWait < 0 && v.speed > 34;
    if (v.nitro < 12) this.nitroWait = 5 + Math.random() * 4;

    // 大角度失控时甩尾救车
    input.handbrake = Math.abs(err) > 0.62 && v.speed > 30;
  }
}
