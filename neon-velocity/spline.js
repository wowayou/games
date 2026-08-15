// ============================================================
//  spline.js —— 赛道中心线与路径查询
//  纯数学模块：不依赖 three.js，可以直接在 node 里跑数值测试
// ============================================================

const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** 角度差归一到 [-π, π] */
export function wrapAngle(a) {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

/** 闭环距离差归一到 [-total/2, total/2] */
export function wrapDelta(d, total) {
  d %= total;
  if (d > total / 2) d -= total;
  if (d < -total / 2) d += total;
  return d;
}

export const TRACK = {
  samples: 1800,   // 中心线采样点数（间距约 1.3m）
  halfWidth: 12,   // 路面半宽（米）
  shoulder: 3.6,   // 路肩宽度：压上去会额外掉速
  wallHeight: 2.8, // 霓虹护栏高度
  laps: 3,         // 比赛圈数
  gridOffset: 34,  // 发车格在起跑线之前多少米
  bankGain: 8.2,   // 路面倾斜 = 曲率 × 该系数
  maxBank: 0.11,   // 最大倾斜（弧度）
  cars: 4,         // 场上车辆数（含玩家）
};

/**
 * 极坐标闭合赛道 r(θ)。
 * r 为 θ 的周期函数 ⇒ 曲线必然闭合、光滑且不自交（星形域），
 * 省掉了手工调 Catmull-Rom 控制点还要检查自交的麻烦。
 */
export function centerline(t, out = { x: 0, y: 0, z: 0 }) {
  const a = t * TAU;
  const r =
    338 +
    76 * Math.sin(a) +
    50 * Math.sin(2 * a + 0.72) +
    26 * Math.sin(3 * a + 2.15) +
    13 * Math.sin(5 * a + 1.3);
  out.x = Math.cos(a) * r;
  out.z = Math.sin(a) * r;
  // 起伏（米）
  out.y = 9 * Math.sin(2 * a + 1.1) + 5.5 * Math.sin(3 * a + 0.3) + 2.5 * Math.sin(5 * a);
  return out;
}

/** 加速带位置：t = 沿赛道的比例，lat = 横向偏移（正=左侧） */
export const PAD_SPOTS = [
  { t: 0.055, lat: 0 },
  { t: 0.165, lat: -6 },
  { t: 0.275, lat: 6 },
  { t: 0.395, lat: 0 },
  { t: 0.505, lat: -6.5 },
  { t: 0.615, lat: 6.5 },
  { t: 0.72, lat: 0 },
  { t: 0.83, lat: -5.5 },
  { t: 0.93, lat: 5.5 },
];

export function makeFrame() {
  return {
    px: 0, py: 0, pz: 0,   // 中心线位置
    tx: 0, ty: 0, tz: 0,   // 切线（单位）
    lx: 0, ly: 0, lz: 0,   // 水平横向（单位，正=左）
    bx: 0, by: 0, bz: 0,   // 含倾斜的横向（路面用）
    curv: 0, bank: 0, index: 0,
  };
}

export function makeHit() {
  return { distance: 0, lateral: 0, index: 0, height: 0 };
}

export class TrackPath {
  constructor(samples = TRACK.samples) {
    const n = (this.n = samples);
    const pos = (this.pos = new Float32Array(n * 3));
    const tan = (this.tan = new Float32Array(n * 3));
    const lat = (this.lat = new Float32Array(n * 3));
    const latB = (this.latB = new Float32Array(n * 3));
    const up = (this.up = new Float32Array(n * 3));
    const cum = (this.cum = new Float32Array(n + 1));
    const curv = (this.curv = new Float32Array(n));
    const bank = (this.bank = new Float32Array(n));

    const p = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < n; i++) {
      centerline(i / n, p);
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
    }

    // 累积弧长
    cum[0] = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = pos[j * 3] - pos[i * 3];
      const dy = pos[j * 3 + 1] - pos[i * 3 + 1];
      const dz = pos[j * 3 + 2] - pos[i * 3 + 2];
      cum[i + 1] = cum[i] + Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    this.total = cum[n];
    this.spacing = this.total / n;

    // 切线 / 横向 / 法向
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n;
      const b = (i + 1) % n;
      let tx = pos[b * 3] - pos[a * 3];
      let ty = pos[b * 3 + 1] - pos[a * 3 + 1];
      let tz = pos[b * 3 + 2] - pos[a * 3 + 2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      tan[i * 3] = tx; tan[i * 3 + 1] = ty; tan[i * 3 + 2] = tz;
      // lat = normalize(worldUp × tangent) = normalize(tz, 0, -tx)
      const hl = Math.hypot(tz, tx) || 1;
      const lx = tz / hl, lz = -tx / hl;
      lat[i * 3] = lx; lat[i * 3 + 1] = 0; lat[i * 3 + 2] = lz;
      // up = tangent × lat
      const ux = ty * lz - tz * 0;
      const uy = tz * lx - tx * lz;
      const uz = tx * 0 - ty * lx;
      const ul = Math.hypot(ux, uy, uz) || 1;
      up[i * 3] = ux / ul; up[i * 3 + 1] = uy / ul; up[i * 3 + 2] = uz / ul;
    }

    // 带符号曲率（XZ 平面）
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n;
      const b = (i + 1) % n;
      const ha = Math.atan2(tan[a * 3 + 2], tan[a * 3]);
      const hb = Math.atan2(tan[b * 3 + 2], tan[b * 3]);
      const ds = this.segLen(a, i) + this.segLen(i, b);
      curv[i] = ds > 0 ? wrapAngle(hb - ha) / ds : 0;
    }
    // 平滑曲率，避免采样噪声
    const sm = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let o = -6; o <= 6; o++) s += curv[(i + o + n) % n];
      sm[i] = s / 13;
    }
    this.curv = sm;

    // 倾斜：外侧抬高（β = -κ·gain）
    for (let i = 0; i < n; i++) {
      const b = clamp(-sm[i] * TRACK.bankGain, -TRACK.maxBank, TRACK.maxBank);
      bank[i] = b;
      const cb = Math.cos(b), sb = Math.sin(b);
      // Rodrigues：lat 绕 tangent 旋转 β（lat ⟂ tangent，故简化为 lat·cos + up·sin）
      latB[i * 3] = lat[i * 3] * cb + up[i * 3] * sb;
      latB[i * 3 + 1] = lat[i * 3 + 1] * cb + up[i * 3 + 1] * sb;
      latB[i * 3 + 2] = lat[i * 3 + 2] * cb + up[i * 3 + 2] * sb;
    }

    this.pads = PAD_SPOTS.map((s) => ({
      d0: s.t * this.total,
      d1: s.t * this.total + 17,
      lat: s.lat,
      halfW: 4.4,
    }));
  }

  segLen(i, j) {
    const dx = this.pos[j * 3] - this.pos[i * 3];
    const dy = this.pos[j * 3 + 1] - this.pos[i * 3 + 1];
    const dz = this.pos[j * 3 + 2] - this.pos[i * 3 + 2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  wrap(d) {
    d %= this.total;
    if (d < 0) d += this.total;
    return d;
  }

  /** 距离 → 索引与插值系数 */
  locate(d) {
    d = this.wrap(d);
    const { cum, n } = this;
    let lo = 0, hi = n;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= d) lo = mid; else hi = mid;
    }
    const seg = cum[lo + 1] - cum[lo] || 1;
    return { i: lo % n, f: (d - cum[lo]) / seg };
  }

  frameAt(d, out = makeFrame()) {
    const { i, f } = this.locate(d);
    const j = (i + 1) % this.n;
    const { pos, tan, lat, latB, curv, bank } = this;
    const i3 = i * 3, j3 = j * 3;
    out.px = lerp(pos[i3], pos[j3], f);
    out.py = lerp(pos[i3 + 1], pos[j3 + 1], f);
    out.pz = lerp(pos[i3 + 2], pos[j3 + 2], f);
    out.tx = lerp(tan[i3], tan[j3], f);
    out.ty = lerp(tan[i3 + 1], tan[j3 + 1], f);
    out.tz = lerp(tan[i3 + 2], tan[j3 + 2], f);
    const tl = Math.hypot(out.tx, out.ty, out.tz) || 1;
    out.tx /= tl; out.ty /= tl; out.tz /= tl;
    out.lx = lerp(lat[i3], lat[j3], f);
    out.ly = 0;
    out.lz = lerp(lat[i3 + 2], lat[j3 + 2], f);
    const ll = Math.hypot(out.lx, out.lz) || 1;
    out.lx /= ll; out.lz /= ll;
    out.bx = lerp(latB[i3], latB[j3], f);
    out.by = lerp(latB[i3 + 1], latB[j3 + 1], f);
    out.bz = lerp(latB[i3 + 2], latB[j3 + 2], f);
    out.curv = lerp(curv[i], curv[j], f);
    out.bank = lerp(bank[i], bank[j], f);
    out.index = i;
    return out;
  }

  /** 路面上一点（含倾斜），lateral 正 = 左侧 */
  surfacePoint(d, lateral, out = { x: 0, y: 0, z: 0 }, frame = this._f0 || (this._f0 = makeFrame())) {
    this.frameAt(d, frame);
    out.x = frame.px + frame.bx * lateral;
    out.y = frame.py + frame.by * lateral;
    out.z = frame.pz + frame.bz * lateral;
    return out;
  }

  surfaceY(d, lateral) {
    const f = this.frameAt(d, this._f1 || (this._f1 = makeFrame()));
    return f.py + f.by * lateral;
  }

  curvatureAt(d) {
    const { i, f } = this.locate(d);
    return lerp(this.curv[i], this.curv[(i + 1) % this.n], f);
  }

  /** 未来 span 米内最大曲率绝对值 */
  maxCurvature(d, span, step = 6) {
    let m = 0;
    for (let s = 0; s <= span; s += step) {
      const k = Math.abs(this.curvatureAt(d + s));
      if (k > m) m = k;
    }
    return m;
  }

  /**
   * 把世界坐标投影到赛道：返回沿赛道距离 + 横向偏移。
   * hint 为上一帧的索引，只在附近窗口搜索 ⇒ O(1)。
   */
  project(p, hint = -1, out = makeHit()) {
    const { pos, n } = this;
    let best = -1, bestD2 = Infinity;
    if (hint >= 0) {
      for (let o = -50; o <= 50; o++) {
        const i = ((hint + o) % n + n) % n;
        const dx = p.x - pos[i * 3], dz = p.z - pos[i * 3 + 2];
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = i; }
      }
      if (bestD2 > 6000) best = -1; // 窗口不可信，退化为全局搜索
    }
    if (best < 0) {
      bestD2 = Infinity;
      for (let i = 0; i < n; i++) {
        const dx = p.x - pos[i * 3], dz = p.z - pos[i * 3 + 2];
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = i; }
      }
    }
    const i3 = best * 3;
    const dx = p.x - pos[i3], dy = (p.y ?? 0) - pos[i3 + 1], dz = p.z - pos[i3 + 2];
    const along = dx * this.tan[i3] + dy * this.tan[i3 + 1] + dz * this.tan[i3 + 2];
    out.distance = this.wrap(this.cum[best] + along);
    out.lateral = dx * this.lat[i3] + dz * this.lat[i3 + 2];
    out.index = best;
    out.height = pos[i3 + 1];
    return out;
  }

  /** 数值体检：给测试脚本用 */
  analyze() {
    let minR = Infinity, minRAt = 0, maxSlope = 0;
    for (let i = 0; i < this.n; i++) {
      const k = Math.abs(this.curv[i]);
      if (k > 1e-6) {
        const R = 1 / k;
        if (R < minR) { minR = R; minRAt = this.cum[i]; }
      }
      const j = (i + 1) % this.n;
      const dy = Math.abs(this.pos[j * 3 + 1] - this.pos[i * 3 + 1]);
      const slope = dy / (this.segLen(i, j) || 1);
      if (slope > maxSlope) maxSlope = slope;
    }
    return { total: this.total, spacing: this.spacing, minRadius: minR, minRadiusAt: minRAt, maxSlope };
  }
}
