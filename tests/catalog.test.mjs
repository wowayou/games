import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadCatalog, renderCatalog, validateCatalog } from '../catalog.mjs';
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
  for (const file of ['index.html', 'catalog.mjs']) {
    await writeFile(join(root, file), await readFile(new URL(`../${file}`, import.meta.url)));
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
  assert.equal(document.elements['catalog-status'].hidden, false);
  assert.match(document.elements['catalog-status'].textContent, /暂时没有开放/);
});

test('card text is escaped and local links work below the Pages subpath', () => {
  const raw = config();
  Object.assign(raw.games[0], {
    name: '<img src=x onerror=alert(1)>', title: ['<script>', 'A & B'],
    description: '<svg onload=alert(1)>', tags: ['<b>tag</b>'],
  });
  const view = renderCatalog(raw);
  assert.doesNotMatch(view.cards, /<img|<script|<svg|<b>/);
  assert.match(view.cards, /&lt;img/);
  assert.match(view.cards, /A &amp; B/);
  assert.equal(new URL('racing/', 'https://wowayou.github.io/games/').href,
    'https://wowayou.github.io/games/racing/');
});

test('invalid states, duplicate entries, unsafe paths and unsafe URLs fail validation', () => {
  for (const patch of [
    { status: 'publised' }, { directory: '../outside' }, { directory: '/tmp' },
    { directory: 'nested/game' }, { tags: 'not-an-array' }, { theme: 'bad"class' },
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
  assert.deepEqual((await readdir(result.output)).sort(), ['catalog.mjs', 'games.json', 'index.html', 'office', 'racing']);
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
  assert.deepEqual((await readdir(result.output)).sort(), ['catalog.mjs', 'games.json', 'index.html']);
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
  await rm(join(root, 'catalog.mjs'));
  await assert.rejects(buildSite(root), { code: 'ENOENT' });
  assert.equal(await readFile(join(result.output, 'games.json'), 'utf8'), before);
  assert.ok((await readdir(root)).every(name => !name.startsWith('.site-build-')));
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
