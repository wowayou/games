// ============================================================
//  particles.js —— 对象池粒子系统（单个 Points draw call）
//  尾气、火花、加速带爆发、轮胎烟、雨、速度线
// ============================================================

import * as THREE from 'three';
import { TEX } from './world.js';

const MAX = 4200;

export class Particles {
  constructor(scene) {
    this.n = MAX;
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.max = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.cursor = 0;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo = g;

    // 自定义 shader：支持逐粒子颜色/大小/透明度
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: TEX.glow }, uScale: { value: window.innerHeight * 0.5 } },
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
        varying vec3 vColor; varying float vAlpha; uniform float uScale;
        void main(){
          vColor = aColor; vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uTex; varying vec3 vColor; varying float vAlpha;
        void main(){
          vec4 t = texture2D(uTex, gl_PointCoord);
          if (vAlpha <= 0.001) discard;
          gl_FragColor = vec4(vColor, t.a * vAlpha);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this._c = new THREE.Color();
  }

  resize(h) { this.mat.uniforms.uScale.value = h * 0.5; }

  spawn(x, y, z, vx, vy, vz, color, size, life, drag = 1.6, grav = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this._c.set(color);
    this.col[i3] = this._c.r; this.col[i3 + 1] = this._c.g; this.col[i3 + 2] = this._c.b;
    this.size[i] = size;
    this.life[i] = life; this.max[i] = life;
    this.alpha[i] = 1;
    this.drag[i] = drag; this.grav[i] = grav;
  }

  /** 尾气：严格以车体局部 -Z 尾部双喷口为锚点，避免转弯时漂到侧面 */
  exhaust(car, boosting, dt) {
    const count = boosting ? 4 : 1;
    const back = boosting ? 14 : 3.5;
    for (let k = 0; k < count; k++) {
      if (!boosting && Math.random() > 0.55) continue;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      const rx = Math.cos(car.heading), rz = -Math.sin(car.heading);
      const side = (Math.random() - 0.5) * 1.2;
      const rearX = car.pos.x - fx * 2.45 + rx * side;
      const rearZ = car.pos.z - fz * 2.45 + rz * side;
      this.spawn(
        rearX, car.pos.y + 0.56 + Math.random() * 0.18, rearZ,
        -fx * back + (Math.random() - 0.5) * 3,
        0.8 + Math.random() * 1.4,
        -fz * back + (Math.random() - 0.5) * 3,
        boosting ? (Math.random() < 0.5 ? 0x8ef7ff : 0x3f8fff) : 0x54607a,
        boosting ? 0.55 + Math.random() * 0.5 : 0.5 + Math.random() * 0.4,
        boosting ? 0.34 : 0.6,
        boosting ? 3.2 : 1.1,
        boosting ? 0 : 1.4,
      );
    }
  }

  sparks(x, y, z, strength = 1, color = 0xffd75e) {
    const n = Math.min(34, 10 + strength * 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 4 + Math.random() * 13 * Math.min(2, strength * 0.3);
      this.spawn(
        x, y, z,
        Math.cos(a) * s, 2 + Math.random() * 7, Math.sin(a) * s,
        Math.random() < 0.6 ? color : 0xffffff,
        0.24 + Math.random() * 0.3, 0.42 + Math.random() * 0.3, 1.5, -16,
      );
    }
  }

  padBurst(x, y, z) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 3.4;
      this.spawn(
        x + Math.cos(a) * r, y + 0.2, z + Math.sin(a) * r,
        Math.cos(a) * 3.4, 7 + Math.random() * 9, Math.sin(a) * 3.4,
        Math.random() < 0.5 ? 0x28f7ff : 0xffffff,
        0.4 + Math.random() * 0.45, 0.5, 1.5, -3,
      );
    }
  }

  smoke(car) {
    const rx = Math.cos(car.heading), rz = -Math.sin(car.heading);
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    for (const s of [-1, 1]) {
      this.spawn(
        car.pos.x + rx * s * 1.05 - fx * 1.4,
        car.pos.y + 0.22,
        car.pos.z + rz * s * 1.05 - fz * 1.4,
        (Math.random() - 0.5) * 2.4, 0.7 + Math.random(), (Math.random() - 0.5) * 2.4,
        0x9aa7bd, 0.7 + Math.random() * 0.7, 0.72, 1.1, 0.6,
      );
    }
  }

  update(dt) {
    const { pos, vel, life, max, alpha, drag, grav, n } = this;
    for (let i = 0; i < n; i++) {
      if (life[i] <= 0) { if (alpha[i] !== 0) alpha[i] = 0; continue; }
      life[i] -= dt;
      if (life[i] <= 0) { alpha[i] = 0; continue; }
      const i3 = i * 3;
      const d = Math.exp(-drag[i] * dt);
      vel[i3] *= d; vel[i3 + 2] *= d;
      vel[i3 + 1] = vel[i3 + 1] * d + grav[i] * dt;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      if (pos[i3 + 1] < 0.05) { pos[i3 + 1] = 0.05; vel[i3 + 1] *= -0.32; }
      const t = life[i] / max[i];
      alpha[i] = t * t;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}

/** 速度线：相机附近生成的短线段，随速度增强 */
export class SpeedLines {
  constructor(scene) {
    this.n = 260;
    this.pos = new Float32Array(this.n * 6);
    this.life = new Float32Array(this.n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo = g;
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      color: 0xa8f4ff, transparent: true, opacity: 0.34,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this.cursor = 0;
  }

  update(dt, camera, speed, forward) {
    const strength = Math.max(0, (speed - 38) / 45);
    this.lines.material.opacity = Math.min(0.5, strength * 0.5);
    if (strength <= 0) return;
    const spawn = Math.min(9, Math.ceil(strength * 9));
    for (let k = 0; k < spawn; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.n;
      const a = Math.random() * Math.PI * 2;
      const r = 7 + Math.random() * 26;
      const ahead = 12 + Math.random() * 40;
      const x = camera.position.x + forward.x * ahead + Math.cos(a) * r;
      const y = camera.position.y + Math.sin(a) * r * 0.55;
      const z = camera.position.z + forward.z * ahead + Math.sin(a) * r;
      const len = 3 + strength * 16;
      const i6 = i * 6;
      this.pos[i6] = x; this.pos[i6 + 1] = y; this.pos[i6 + 2] = z;
      this.pos[i6 + 3] = x - forward.x * len;
      this.pos[i6 + 4] = y;
      this.pos[i6 + 5] = z - forward.z * len;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

/** 酸雨：循环复用的点，跟随相机 */
export class Rain {
  constructor(scene) {
    this.n = 1400;
    this.pos = new Float32Array(this.n * 3);
    this.vy = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) this.reset(i, 0, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo = g;
    this.points = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0x7fd4ff, size: 0.32, transparent: true, opacity: 0.4,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  reset(i, cx, cz) {
    const i3 = i * 3;
    this.pos[i3] = cx + (Math.random() - 0.5) * 150;
    this.pos[i3 + 1] = 6 + Math.random() * 62;
    this.pos[i3 + 2] = cz + (Math.random() - 0.5) * 150;
    this.vy[i] = 42 + Math.random() * 30;
  }

  update(dt, camera) {
    const cx = camera.position.x, cz = camera.position.z;
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      this.pos[i3 + 1] -= this.vy[i] * dt;
      if (this.pos[i3 + 1] < 0 ||
          Math.abs(this.pos[i3] - cx) > 90 ||
          Math.abs(this.pos[i3 + 2] - cz) > 90) this.reset(i, cx, cz);
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
