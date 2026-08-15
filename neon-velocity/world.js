// ============================================================
//  world.js —— three.js 场景构建：赛道、城市、天空、车辆
// ============================================================

import * as THREE from 'three';
import { TRACK, PAD_SPOTS, clamp } from './spline.js';

const CYAN = 0x28f7ff, PINK = 0xff2aa8, PURPLE = 0x8d45ff, AMBER = 0xff9d2e;

/* ---------------- 程序化贴图 ---------------- */

function canvas2D(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, x: c.getContext('2d') };
}

function asphaltTexture() {
  const { c, x } = canvas2D(256, 256);
  x.fillStyle = '#0b0d16';
  x.fillRect(0, 0, 256, 256);
  // 噪点 + 湿滑反光
  for (let i = 0; i < 5200; i++) {
    const g = 12 + Math.random() * 26;
    x.fillStyle = `rgba(${g},${g + 4},${g + 12},${Math.random() * 0.5})`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  for (let i = 0; i < 34; i++) {
    x.strokeStyle = `rgba(90,150,190,${0.02 + Math.random() * 0.05})`;
    x.lineWidth = Math.random() * 8;
    x.beginPath();
    x.moveTo(Math.random() * 256, 0);
    x.lineTo(Math.random() * 256, 256);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function windowsTexture() {
  const { c, x } = canvas2D(128, 256);
  x.fillStyle = '#05060f';
  x.fillRect(0, 0, 128, 256);
  const palette = ['#28f7ff', '#ff2aa8', '#ffe548', '#8d45ff', '#5ad6ff', '#ffffff'];
  for (let row = 0; row < 30; row++) {
    for (let col = 0; col < 12; col++) {
      if (Math.random() < 0.42) continue; // 暗窗
      const col0 = palette[(Math.random() * palette.length) | 0];
      x.globalAlpha = 0.28 + Math.random() * 0.72;
      x.fillStyle = col0;
      x.fillRect(col * 10 + 3, row * 8 + 2, 5, 4.4);
    }
  }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function chevronTexture() {
  const { c, x } = canvas2D(128, 128);
  x.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 4; i++) {
    const y = i * 32;
    const grd = x.createLinearGradient(0, y, 0, y + 32);
    grd.addColorStop(0, 'rgba(40,247,255,0.05)');
    grd.addColorStop(1, 'rgba(40,247,255,0.95)');
    x.fillStyle = grd;
    x.beginPath();
    x.moveTo(8, y + 30); x.lineTo(64, y + 4); x.lineTo(120, y + 30);
    x.lineTo(120, y + 20); x.lineTo(64, y + 0.5); x.lineTo(8, y + 20);
    x.closePath(); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function checkerTexture() {
  const { c, x } = canvas2D(128, 32);
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 4; j++) {
      x.fillStyle = (i + j) % 2 ? '#f2fbff' : '#0b1020';
      x.fillRect(i * 8, j * 8, 8, 8);
    }
  }
  return new THREE.CanvasTexture(c);
}

function signTexture(text, color) {
  const { c, x } = canvas2D(512, 128);
  x.fillStyle = 'rgba(4,6,18,0.86)';
  x.fillRect(0, 0, 512, 128);
  x.strokeStyle = color; x.lineWidth = 5;
  x.strokeRect(9, 9, 494, 110);
  x.font = 'bold 62px Orbitron, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = color; x.shadowBlur = 26;
  x.fillStyle = color;
  x.fillText(text, 256, 68);
  return new THREE.CanvasTexture(c);
}

function glowSprite() {
  const { c, x } = canvas2D(64, 64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.28, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export const TEX = {};
export function initTextures() {
  TEX.asphalt = asphaltTexture();
  TEX.windows = windowsTexture();
  TEX.chevron = chevronTexture();
  TEX.checker = checkerTexture();
  TEX.glow = glowSprite();
}

/* ---------------- 赛道 ---------------- */

export function buildTrack(path) {
  const group = new THREE.Group();
  const n = path.n;
  const hw = TRACK.halfWidth;
  const shoulder = TRACK.shoulder;

  // ---- 路面 ribbon（含路肩）----
  const total = hw + shoulder;
  const verts = [], uvs = [], idx = [];
  const pt = { x: 0, y: 0, z: 0 };
  for (let i = 0; i <= n; i++) {
    const d = (i % n) * path.spacing;
    const v = path.cum[i % n] / 14;
    path.surfacePoint(d, total, pt);
    verts.push(pt.x, pt.y + 0.02, pt.z); uvs.push(0, v);
    path.surfacePoint(d, -total, pt);
    verts.push(pt.x, pt.y + 0.02, pt.z); uvs.push(1, v);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = a + 1, c = a + 2, dd = a + 3;
    idx.push(a, c, b, b, c, dd);
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  roadGeo.setIndex(idx);
  roadGeo.computeVertexNormals();
  TEX.asphalt.repeat.set(1, 1);
  const road = new THREE.Mesh(roadGeo, new THREE.MeshStandardMaterial({
    map: TEX.asphalt, color: 0x8f9bb5, roughness: 0.62, metalness: 0.28,
  }));
  road.receiveShadow = false;
  group.add(road);

  // ---- 霓虹边线 + 护栏 ----
  const stripe = (lateral, color, width, yOff, emissive) => {
    const v = [], ix = [];
    for (let i = 0; i <= n; i++) {
      const d = (i % n) * path.spacing;
      path.surfacePoint(d, lateral + width / 2, pt);
      v.push(pt.x, pt.y + yOff, pt.z);
      path.surfacePoint(d, lateral - width / 2, pt);
      v.push(pt.x, pt.y + yOff, pt.z);
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      ix.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(ix);
    g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: emissive, roughness: 0.4, toneMapped: false,
    });
    const mesh = new THREE.Mesh(g, m);
    group.add(mesh);
    return mesh;
  };
  stripe(hw - 0.35, CYAN, 0.6, 0.05, 2.6);
  stripe(-(hw - 0.35), PINK, 0.6, 0.05, 2.6);
  stripe(hw + shoulder - 0.2, 0xffffff, 0.35, 0.045, 0.7);
  stripe(-(hw + shoulder - 0.2), 0xffffff, 0.35, 0.045, 0.7);

  // ---- 护栏墙（竖直 ribbon，双面）----
  const wall = (side, color) => {
    const v = [], ix = [], uv = [];
    const lateral = side * (hw + shoulder);
    for (let i = 0; i <= n; i++) {
      const d = (i % n) * path.spacing;
      path.surfacePoint(d, lateral, pt);
      v.push(pt.x, pt.y, pt.z); uv.push(path.cum[i % n] / 10, 0);
      v.push(pt.x, pt.y + TRACK.wallHeight, pt.z); uv.push(path.cum[i % n] / 10, 1);
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      ix.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(ix);
    g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({
      color: 0x0a1024, emissive: color, emissiveIntensity: 0.42,
      metalness: 0.72, roughness: 0.34, side: THREE.DoubleSide,
    });
    group.add(new THREE.Mesh(g, m));
    // 顶部发光条
    const topV = [], topI = [];
    for (let i = 0; i <= n; i++) {
      const d = (i % n) * path.spacing;
      path.surfacePoint(d, lateral, pt);
      topV.push(pt.x, pt.y + TRACK.wallHeight, pt.z);
      topV.push(pt.x - side * 0.001, pt.y + TRACK.wallHeight - 0.34, pt.z);
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      topI.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(topV, 3));
    tg.setIndex(topI);
    tg.computeVertexNormals();
    group.add(new THREE.Mesh(tg, new THREE.MeshBasicMaterial({
      color, side: THREE.DoubleSide, toneMapped: false,
    })));
  };
  wall(1, CYAN);
  wall(-1, PINK);

  // ---- 中线虚线 ----
  const dashGeo = new THREE.PlaneGeometry(0.32, 4.2);
  const dashCount = Math.floor(path.total / 16);
  const dashes = new THREE.InstancedMesh(
    dashGeo,
    new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.4, toneMapped: false }),
    dashCount,
  );
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3();
  for (let i = 0; i < dashCount; i++) {
    const d = i * 16;
    const f = path.frameAt(d);
    fwd.set(f.tx, f.ty, f.tz);
    const mm = new THREE.Matrix4().lookAt(new THREE.Vector3(), fwd, up);
    q.setFromRotationMatrix(mm);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    m4.compose(new THREE.Vector3(f.px, f.py + 0.04, f.pz), q, sc);
    dashes.setMatrixAt(i, m4);
  }
  group.add(dashes);

  // ---- 加速带 ----
  const padMat = new THREE.MeshBasicMaterial({
    map: TEX.chevron, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
  TEX.chevron.repeat.set(1, 3);
  const pads = [];
  for (const spot of PAD_SPOTS) {
    const d = spot.t * path.total;
    const geo = new THREE.PlaneGeometry(8.8, 17, 1, 6);
    // 沿赛道弯曲贴合
    const p = geo.attributes.position;
    const tmp = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i), lz = p.getY(i);
      path.surfacePoint(d + lz + 8.5, spot.lat + lx, tmp);
      p.setXYZ(i, tmp.x, tmp.y + 0.09, tmp.z);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, padMat.clone());
    mesh.userData.padIndex = pads.length;
    group.add(mesh);
    pads.push(mesh);
  }

  // ---- 起跑线 + 龙门架 ----
  const lineGeo = new THREE.PlaneGeometry((hw + shoulder) * 2, 3, 1, 1);
  {
    const p = lineGeo.attributes.position;
    const tmp = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i), lz = p.getY(i);
      path.surfacePoint(lz, -lx, tmp);
      p.setXYZ(i, tmp.x, tmp.y + 0.07, tmp.z);
    }
    lineGeo.computeVertexNormals();
    TEX.checker.wrapS = TEX.checker.wrapT = THREE.RepeatWrapping;
    TEX.checker.repeat.set(10, 1);
    group.add(new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ map: TEX.checker, side: THREE.DoubleSide })));
  }
  {
    const f = path.frameAt(0);
    const arch = new THREE.Group();
    const postGeo = new THREE.BoxGeometry(1.1, 13, 1.1);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x111a30, metalness: 0.85, roughness: 0.3, emissive: PURPLE, emissiveIntensity: 0.22 });
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(f.px + f.lx * s * (hw + shoulder + 1), f.py + 6.5, f.pz + f.lz * s * (hw + shoulder + 1));
      arch.add(post);
    }
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry((hw + shoulder + 1.6) * 2, 2.4, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x0c1327, metalness: 0.8, roughness: 0.35, emissive: CYAN, emissiveIntensity: 0.5 }),
    );
    beam.position.set(f.px, f.py + 12.4, f.pz);
    beam.lookAt(f.px + f.tx, f.py + 12.4, f.pz + f.tz);
    beam.rotateY(Math.PI / 2);
    arch.add(beam);
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 4),
      new THREE.MeshBasicMaterial({ map: signTexture('FINISH', CYAN === 0x28f7ff ? '#28f7ff' : '#fff'), transparent: true, side: THREE.DoubleSide, toneMapped: false }),
    );
    banner.position.set(f.px, f.py + 12.4, f.pz);
    banner.lookAt(f.px - f.tx, f.py + 12.4, f.pz - f.tz);
    arch.add(banner);
    group.add(arch);
  }

  return { group, pads, padMaterialTexture: TEX.chevron };
}

/* ---------------- 城市 / 环境 ---------------- */

export function buildCity(path) {
  const group = new THREE.Group();
  const rand = mulberry(9271);

  // 判断某点是否离赛道太近
  const clearance = TRACK.halfWidth + TRACK.shoulder + 30;
  const near = (x, z) => {
    const hit = path.project({ x, y: 0, z }, -1);
    return Math.abs(hit.lateral) < clearance;
  };

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const tints = [
    new THREE.Color(0x121a3a), new THREE.Color(0x1b1230),
    new THREE.Color(0x0d2038), new THREE.Color(0x1d1526),
  ];
  const positions = [];
  const R = 900;
  for (let gx = -R; gx <= R; gx += 46) {
    for (let gz = -R; gz <= R; gz += 46) {
      const jx = gx + (rand() - 0.5) * 22;
      const jz = gz + (rand() - 0.5) * 22;
      const dist = Math.hypot(jx, jz);
      if (dist > R) continue;
      if (near(jx, jz)) continue;
      // 离赛道越远越高，形成天际线纵深
      const h = 16 + rand() * 46 + Math.min(dist / 8, 78) * (0.5 + rand() * 0.9);
      const w = 13 + rand() * 17;
      positions.push({ x: jx, z: jz, h, w, d: 13 + rand() * 17, tint: (rand() * tints.length) | 0 });
    }
  }

  const mat = new THREE.MeshStandardMaterial({
    map: TEX.windows, emissiveMap: TEX.windows, emissive: 0xffffff,
    emissiveIntensity: 0.85, color: 0x2a3350, roughness: 0.72, metalness: 0.34,
  });
  const buildings = new THREE.InstancedMesh(boxGeo, mat, positions.length);
  const m4 = new THREE.Matrix4();
  const dummyQ = new THREE.Quaternion();
  positions.forEach((b, i) => {
    m4.compose(new THREE.Vector3(b.x, b.h / 2 - 1, b.z), dummyQ, new THREE.Vector3(b.w, b.h, b.d));
    buildings.setMatrixAt(i, m4);
    buildings.setColorAt(i, tints[b.tint]);
  });
  buildings.instanceMatrix.needsUpdate = true;
  if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
  group.add(buildings);

  // 楼顶霓虹条
  const neonColors = [CYAN, PINK, PURPLE, AMBER];
  const roofGeo = new THREE.BoxGeometry(1, 0.7, 1);
  const roofs = positions.filter(() => rand() < 0.42);
  const roofMesh = new THREE.InstancedMesh(
    roofGeo,
    new THREE.MeshBasicMaterial({ toneMapped: false }),
    roofs.length,
  );
  roofs.forEach((b, i) => {
    m4.compose(new THREE.Vector3(b.x, b.h - 0.6, b.z), dummyQ, new THREE.Vector3(b.w * 1.03, 1, b.d * 1.03));
    roofMesh.setMatrixAt(i, m4);
    roofMesh.setColorAt(i, new THREE.Color(neonColors[(rand() * neonColors.length) | 0]));
  });
  roofMesh.instanceMatrix.needsUpdate = true;
  if (roofMesh.instanceColor) roofMesh.instanceColor.needsUpdate = true;
  group.add(roofMesh);

  // 地面
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4200, 4200),
    new THREE.MeshStandardMaterial({ color: 0x05070f, roughness: 0.92, metalness: 0.1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.4;
  group.add(ground);

  // 赛道旁的全息广告牌
  const signs = [
    ['新九龍', '#ff2aa8'], ['NEON', '#28f7ff'], ['夜城電力', '#ffe548'],
    ['SYNTH', '#8d45ff'], ['加速', '#28f7ff'], ['ARASAKA', '#ff2aa8'],
    ['麵', '#ff9d2e'], ['VELOCITY', '#28f7ff'],
  ];
  signs.forEach((s, i) => {
    const d = (i / signs.length) * path.total + 60;
    const f = path.frameAt(d);
    const side = i % 2 ? 1 : -1;
    const off = TRACK.halfWidth + TRACK.shoulder + 22;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(17, 4.3),
      new THREE.MeshBasicMaterial({ map: signTexture(s[0], s[1]), transparent: true, side: THREE.DoubleSide, toneMapped: false }),
    );
    mesh.position.set(f.px + f.lx * side * off, f.py + 8.5 + (i % 3) * 2.4, f.pz + f.lz * side * off);
    mesh.lookAt(f.px, mesh.position.y, f.pz);
    group.add(mesh);
    // 支撑柱
    const pole = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 9, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x0d122a, metalness: 0.8, roughness: 0.4 }),
    );
    pole.position.set(mesh.position.x, f.py + 4, mesh.position.z);
    group.add(pole);
  });

  return group;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSky() {
  const geo = new THREE.SphereGeometry(2600, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0x04040e) }, mid: { value: new THREE.Color(0x1a0b3c) }, bot: { value: new THREE.Color(0x431a55) } },
    vertexShader: `varying float vH; void main(){ vH = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying float vH;
      void main(){ float h = clamp(vH*0.5+0.5,0.0,1.0);
        vec3 c = mix(bot, mid, smoothstep(0.38,0.55,h));
        c = mix(c, top, smoothstep(0.55,0.92,h));
        gl_FragColor = vec4(c,1.0); }`,
  });
  const sky = new THREE.Mesh(geo, mat);

  // 星星
  const N = 900;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(Math.random() * 0.85 + 0.12);
    const r = 2400;
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph) + 300;
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({
    size: 8, color: 0x9fd0ff, transparent: true, opacity: 0.7,
    map: TEX.glow, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));

  const group = new THREE.Group();
  group.add(sky); group.add(stars);
  return group;
}

/* ---------------- 车辆 ---------------- */

export function buildCar(color, isPlayer) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.62, 4.4),
    new THREE.MeshStandardMaterial({ color, metalness: 0.82, roughness: 0.26, emissive: color, emissiveIntensity: 0.12 }),
  );
  body.position.y = 0.66;
  g.add(body);

  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(1.72, 0.4, 1.15),
    new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness: 0.24 }),
  );
  nose.position.set(0, 0.5, 2.4);
  g.add(nose);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.56, 0.56, 1.95),
    new THREE.MeshStandardMaterial({ color: 0x05070f, metalness: 0.62, roughness: 0.12, emissive: 0x0a1c33, emissiveIntensity: 0.5 }),
  );
  cabin.position.set(0, 1.16, -0.2);
  g.add(cabin);

  const spoiler = new THREE.Mesh(
    new THREE.BoxGeometry(2.14, 0.13, 0.62),
    new THREE.MeshStandardMaterial({ color: 0x0b0f1c, metalness: 0.7, roughness: 0.4, emissive: color, emissiveIntensity: 0.28 }),
  );
  spoiler.position.set(0, 1.22, -2.16);
  g.add(spoiler);
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.42, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x0b0f1c, metalness: 0.7, roughness: 0.4 }),
    );
    fin.position.set(s * 0.9, 1.0, -2.12);
    g.add(fin);
  }

  // 车轮
  const wheelGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.4, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x08090f, roughness: 0.85, metalness: 0.2 });
  const rimMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const wheels = [], frontWheels = [];
  for (const [wx, wz, front] of [[-1.02, 1.42, true], [1.02, 1.42, true], [-1.02, -1.46, false], [1.02, -1.46, false]]) {
    const holder = new THREE.Group();
    holder.position.set(wx, 0.52, wz);
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    holder.add(w);
    const rim = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12), rimMat);
    rim.position.x = wx < 0 ? -0.22 : 0.22;
    rim.rotation.y = wx < 0 ? -Math.PI / 2 : Math.PI / 2;
    holder.add(rim);
    g.add(holder);
    wheels.push(w);
    if (front) frontWheels.push(holder);
  }

  // 尾灯 / 头灯
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(1.84, 0.14, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xff2c4a, toneMapped: false }),
  );
  tail.position.set(0, 0.78, -2.22);
  g.add(tail);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.1, 0.06),
    new THREE.MeshBasicMaterial({ color: 0xf2fdff, toneMapped: false }),
  );
  head.position.set(0, 0.62, 2.97);
  g.add(head);

  // 车底霓虹
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.0, 5.4),
    new THREE.MeshBasicMaterial({
      map: TEX.glow, color, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.06;
  g.add(glow);

  // 排气喷口（氮气时放大）
  const flames = [];
  for (const s of [-0.55, 0.55]) {
    const f = new THREE.Mesh(
      new THREE.ConeGeometry(0.24, 1.5, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x8ef4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    f.rotation.x = -Math.PI / 2;
    f.position.set(s, 0.61, -2.43);
    g.add(f);
    flames.push(f);
  }

  if (isPlayer) {
    const light = new THREE.PointLight(color, 14, 26, 2);
    light.position.set(0, 1.1, 0);
    g.add(light);
  }

  return { group: g, wheels, frontWheels, glow, flames, tail };
}
