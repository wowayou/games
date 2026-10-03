// 两个离线分析工具共用的最小环境；执行真实 game.js，不渲染、不播放音效。
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('./game.js', import.meta.url), 'utf8');
export const WIDTH = 1280, HEIGHT = 860, DT = 1 / 120;

export function readSeed() {
  const value = process.env.SEED ?? '12345';
  if (!/^\d+$/.test(value) || Number(value) > 0xffffffff) {
    throw new Error('SEED 必须是 0 到 4294967295 的整数。');
  }
  return Number(value);
}

export function randomSource(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x100000000);
}

export const isMain = url => !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(url);

export function createSimulation(seed) {
  const noop = () => {};
  const ctx = new Proxy({}, {
    get: (_target, key) => key === 'canvas' ? { width: WIDTH, height: HEIGHT }
      : key === 'createRadialGradient' ? () => ({ addColorStop: noop })
      : key === 'measureText' ? () => ({ width: 10 }) : noop,
    set: () => true,
  });
  const elements = new Map(), saved = new Map();
  const getElementById = id => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        id, textContent: '', innerHTML: '', style: {}, dataset: {},
        classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
        addEventListener: noop, getContext: () => ctx,
      });
    }
    return elements.get(id);
  };
  const sandbox = {
    innerWidth: WIDTH, innerHeight: HEIGHT, devicePixelRatio: 1,
    Math: Object.assign(Object.create(Math), { random: randomSource(seed) }),
    structuredClone, performance: { now: () => 0 },
    // 输入、渲染、提示/音效的计时器不执行；游戏逻辑仅由 D.step 推进。
    requestAnimationFrame: noop, cancelAnimationFrame: noop, addEventListener: noop,
    setTimeout: noop, clearTimeout: noop, setInterval: noop,
    localStorage: {
      getItem: k => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, String(v)),
      removeItem: k => saved.delete(k),
    },
    document: { getElementById, querySelectorAll: () => [], querySelector: () => null, addEventListener: noop },
  };
  sandbox.window = sandbox;
  runInNewContext(source, sandbox, { filename: 'forge-breaker/game.js' });
  return sandbox.__FORGE_DEBUG__;
}
