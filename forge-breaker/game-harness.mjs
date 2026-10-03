// Isolated, seeded execution of the real game, including generated draft cards.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

export function createGame({ width = 1280, height = 860, seed = 12345, source, saved = {} } = {}) {
  const elements = new Map(), events = new Map(), storage = new Map(Object.entries(saved));
  const ctx = new Proxy({}, { get: (_, k) => k === 'createRadialGradient'
    ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
  function element(id, dataset = {}) {
    if (!elements.has(id)) elements.set(id, {
      id, dataset, textContent: '', innerHTML: '', style: {}, value: '',
      classList: { values: new Set(), add(x) { this.values.add(x); }, remove(x) { this.values.delete(x); }, contains(x) { return this.values.has(x); } },
      addEventListener(type, cb) { events.set(`${id}:${type}`, cb); },
      click() { this.onclick?.(); }, getContext: () => ctx,
    });
    return elements.get(id);
  }
  function cards(selector) {
    const key = selector === '[data-up]' ? 'up' : 'forge';
    const html = element(key === 'up' ? 'cards' : 'forgeCards').innerHTML;
    return [...html.matchAll(new RegExp(`data-${key}="([^"]+)"`, 'g'))]
      .map((m) => element(`${key}:${m[1]}`, { [key]: m[1] }));
  }
  const math = Object.create(Math);
  math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const world = {
    innerWidth: width, innerHeight: height, devicePixelRatio: 1, Math: math,
    structuredClone, performance: { now: () => 0 },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    setInterval: () => 0, setTimeout: () => 0, clearTimeout() {},
    addEventListener: (type, cb) => events.set(type, cb),
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)) },
    document: { getElementById: element, querySelectorAll: s => ['[data-up]', '[data-forge]'].includes(s) ? cards(s) : [], addEventListener() {} },
  };
  world.window = world;
  runInNewContext(source ?? readFileSync(new URL('./game.js', import.meta.url), 'utf8'), world);
  return { D: world.__FORGE_DEBUG__, world, element, cards, storage,
    dispatch(type, event = {}) { events.get(type)?.({ preventDefault() {}, ...event }); } };
}
