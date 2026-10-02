import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCatalog } from '../catalog.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const extensions = new Set(['.html', '.css', '.js']);

async function exists(path) {
  try { return await lstat(path); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function buildSite(root = projectRoot) {
  const games = validateCatalog(JSON.parse(await readFile(join(root, 'games.json'), 'utf8')));
  const visible = games.filter(game => game.status !== 'hidden');
  const files = ['index.html', 'catalog.mjs'];
  for (const game of visible.filter(game => game.directory)) {
    const directory = join(root, game.directory);
    const info = await exists(directory);
    if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error(`${game.id}：游戏目录不存在或不是普通目录。`);
    if (await exists(join(directory, '.git'))) throw new Error(`${game.id}：独立仓库请配置 url，不能作为本地目录打包。`);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || !extensions.has(extname(entry.name))) continue;
      if (entry.isSymbolicLink()) throw new Error(`${game.id}：发布资源不能使用符号链接。`);
      if (entry.isFile()) files.push(join(game.directory, entry.name));
    }
    if (!files.includes(join(game.directory, 'index.html'))) throw new Error(`${game.id}：缺少 index.html。`);
  }

  const output = join(root, '_site');
  const previous = await exists(output);
  if (previous && (!previous.isDirectory() || previous.isSymbolicLink())) throw new Error('_site 必须是普通输出目录。');
  const staging = await mkdtemp(join(root, '.site-build-'));
  try {
    for (const file of files) {
      const destination = join(staging, file);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(join(root, file), destination);
    }
    await writeFile(join(staging, 'games.json'), `${JSON.stringify({ games: visible }, null, 2)}\n`);
    // Only replace generated output after every selected resource has been copied.
    await rm(output, { recursive: true, force: true });
    await rename(staging, output);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return { output, published: visible.filter(game => game.status === 'published').length,
    drafts: visible.filter(game => game.status === 'draft').length, files: files.length + 1 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await buildSite();
    console.log(`已生成 ${result.output}：${result.published} 款上架，${result.drafts} 款草稿，${result.files} 个文件。`);
  } catch (error) {
    console.error(`发布准备失败：${error.message}`);
    process.exitCode = 1;
  }
}
