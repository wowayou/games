# wowayou games

浏览器游戏大厅。上架、草稿、下架及展示顺序统一由 [`games.json`](games.json) 管理；游戏纯前端、零构建，游戏记录保存在浏览器本机。

- 在线地址：https://wowayou.github.io/games/
- GitHub 仓库：https://github.com/wowayou/games
- 项目交接：[`GAMES-HANDOFF.md`](GAMES-HANDOFF.md)
- 游戏测试记录：[`TEST-REPORT.md`](TEST-REPORT.md)

## 上下架只改一个文件

编辑 [`games.json`](games.json) 中对应游戏的 `status`，不需要同时修改 HTML 或部署工作流：

| `status` | 大厅展示 | 本仓库游戏文件是否发布 |
| --- | --- | --- |
| `published` | 正式游戏卡片 | 是 |
| `draft` | 页脚草稿试玩入口，仍可公开访问 | 是 |
| `hidden` | 不展示 | 否，下次发布移除旧文件 |

当前正式区按以下顺序展示：**六点夺秒 → 宇宙合成 → 霓虹幸存者 → 地狱熔炉 → 霓虹极速**。前两款链接到各自独立站点；赛车卡片注明电脑体验更佳。老板来了为 `draft`，其余配置条目为 `hidden`。例如上架临安侠影，只需找到 `"id": "linan-xia-ying"`，把它的 `"status": "hidden"` 改成 `"status": "published"`；再次改回即可从大厅下架。

数组顺序就是展示顺序；卡片名称、介绍、标签也在同一文件中管理：

- `directory`：本仓库中的游戏目录，例如 `neon-velocity`。发布时收集该目录的正式资源。
- `url`：独立游戏的 HTTPS 在线地址，例如 `https://wowayou.github.io/linan-xia-ying/`。上架时只添加链接，各独立网站仍由各自仓库部署。
- 每款游戏只填写 `directory` 或 `url` 其中一个。磁力沙盒尚无线上地址，先独立部署，再填写它的 `url` 并切换状态。

下架保留源码和 Git 历史。全部设为 `hidden` 时，大厅显示暂无开放游戏；配置拼写错误或已上架的本地目录缺失时，发布检查会报错。

## 仓库结构

大厅入口为根目录 `index.html`，通过 `catalog.mjs` 读取 `games.json`。以下游戏源码由 `wowayou/games` 管理，是否发布取决于配置：

| 目录 | 名字 | 类型 |
| --- | --- | --- |
| `neon-velocity/` | 霓虹极速 | Three.js 3D 赛车 |
| `forge-breaker/` | 地狱熔炉 | Canvas 肉鸽打砖块 |
| `neon-survivors/` | 霓虹幸存者 | Canvas 割草生存 |
| `boss-incoming/` | 老板来了 | 摸鱼生存，默认草稿 |

工作目录中还可能存在以下独立项目；它们已被顶层 `.gitignore` 排除，需要进入各自目录管理、提交和部署：

| 目录 | GitHub 仓库 |
| --- | --- |
| `cosmic-merge/` | https://github.com/wowayou/cosmic-merge |
| `linan-xia-ying/` | https://github.com/wowayou/linan-xia-ying |
| `cloud-shepherd/` | https://github.com/wowayou/cloud-shepherd |
| `magnet-sandbox/` | 本地独立 Git 仓库，尚未配置远程 |

克隆 `wowayou/games` 不会自动下载这些独立项目，上架它们的外部链接也不需要下载源码。`.release-games/` 是旧发布仓库副本，`arcade-site/` 是旧大厅副本；后续统一维护根目录。

## 修复旧工作目录的 Git 关联

旧布局把真正的 Git 仓库放在 `.release-games/`，导致在 `games/` 顶层执行 `git status` 报「不是 Git 仓库」。线上仓库和历史提交仍然完整。

本次已补齐顶层入口、部署配置及忽略规则。若顶层仍未关联，在本目录运行：

```bash
python3 scripts/restore-root-git.py
python3 scripts/restore-root-git.py --apply
git status --short --branch
git remote -v
```

脚本先检查来源、文件完整性及权限，再复制 `.release-games/.git` 到顶层，保留原副本、历史、远程地址和所有工作文件，不会自动提交、推送或部署。已有非空的其他 `.git` 不会被覆盖。**若运行环境将顶层 `.git` 挂载为只读，需在该限制之外的普通终端执行。** 新克隆的仓库无需运行此脚本。

## 本地运行

在根目录执行：

```bash
python3 -m http.server 4173
```

打开 http://127.0.0.1:4173/ ，通过大厅进入各游戏。赛车使用 JavaScript 模块和 CDN（内容分发网络）上的 Three.js，需要通过 HTTP 打开并能访问外部依赖。

修改 `games.json` 后刷新页面即可看到大厅选择变化。要核对实际发布内容（包括下架后目录被移除），使用 Node.js 22 或更新版本生成发布目录，再预览：

```bash
node scripts/build-site.mjs
python3 -m http.server 4174 --directory _site
```

打开 http://127.0.0.1:4174/ 。无需安装 npm 依赖。

## 部署

推送到 `main` 会触发 `.github/workflows/deploy-pages.yml`。工作流先运行配置及发布测试，再执行 `node scripts/build-site.mjs`，依据 `games.json` 重新生成 `_site/` 并发布到 GitHub Pages。

输出包含大厅、`catalog.mjs`、仅含上架和草稿条目的 `games.json`，以及选中的本地游戏目录里的 HTML、CSS、JavaScript 文件。独立仓库、依赖、测试脚本、截图和本地工具配置不进入发布目录。每次成功打包会替换旧输出，避免已下架游戏残留；配置检查或资源复制失败时保留上一份本地输出，并阻止工作流继续部署。若游戏新增其他类型或子目录资源，需同步更新收集脚本。

```bash
node --test tests/catalog.test.mjs
node scripts/build-site.mjs
```

## 游戏检查

```bash
node neon-velocity/test-physics.mjs
```

其他游戏的浏览器测试及运行前提见 [`GAMES-HANDOFF.md`](GAMES-HANDOFF.md) 和各游戏脚本；历史结果与本次实际验证应分开记录。

幸存者的烟测与存档回归已随仓库提供。先生成 `_site/`，再在一个终端启动测试服务：

```bash
python3 -m http.server 4180 --bind 127.0.0.1 --directory _site
```

另一个终端运行：

```bash
node neon-survivors/smoke.mjs
node neon-survivors/regress-save.mjs
node neon-survivors/regress-save-passives.mjs
node neon-survivors/regress-stuck.mjs
```

脚本需要本机 Chromium。若默认缓存路径不适用，通过 `CHROME` 环境变量指定可执行文件；`TARGET` 可覆盖默认测试地址。浏览器检查需要允许启动进程与本地调试端口。

## 许可

MIT
