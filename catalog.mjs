const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const statuses = new Set(['published', 'draft', 'hidden']);
const themes = new Set(['', 'forge', 'survivor']);
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

export function validateCatalog(config) {
  if (!config || !Array.isArray(config.games)) throw new Error('games.json 必须包含 games 数组。');
  const ids = new Set();
  const directories = new Set();
  return config.games.map((game, index) => {
    const fail = message => { throw new Error(`games[${index}]：${message}`); };
    if (!game || typeof game !== 'object' || Array.isArray(game)) fail('游戏配置必须是对象。');
    if (typeof game.id !== 'string' || !slug.test(game.id) || ids.has(game.id)) fail('id 必须是唯一的英文小写短名。');
    ids.add(game.id);
    if (typeof game.name !== 'string' || !game.name.trim()) fail('name 不能为空。');
    if (!statuses.has(game.status)) fail('status 只能是 published、draft 或 hidden。');
    const local = Object.hasOwn(game, 'directory');
    if (local === Object.hasOwn(game, 'url')) fail('directory 与 url 必须且只能填写一个。');
    if (local) {
      if (typeof game.directory !== 'string' || !slug.test(game.directory) || directories.has(game.directory)) {
        fail('directory 必须是唯一的根目录游戏文件夹名。');
      }
      directories.add(game.directory);
    } else {
      if (typeof game.url !== 'string') fail('url 必须是字符串。');
      if (game.url || game.status !== 'hidden') {
        let url;
        try { url = new URL(game.url); } catch { fail('上架前请填写完整的 HTTPS 在线地址。'); }
        if (url.protocol !== 'https:' || url.username || url.password) fail('url 必须使用不含账户信息的 HTTPS 地址。');
      }
    }
    const title = game.title ?? [game.name];
    if (!Array.isArray(title) || title.length < 1 || title.length > 2 || title.some(part => typeof part !== 'string' || !part.trim())) {
      fail('title 必须包含一至两行非空文字。');
    }
    const tags = game.tags ?? [];
    if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string')) fail('tags 必须是文字数组。');
    for (const field of ['badge', 'description']) {
      if (game[field] !== undefined && typeof game[field] !== 'string') fail(`${field} 必须是文字。`);
    }
    if (!themes.has(game.theme ?? '')) fail('theme 只能为空、forge 或 survivor。');
    return {
      id: game.id, name: game.name, status: game.status,
      ...(local ? { directory: game.directory } : { url: game.url }),
      title, tags, theme: game.theme ?? '',
      badge: game.badge ?? 'BROWSER GAME', description: game.description ?? '',
    };
  });
}

export function renderCatalog(config) {
  const games = validateCatalog(config);
  const published = games.filter(game => game.status === 'published');
  const drafts = games.filter(game => game.status === 'draft');
  const href = game => escapeHTML(game.directory ? `${game.directory}/` : game.url);
  return {
    count: published.length,
    cards: published.map(game => `<a class="game${game.theme ? ` ${game.theme}` : ''}" href="${href(game)}">
      <div class="badge">${escapeHTML(game.badge)}</div>
      <h2>${escapeHTML(game.title[0])}${game.title[1] ? ` <em>${escapeHTML(game.title[1])}</em>` : ''}</h2>
      <div class="cn">${escapeHTML(game.name)}</div>
      <p class="desc">${escapeHTML(game.description)}</p>
      <div class="tags">${game.tags.map(tag => `<span>${escapeHTML(tag)}</span>`).join('')}</div>
      <div class="arrow" aria-hidden="true">→</div>
    </a>`).join('\n'),
    drafts: drafts.map(game => ` · <a href="${href(game)}">草稿 · ${escapeHTML(game.name)}</a>`).join(''),
    empty: drafts.length ? '正式游戏准备中，可先体验下方草稿。' : '暂时没有开放的游戏。',
  };
}

export async function loadCatalog(document, fetchConfig) {
  const status = document.getElementById('catalog-status');
  try {
    const response = await fetchConfig();
    if (!response.ok) throw new Error(`游戏目录请求失败：HTTP ${response.status}`);
    const view = renderCatalog(await response.json());
    document.getElementById('games').innerHTML = view.cards;
    document.getElementById('draft-links').innerHTML = view.drafts;
    document.getElementById('catalog-summary').textContent = `${view.count} 款浏览器游戏 · 音效与数据均在本地运行`;
    status.textContent = view.count ? '' : view.empty;
    status.hidden = view.count > 0;
  } catch (error) {
    status.textContent = '游戏列表暂时无法加载，请刷新重试。';
    status.hidden = false;
    console.error(error);
  }
}

if (typeof document !== 'undefined') {
  loadCatalog(document, () => fetch(new URL('./games.json', import.meta.url), { cache: 'no-cache' }));
}
