// Replaced by scripts/build-site.mjs with a content hash; source files stay unversioned for local preview.
export const BUILD = 'dev';
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const statuses = new Set(['published', 'draft', 'hidden']);
export const themes = new Set(['', 'clock', 'sky', 'circuit', 'cosmos', 'survivor', 'forge', 'velocity', 'wuxia']);
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
    for (const field of ['badge', 'description', 'playHint']) {
      if (game[field] !== undefined && typeof game[field] !== 'string') fail(`${field} 必须是文字。`);
    }
    if (!themes.has(game.theme ?? '')) fail(`theme 必须为空或已支持的主题：${[...themes].filter(Boolean).join('、')}。`);
    return {
      id: game.id, name: game.name, status: game.status,
      ...(local ? { directory: game.directory } : { url: game.url }),
      title, tags, theme: game.theme ?? '',
      badge: game.badge ?? '浏览器游戏', description: game.description ?? '',
      playHint: game.playHint?.trim() || '浏览器即玩',
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
    cards: published.map((game, index) => `<a class="game${game.theme ? ` ${game.theme}` : ''}" href="${href(game)}" aria-labelledby="title-${game.id}" aria-describedby="hint-${game.id}">
      <div class="cover" aria-hidden="true">
        ${game.theme ? `<img class="cover-art" src="art/${game.theme}.svg${BUILD === 'dev' ? '' : `?v=${BUILD}`}" alt="" width="640" height="400" loading="${index < 4 ? 'eager' : 'lazy'}" decoding="async">` : ''}
        <span class="badge">${escapeHTML(game.badge)}</span>
        <div class="cover-title">${game.title.map(part => `<span>${escapeHTML(part)}</span>`).join('')}</div>
      </div>
      <div class="game-body">
        <h3 id="title-${game.id}">${escapeHTML(game.name)}</h3>
        <p class="desc">${escapeHTML(game.description)}</p>
        <div class="tags">${game.tags.map(tag => `<span>${escapeHTML(tag)}</span>`).join('')}</div>
        <div class="card-footer">
          <span class="play-hint" id="hint-${game.id}">${escapeHTML(game.playHint)}</span>
          <span class="play-link">开始游戏 <span aria-hidden="true">↗</span></span>
        </div>
      </div>
    </a>`).join('\n'),
    drafts: drafts.map(game => `<a href="${href(game)}"><span>草稿试玩</span>${escapeHTML(game.name)}<span aria-hidden="true">↗</span></a>`).join(''),
    empty: drafts.length ? '正式游戏准备中，可先体验下方草稿。' : '暂时没有开放的游戏。',
  };
}

export async function loadCatalog(document, fetchConfig) {
  const status = document.getElementById('catalog-status');
  const draftLinks = document.getElementById('draft-links');
  status.textContent = '正在打开游戏收藏…';
  status.hidden = false;
  try {
    const response = await fetchConfig();
    if (!response.ok) throw new Error(`游戏目录请求失败：HTTP ${response.status}`);
    const view = renderCatalog(await response.json());
    document.getElementById('games').innerHTML = view.cards;
    draftLinks.innerHTML = view.drafts;
    draftLinks.hidden = !view.drafts;
    document.getElementById('catalog-summary').textContent = `${view.count} 款游戏 · 打开就能玩`;
    status.textContent = view.count ? '' : view.empty;
    status.hidden = view.count > 0;
  } catch (error) {
    document.getElementById('games').innerHTML = '';
    draftLinks.innerHTML = '';
    draftLinks.hidden = true;
    document.getElementById('catalog-summary').textContent = '浏览器游戏收藏';
    status.textContent = '游戏列表暂时无法加载，请刷新重试。';
    status.hidden = false;
    console.error(error);
  }
}

// A page cached from another deploy cannot use this module's markup and styles.
export function isStalePage(document, build = BUILD) {
  return build !== 'dev' && document.documentElement?.dataset?.build !== build;
}

// Reload once so the browser revalidates; if the cache still disagrees, explain instead of looping.
export function recoverStalePage(document, location, storage, build = BUILD) {
  const key = `catalog-reload-${build}`;
  try {
    if (!storage.getItem(key)) {
      storage.setItem(key, '1');
      location.reload();
      return 'reload';
    }
  } catch {}
  const status = document.getElementById('catalog-status');
  if (status) {
    status.textContent = '游戏收藏刚更新，请刷新页面查看最新版本。';
    status.hidden = false;
  }
  return 'message';
}

if (typeof document !== 'undefined') {
  if (isStalePage(document)) {
    let storage = null;
    try { storage = sessionStorage; } catch {}
    recoverStalePage(document, location, storage);
  } else {
    loadCatalog(document, () => fetch(new URL('./games.json', import.meta.url), { cache: 'no-cache' }));
  }
}
