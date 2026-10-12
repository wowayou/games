import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { BUILD, isStalePage, loadCatalog, recoverStalePage, renderCatalog, themes, validateCatalog } from '../catalog.mjs';
import { buildSite } from '../scripts/build-site.mjs';

const config = () => ({ games: [
  { id: 'racing', name: '赛车', status: 'published', directory: 'racing' },
  { id: 'office', name: '老板来了', status: 'draft', directory: 'office' },
  { id: 'parked', name: '未上架', status: 'hidden', directory: 'parked' },
  { id: 'outside', name: '独立游戏', status: 'hidden', url: 'https://example.com/play/' },
] });

async function save(root, catalog) {
  await writeFile(join(root, 'games.json'), JSON.stringify(catalog));
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'games-catalog-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of ['index.html', 'catalog.mjs', 'catalog.css']) {
    await writeFile(join(root, file), await readFile(new URL(`../${file}`, import.meta.url)));
  }
  await mkdir(join(root, 'art'));
  for (const theme of [...themes].filter(Boolean)) {
    await writeFile(join(root, 'art', `${theme}.svg`), await readFile(new URL(`../art/${theme}.svg`, import.meta.url)));
  }
  for (const directory of ['racing', 'office']) {
    await mkdir(join(root, directory));
    for (const file of ['index.html', 'game.js', 'style.css', 'smoke.mjs', 'shot.png', '.private.js']) {
      await writeFile(join(root, directory, file), `${directory}/${file}`);
    }
  }
  await save(root, config());
  return root;
}

function page() {
  const elements = Object.fromEntries(['games', 'draft-links', 'catalog-summary', 'catalog-status']
    .map(id => [id, { innerHTML: '', textContent: '', hidden: false }]));
  return { elements, getElementById: id => elements[id] };
}

test('configuration order controls card order without a separate hardcoded game list', () => {
  const raw = config();
  raw.games[1].status = 'published';
  raw.games.reverse();
  const view = renderCatalog(raw);
  assert.equal(view.count, 2);
  assert.ok(view.cards.indexOf('office/') < view.cards.indexOf('racing/'));
});

test('one status change moves a game between cards, draft links and hidden', () => {
  const raw = config();
  let view = renderCatalog(raw);
  assert.match(view.cards, /href="racing\/"/);
  assert.doesNotMatch(view.cards, /office|parked|outside/);
  assert.match(view.drafts, /href="office\/"/);
  raw.games[1].status = 'published';
  view = renderCatalog(raw);
  assert.equal(view.count, 2);
  assert.match(view.cards, /href="office\/"/);
  assert.equal(view.drafts, '');
  raw.games[1].status = 'hidden';
  assert.doesNotMatch(JSON.stringify(renderCatalog(raw)), /office/);
});

test('empty catalogs and draft-only catalogs have an honest empty state', async () => {
  const raw = config();
  raw.games[0].status = 'hidden';
  assert.equal(renderCatalog(raw).count, 0);
  assert.match(renderCatalog(raw).empty, /草稿/);
  const document = page();
  await loadCatalog(document, async () => ({ ok: true, json: async () => ({ games: [] }) }));
  assert.equal(document.elements.games.innerHTML, '');
  assert.equal(document.elements['draft-links'].innerHTML, '');
  assert.equal(document.elements['draft-links'].hidden, true);
  assert.equal(document.elements['catalog-status'].hidden, false);
  assert.match(document.elements['catalog-status'].textContent, /暂时没有开放/);
});

test('card text is escaped and local links work below the Pages subpath', () => {
  const raw = config();
  Object.assign(raw.games[0], {
    name: '<img src=x onerror=alert(1)>', title: ['<script>', 'A & B'],
    description: '<svg onload=alert(1)>', tags: ['<b>tag</b>'], playHint: '<input autofocus>',
  });
  const view = renderCatalog(raw);
  assert.doesNotMatch(view.cards, /<img|<script|<svg|<b>|<input/);
  assert.match(view.cards, /&lt;input autofocus&gt;/);
  assert.match(view.cards, /&lt;img/);
  assert.match(view.cards, /A &amp; B/);
  assert.equal(new URL('racing/', 'https://wowayou.github.io/games/').href,
    'https://wowayou.github.io/games/racing/');
});

test('invalid states, duplicate entries, unsafe paths and unsafe URLs fail validation', () => {
  for (const patch of [
    { status: 'publised' }, { directory: '../outside' }, { directory: '/tmp' },
    { directory: 'nested/game' }, { tags: 'not-an-array' }, { theme: 'bad"class' },
    { theme: '../outside' }, { theme: 'unknown' }, { playHint: 123 },
    { url: 'https://example.com/' },
  ]) {
    const raw = config();
    Object.assign(raw.games[0], patch);
    assert.throws(() => validateCatalog(raw));
  }
  const duplicate = config();
  duplicate.games.push({ ...duplicate.games[0] });
  assert.throws(() => validateCatalog(duplicate), /唯一/);
  const duplicateDirectory = config();
  duplicateDirectory.games[1].directory = 'racing';
  assert.throws(() => validateCatalog(duplicateDirectory), /唯一/);
  for (const url of ['javascript:alert(1)', 'http://example.com/', 'https://user:secret@example.com/', '']) {
    assert.throws(() => validateCatalog({ games: [{ id: 'bad', name: 'Bad', status: 'published', url }] }));
  }
  assert.doesNotThrow(() => validateCatalog({ games: [{ id: 'future', name: 'Future', status: 'hidden', url: '' }] }));
});

test('a failed catalog request or malformed configuration shows an error instead of old hardcoded games', async t => {
  t.mock.method(console, 'error', () => {});
  for (const response of [
    { ok: false, status: 404 },
    { ok: true, json: async () => ({ games: [{ status: 'typo' }] }) },
  ]) {
    const document = page();
    await loadCatalog(document, async () => response);
    assert.equal(document.elements.games.innerHTML, '');
    assert.equal(document.elements['catalog-status'].hidden, false);
    assert.match(document.elements['catalog-status'].textContent, /无法加载/);
  }
});

test('publication includes published and draft resources but no hidden games, tests or screenshots', async t => {
  const root = await fixture(t);
  const result = await buildSite(root);
  assert.equal(result.published, 1);
  assert.equal(result.drafts, 1);
  assert.deepEqual((await readdir(result.output)).sort(), ['catalog.css', 'catalog.mjs', 'games.json', 'index.html', 'office', 'racing']);
  assert.equal(await readFile(join(result.output, 'catalog.css'), 'utf8'), await readFile(join(root, 'catalog.css'), 'utf8'));
  assert.deepEqual((await readdir(join(result.output, 'racing'))).sort(), ['game.js', 'index.html', 'style.css']);
  assert.equal(await readFile(join(result.output, 'racing/game.js'), 'utf8'), 'racing/game.js');
  const visible = JSON.parse(await readFile(join(result.output, 'games.json'), 'utf8'));
  assert.deepEqual(visible.games.map(game => game.id), ['racing', 'office']);
  assert.equal(renderCatalog(visible).cards, renderCatalog(config()).cards);
});

test('hiding a previously published game removes its old files on the next build', async t => {
  const root = await fixture(t);
  await buildSite(root);
  const raw = config();
  raw.games[0].status = 'hidden';
  await save(root, raw);
  const result = await buildSite(root);
  await assert.rejects(access(join(result.output, 'racing')), { code: 'ENOENT' });
  const visible = JSON.parse(await readFile(join(result.output, 'games.json'), 'utf8'));
  assert.equal(renderCatalog(visible).cards, '');
  assert.match(renderCatalog(visible).drafts, /office/);
  assert.equal(await readFile(join(root, 'racing/game.js'), 'utf8'), 'racing/game.js');
});

test('enabling an external game only adds its URL and does not copy its local repository', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'outside/.git'), { recursive: true });
  await writeFile(join(root, 'outside/private.txt'), 'local project data');
  const raw = config();
  raw.games[3].status = 'published';
  await save(root, raw);
  const result = await buildSite(root);
  const visible = JSON.parse(await readFile(join(result.output, 'games.json'), 'utf8'));
  assert.match(renderCatalog(visible).cards, /href="https:\/\/example.com\/play\/"/);
  await assert.rejects(access(join(result.output, 'outside')), { code: 'ENOENT' });
  assert.equal(await readFile(join(root, 'outside/private.txt'), 'utf8'), 'local project data');
});

test('a fully hidden selection produces only the lobby, module and empty public catalog', async t => {
  const root = await fixture(t);
  const raw = config();
  raw.games.forEach(game => { game.status = 'hidden'; });
  await save(root, raw);
  const result = await buildSite(root);
  assert.deepEqual((await readdir(result.output)).sort(), ['catalog.css', 'catalog.mjs', 'games.json', 'index.html']);
  assert.deepEqual(JSON.parse(await readFile(join(result.output, 'games.json'), 'utf8')), { games: [] });
});

test('invalid selection and missing resources fail without replacing the previous valid output', async t => {
  const root = await fixture(t);
  const result = await buildSite(root);
  const before = await readFile(join(result.output, 'games.json'), 'utf8');
  const raw = config();
  raw.games[2].status = 'published';
  await save(root, raw);
  await assert.rejects(buildSite(root), /游戏目录不存在/);
  assert.equal(await readFile(join(result.output, 'games.json'), 'utf8'), before);
  await writeFile(join(root, 'games.json'), '{ invalid JSON');
  await assert.rejects(buildSite(root), SyntaxError);
  assert.equal(await readFile(join(result.output, 'games.json'), 'utf8'), before);
  await save(root, config());
  for (const file of ['catalog.mjs', 'catalog.css']) {
    const content = await readFile(join(root, file));
    await rm(join(root, file));
    await assert.rejects(buildSite(root), { code: 'ENOENT' });
    assert.equal(await readFile(join(result.output, 'games.json'), 'utf8'), before);
    await writeFile(join(root, file), content);
  }
  assert.ok((await readdir(root)).every(name => !name.startsWith('.site-build-')));
});

test('all supported themes have local decorative art, safe markup and a complete unthemed default', async () => {
  const css = await readFile(new URL('../catalog.css', import.meta.url), 'utf8');
  for (const theme of themes) {
    const raw = config();
    Object.assign(raw.games[0], { theme, playHint: '需要键盘操作' });
    const view = renderCatalog(raw);
    assert.match(view.cards, /aria-labelledby="title-racing" aria-describedby="hint-racing"/);
    assert.match(view.cards, /<h3 id="title-racing">赛车<\/h3>/);
    assert.match(view.cards, /id="hint-racing">需要键盘操作/);
    assert.match(view.cards, /开始游戏/);
    if (theme) {
      assert.ok(view.cards.includes(`src="art/${theme}.svg" alt="" width="640" height="400"`));
      assert.ok(css.includes(`.game.${theme} {`), `${theme} has presentation tokens`);
      const svg = await readFile(new URL(`../art/${theme}.svg`, import.meta.url), 'utf8');
      assert.match(svg, /viewBox="0 0 640 400"/);
      assert.doesNotMatch(svg, /<script|<foreignObject|<image|\bon\w+\s*=|(?:href|src)="https?:/i);
    } else {
      assert.doesNotMatch(view.cards, /<img/);
    }
  }
  assert.equal(validateCatalog(config())[0].playHint, '浏览器即玩');
});

test('rendering reserves image space and defers artwork below the first four cards', () => {
  const games = Array.from({ length: 6 }, (_, i) => ({
    id: `sample-${i}`, name: `游戏 ${i}`, status: 'published', theme: 'sky', url: 'https://example.com/',
  }));
  const view = renderCatalog({ games });
  assert.equal((view.cards.match(/loading="eager"/g) ?? []).length, 4);
  assert.equal((view.cards.match(/loading="lazy"/g) ?? []).length, 2);
  assert.doesNotMatch(view.cards, /card-number/);
});

test('publication stamps one content version into the lobby page, module, styles and covers', async t => {
  const root = await fixture(t);
  const raw = config();
  raw.games[0].theme = 'sky';
  await save(root, raw);
  const first = await buildSite(root);
  assert.match(first.build, /^[0-9a-f]{10}$/);
  const html = await readFile(join(first.output, 'index.html'), 'utf8');
  assert.ok(html.includes(`<html lang="zh-CN" data-build="${first.build}">`));
  assert.ok(html.includes(`href="catalog.css?v=${first.build}"`));
  assert.ok(html.includes(`src="catalog.mjs?v=${first.build}"`));
  assert.equal(BUILD, 'dev');
  assert.match(await readFile(join(root, 'catalog.mjs'), 'utf8'), /export const BUILD = 'dev';/);
  const built = await import(`${pathToFileURL(join(first.output, 'catalog.mjs')).href}?t=${first.build}`);
  assert.equal(built.BUILD, first.build);
  assert.match(built.renderCatalog(raw).cards, new RegExp(`src="art/sky\\.svg\\?v=${first.build}"`));
  assert.equal((await buildSite(root)).build, first.build);
  await writeFile(join(root, 'art/sky.svg'), `${await readFile(join(root, 'art/sky.svg'), 'utf8')}<!-- changed -->\n`);
  assert.notEqual((await buildSite(root)).build, first.build);
});

test('a lobby file without its version marker fails without replacing valid output', async t => {
  const root = await fixture(t);
  const result = await buildSite(root);
  const before = await readFile(join(result.output, 'index.html'), 'utf8');
  const module = await readFile(join(root, 'catalog.mjs'), 'utf8');
  await writeFile(join(root, 'catalog.mjs'), module.replace("export const BUILD = 'dev';", "export const BUILD = 'x';"));
  await assert.rejects(buildSite(root), /版本标记/);
  await writeFile(join(root, 'catalog.mjs'), module);
  const html = await readFile(join(root, 'index.html'), 'utf8');
  await writeFile(join(root, 'index.html'), html.replace('href="catalog.css"', 'href="./catalog.css"'));
  await assert.rejects(buildSite(root), /版本标记/);
  assert.equal(await readFile(join(result.output, 'index.html'), 'utf8'), before);
  assert.ok((await readdir(root)).every(name => !name.startsWith('.site-build-')));
});

test('a page cached from another deploy reloads once, then asks for a refresh instead of looping', () => {
  const doc = build => ({ documentElement: { dataset: build ? { build } : {} }, ...page() });
  assert.equal(isStalePage(doc(), 'dev'), false);
  assert.equal(isStalePage(doc('abc'), 'abc'), false);
  assert.equal(isStalePage(doc(), 'abc'), true);
  assert.equal(isStalePage(doc('old'), 'abc'), true);
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  let reloads = 0;
  const location = { reload: () => { reloads++; } };
  const stale = doc('old');
  assert.equal(recoverStalePage(stale, location, storage, 'abc'), 'reload');
  assert.equal(recoverStalePage(stale, location, storage, 'abc'), 'message');
  assert.equal(reloads, 1);
  assert.match(stale.elements['catalog-status'].textContent, /刷新/);
  assert.equal(stale.elements['catalog-status'].hidden, false);
  const blocked = doc();
  const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(recoverStalePage(blocked, location, throwing, 'abc'), 'message');
  assert.equal(recoverStalePage(doc(), location, null, 'abc'), 'message');
  assert.equal(reloads, 1);
});

test('failed reloads clear stale cards and counts, and a later successful request recovers', async t => {
  t.mock.method(console, 'error', () => {});
  const document = page();
  const load = () => loadCatalog(document, async () => ({ ok: true, json: async () => config() }));
  await load();
  assert.match(document.elements['catalog-summary'].textContent, /^1 款游戏/);
  assert.equal(document.elements['catalog-status'].hidden, true);
  await loadCatalog(document, async () => { throw new Error('offline'); });
  assert.equal(document.elements.games.innerHTML, '');
  assert.equal(document.elements['draft-links'].innerHTML, '');
  assert.equal(document.elements['catalog-summary'].textContent, '浏览器游戏收藏');
  assert.equal(document.elements['catalog-status'].hidden, false);
  await load();
  assert.match(document.elements.games.innerHTML, /href="racing\/"/);
  assert.equal(document.elements['catalog-status'].hidden, true);
});

test('publication copies only unique published artwork and removes it after hiding a game', async t => {
  const root = await fixture(t);
  const raw = config();
  raw.games[0].theme = 'sky';
  raw.games[1].theme = 'wuxia'; // Drafts have text links, not artwork.
  raw.games[2].theme = 'forge';
  Object.assign(raw.games[3], { status: 'published', theme: 'sky' });
  await save(root, raw);
  const result = await buildSite(root);
  assert.deepEqual(await readdir(join(result.output, 'art')), ['sky.svg']);
  assert.equal(await readFile(join(result.output, 'art/sky.svg'), 'utf8'), await readFile(join(root, 'art/sky.svg'), 'utf8'));
  assert.match(renderCatalog(JSON.parse(await readFile(join(result.output, 'games.json'), 'utf8'))).cards, /art\/sky.svg/);
  raw.games[0].status = raw.games[3].status = 'hidden';
  await save(root, raw);
  await buildSite(root);
  await assert.rejects(access(join(result.output, 'art')), { code: 'ENOENT' });
});

test('missing or symlinked artwork fails without replacing valid output', async t => {
  const root = await fixture(t);
  const raw = config();
  raw.games[0].theme = 'sky';
  await save(root, raw);
  const result = await buildSite(root);
  const before = await readFile(join(result.output, 'games.json'), 'utf8');
  await rm(join(root, 'art/sky.svg'));
  await assert.rejects(buildSite(root), /封面缺失/);
  await symlink(join(root, 'art/forge.svg'), join(root, 'art/sky.svg'));
  await assert.rejects(buildSite(root), /不是普通文件/);
  await rm(join(root, 'art'), { recursive: true });
  await symlink(join(result.output, 'art'), join(root, 'art'));
  await assert.rejects(buildSite(root), /普通封面目录/);
  assert.equal(await readFile(join(result.output, 'games.json'), 'utf8'), before);
});

test('an independent Git repository cannot be accidentally included as local game files', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'racing/.git'));
  await assert.rejects(buildSite(root), /独立仓库请配置 url/);
});

test('publication rejects symlinked source assets and output directories', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'private.js'), 'private source');
  await symlink(join(root, 'private.js'), join(root, 'racing/leak.js'));
  await assert.rejects(buildSite(root), /符号链接/);
  await rm(join(root, 'racing/leak.js'));
  await mkdir(join(root, 'keep'));
  await writeFile(join(root, 'keep/important.txt'), 'keep me');
  await symlink(join(root, 'keep'), join(root, '_site'));
  await assert.rejects(buildSite(root), /普通输出目录/);
  assert.equal(await readFile(join(root, 'keep/important.txt'), 'utf8'), 'keep me');
});
