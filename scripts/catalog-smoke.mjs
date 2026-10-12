// Zero-dependency lobby checks against the actual Pages build under /games/.
// Reuse the existing Chromium DevTools Protocol harness; screenshots still need visual review.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from './build-site.mjs';
import { validateCatalog } from '../catalog.mjs';
import { launch } from '../neon-survivors/cdp.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const screenshots = resolve(process.env.SCREENSHOTS || join(project, '.devtest/catalog'));
const config = JSON.parse(await readFile(join(project, 'games.json'), 'utf8'));
const games = validateCatalog(config);
const published = games.filter(game => game.status === 'published');
const drafts = games.filter(game => game.status === 'draft');
const { output } = await buildSite();
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
let mode = 'normal';
const missing = [];
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    if (!pathname.startsWith('/games/')) { res.writeHead(404).end(); return; }
    if (pathname === '/games/games.json' && mode !== 'normal') {
      res.setHeader('Content-Type', 'application/json');
      if (mode === 'http-error') { res.writeHead(503).end('{}'); return; }
      const alternatives = { empty: { games: [] }, draft: { games: drafts }, invalid: { games: [{ status: 'typo' }] } };
      res.end(JSON.stringify(alternatives[mode]));
      return;
    }
    const relative = pathname.slice('/games/'.length) + (pathname.endsWith('/') ? 'index.html' : '');
    const file = resolve(output, relative);
    if (!file.startsWith(`${output}${sep}`)) { res.writeHead(403).end(); return; }
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': `${mime[extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(content);
  } catch {
    missing.push(req.url);
    res.writeHead(404).end();
  }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const base = `http://127.0.0.1:${server.address().port}/games/`;
let browser;
let checks = 0;
const check = (name, value, detail) => {
  assert.ok(value, `${name}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`);
  checks++;
  console.log(`✓ ${name}`);
};
try {
  await mkdir(screenshots, { recursive: true });
  browser = await launch(base);
  const { cmd, evaluate: ev, waitFor, errors } = browser;
  check('catalog loads from the Pages subpath', await waitFor(`document.querySelectorAll('.game').length === ${published.length} && document.getElementById('catalog-status').hidden`, 10000));
  const rendered = await ev(`Array.from(document.querySelectorAll('.game'), card => ({
    name: card.querySelector('h3').textContent, href: card.href,
    hint: card.querySelector('.play-hint').textContent,
    labelled: card.getAttribute('aria-labelledby') === card.querySelector('h3').id,
    described: card.getAttribute('aria-describedby') === card.querySelector('.play-hint').id,
    nested: !!card.querySelector('a, button, [tabindex]')
  }))`);
  assert.deepEqual(rendered.map(({ name, href, hint }) => ({ name, href, hint })), published.map(game => ({
    name: game.name, href: game.url || new URL(`${game.directory}/`, base).href, hint: game.playHint,
  })));
  check('names, order, links and input hints match games.json', true);
  check('each card has a unique accessible name, an input hint and only one link', rendered.every(card => card.labelled && card.described && !card.nested));
  check('summary and draft links match configuration', await ev(`document.getElementById('catalog-summary').textContent.startsWith('${published.length} 款游戏') && document.querySelectorAll('#draft-links a').length === ${drafts.length} && document.getElementById('draft-links').hidden === ${drafts.length === 0}`));

  const layouts = [];
  for (const [width, columns] of [[320, 1], [390, 1], [639, 1], [640, 2], [768, 2], [959, 2], [960, 3], [1024, 3], [1199, 3], [1200, 4], [1440, 4]]) {
    await cmd('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    for (let index = 0; index < published.length; index++) {
      await ev(`document.querySelectorAll('.game')[${index}].scrollIntoView({ block: 'center' })`);
      check(`${width}px card ${index + 1} artwork loads`, await waitFor(`(() => { const img = document.querySelectorAll('.game')[${index}].querySelector('img'); return !img || (img.complete && img.naturalWidth === 640); })()`, 5000));
    }
    await ev(`scrollTo(0, 0); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    const layout = await ev(`(() => {
      const issues = [];
      const rect = el => el.getBoundingClientRect();
      for (const card of document.querySelectorAll('.game')) {
        const name = card.querySelector('h3').textContent;
        const box = rect(card);
        for (const selector of ['h3', '.desc', '.tags', '.card-footer', '.cover-title', '.badge', '.play-hint', '.play-link']) {
          const el = card.querySelector(selector), r = rect(el);
          if (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top || r.bottom > box.bottom) issues.push(name + ': out of card ' + selector);
          if (el.clientWidth && el.scrollWidth > el.clientWidth + 1) issues.push(name + ': text overflow ' + selector);
        }
        if (rect(card.querySelector('.desc')).bottom > rect(card.querySelector('.tags')).top + 1) issues.push(name + ': description overlaps tags');
        if (rect(card.querySelector('.tags')).bottom > rect(card.querySelector('.card-footer')).top + 1) issues.push(name + ': tags overlap footer');
        if (rect(card.querySelector('.badge')).bottom > rect(card.querySelector('.cover-title')).top) issues.push(name + ': badge overlaps title');
      }
      return { width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth, issues, columns: getComputedStyle(document.getElementById('games')).gridTemplateColumns };
    })()`);
    check(`${width}px layout has ${columns} columns and no overflow, clipped text or overlapping card content`, !layout.overflow && !layout.issues.length && layout.columns.split(' ').length === columns, layout);
    layouts.push(layout);
    if ([320, 390, 1440].includes(width)) {
      const { cssContentSize } = await cmd('Page.getLayoutMetrics');
      const shot = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.ceil(cssContentSize.height), scale: 1 } });
      await writeFile(join(screenshots, `catalog-${width}.png`), Buffer.from(shot.data, 'base64'));
    }
  }
  await writeFile(join(screenshots, 'layouts.json'), `${JSON.stringify(layouts, null, 2)}\n`);
  const contrastIssues = await ev(`(() => {
    const rgb = color => { const n = color.match(/[\\d.]+/g).map(Number); return [n[0], n[1], n[2], n[3] ?? 1]; };
    const background = el => {
      if (!el) return [20, 22, 19];
      const color = rgb(getComputedStyle(el).backgroundColor);
      const under = color[3] === 1 ? [0, 0, 0] : background(el.parentElement);
      return color.slice(0, 3).map((v, i) => v * color[3] + under[i] * (1 - color[3]));
    };
    const luminance = color => color.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    return Array.from(document.querySelectorAll('.game h3, .desc, .tags span, .play-hint, .play-link'), el => {
      const text = luminance(rgb(getComputedStyle(el).color)), bg = luminance(background(el));
      return { text: el.textContent, ratio: (Math.max(text, bg) + .05) / (Math.min(text, bg) + .05) };
    }).filter(entry => entry.ratio < 4.5);
  })()`);
  check('card body text meets 4.5:1 contrast against its actual background', contrastIssues.length === 0, contrastIssues);
  check('lobby loads no external fonts, images or scripts', await ev(`performance.getEntriesByType('resource').every(entry => new URL(entry.name).origin === location.origin)`));
  check('normal rendering has no runtime errors or missing resources', errors.length === 0 && missing.length === 0, { errors, missing });

  const navigate = async (query, ready) => {
    await cmd('Page.navigate', { url: `${base}?check=${query}` });
    check(`${query} page state`, await waitFor(`location.search === '?check=${query}' && (${ready})`, 10000));
  };
  const key = async (key, code, windowsVirtualKeyCode) => {
    await cmd('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode });
    await cmd('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
  };
  await navigate('keyboard', `document.querySelectorAll('.game').length === ${published.length}`);
  await key('Tab', 'Tab', 9);
  check('first keyboard target is the skip link', await ev(`document.activeElement.classList.contains('skip-link')`));
  await key('Enter', 'Enter', 13);
  check('skip link moves focus to the collection', await waitFor(`document.activeElement.id === 'collection'`, 3000));
  await key('Tab', 'Tab', 9);
  check('cards expose a visible keyboard focus ring', await ev(`document.activeElement === document.querySelector('.game') && document.activeElement.matches(':focus-visible') && parseFloat(getComputedStyle(document.activeElement).outlineWidth) >= 3`));
  const focusShot = await cmd('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(screenshots, 'keyboard-focus.png'), Buffer.from(focusShot.data, 'base64'));
  await cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  check('reduced-motion preference disables card and artwork transitions', await ev(`Array.from(document.querySelectorAll('.game, .cover-art')).every(el => getComputedStyle(el).transitionDuration === '0s')`));
  await cmd('Emulation.setEmulatedMedia', { features: [] });

  const localIndex = published.findIndex(game => game.directory);
  if (localIndex >= 0) {
    for (let i = 0; i < localIndex; i++) await key('Tab', 'Tab', 9);
    await key('Enter', 'Enter', 13);
    const path = new URL(`${published[localIndex].directory}/`, base).pathname;
    check('Enter follows the actual local game link', await waitFor(`location.pathname === ${JSON.stringify(path)}`, 5000));
    await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cmd('Emulation.setTouchEmulationEnabled', { enabled: true });
    await navigate('touch', `document.querySelectorAll('.game').length === ${published.length}`);
    await ev(`document.querySelectorAll('.game')[${localIndex}].scrollIntoView({ block: 'center' }); new Promise(resolve => requestAnimationFrame(resolve))`);
    const point = await ev(`(() => { const r = document.querySelectorAll('.game')[${localIndex}].querySelector('h3').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check('a touch on the card body follows the same game link', await waitFor(`location.pathname === ${JSON.stringify(path)}`, 5000));
    await cmd('Emulation.setTouchEmulationEnabled', { enabled: false });
  }

  mode = 'empty';
  await navigate('empty', `document.getElementById('catalog-status')?.textContent.includes('暂时没有开放')`);
  check('empty selection shows no stale cards or drafts', await ev(`!document.querySelector('.game') && !document.querySelector('#draft-links a') && document.getElementById('draft-links').hidden && getComputedStyle(document.getElementById('draft-links')).display === 'none' && document.getElementById('catalog-summary').textContent.startsWith('0 款')`));
  if (drafts.length) {
    mode = 'draft';
    await navigate('draft', `document.getElementById('catalog-status')?.textContent.includes('草稿')`);
    check('draft-only selection keeps draft links usable', await ev(`!document.querySelector('.game') && document.querySelectorAll('#draft-links a').length === ${drafts.length}`));
  }
  check('normal, keyboard, touch and empty-state checks have no runtime errors', errors.length === 0, errors);
  for (const failure of ['invalid', 'http-error']) {
    mode = failure;
    await navigate(failure, `document.getElementById('catalog-status')?.textContent.includes('无法加载')`);
    check(`${failure} shows an error rather than stale content`, await ev(`!document.querySelector('.game') && !document.getElementById('catalog-status').hidden && document.getElementById('catalog-summary').textContent === '浏览器游戏收藏'`));
  }
  check('both expected failures were reported', errors.length === 2, errors);
  errors.length = 0;
  mode = 'normal';
  await navigate('recovery', `document.querySelectorAll('.game').length === ${published.length} && document.getElementById('catalog-status').hidden`);
  await cmd('Emulation.setScriptExecutionDisabled', { value: true });
  await navigate('no-js', `!!document.querySelector('noscript p')`);
  check('without JavaScript, a readable explanation replaces the loading state', await ev(`document.querySelector('noscript p').getBoundingClientRect().height > 0 && document.getElementById('catalog-status').hidden`));
  await cmd('Emulation.setScriptExecutionDisabled', { value: false });
  check('no unexpected runtime errors or missing files remain', errors.length === 0 && missing.length === 0, { errors, missing });
  console.log(`\n${checks} browser checks passed. Review screenshots in ${screenshots}`);
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
