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

当前正式区按以下顺序展示：**六点夺秒 → Cat Flap → 万家灯火 → 宇宙合成 → 霓虹幸存者 → 地狱熔炉 → 霓虹极速 → 临安侠影**。前四款和临安侠影链接到各自独立站点；赛车卡片注明电脑体验更佳，临安侠影注明需要键盘操作。老板来了为 `draft`，其余配置条目为 `hidden`。例如下架临安侠影，只需找到 `"id": "linan-xia-ying"`，把它的 `"status": "published"` 改成 `"status": "hidden"`；再次改回即可重新上架。

数组顺序就是展示顺序；卡片名称、介绍、标签也在同一文件中管理：

- `directory`：本仓库中的游戏目录，例如 `neon-velocity`。发布时收集该目录的正式资源。
- `url`：独立游戏的 HTTPS 在线地址，例如 `https://wowayou.github.io/linan-xia-ying/`。上架时只添加链接，各独立网站仍由各自仓库部署。
- 每款游戏只填写 `directory` 或 `url` 其中一个。磁力沙盒尚无线上地址，先独立部署，再填写它的 `url` 并切换状态。

下架保留源码和 Git 历史。全部设为 `hidden` 时，大厅显示暂无开放游戏；配置拼写错误或已上架的本地目录缺失时，发布检查会报错。

## 卡片外观与维护

大厅采用统一的深色收藏室布局，每款游戏有独立配色和题材封面；中文名称是主要阅读标题，整张卡片都是一个原生链接。窄屏自动调整为单列，键盘操作有跳转入口和焦点提示，并尊重系统的减少动态效果设置。

外观与操作文案仍在 `games.json` 中配置：

- `theme`：可选 `clock`、`sky`、`circuit`、`cosmos`、`survivor`、`forge`、`velocity`、`wuxia`。同时选择 `catalog.css` 中的配色、字体和 `art/<theme>.svg` 封面；省略或留空使用通用卡片，不请求图片。
- `playHint`：简短的操作或设备提示，例如「触屏 / 键盘」「电脑体验更佳」。省略时显示「浏览器即玩」；只填写已核实的信息，不把推荐设备当作硬性限制。
- `badge`：面向玩家的题材标签；`title`：封面的装饰标题；`name`、`description`、`tags`：正文名称、玩法简介和标签。

`art/` 是本地 SVG（可缩放矢量图）概念插画，不是实机截图。大厅不使用远程字体，不预加载游戏本体；封面固定宽高预留空间，第五张起使用浏览器原生懒加载。新增游戏可直接复用已有主题；确需新增视觉主题时，在 `catalog.mjs` 的 `themes` 中登记，在 `catalog.css` 增加主题规则，并提供同名的 640×400 SVG。渲染与打包逻辑无需另加游戏名单，测试会核对主题、样式与封面是否配套。

## 仓库结构

大厅入口为根目录 `index.html`，通过 `catalog.mjs` 读取 `games.json`，样式在 `catalog.css`，封面在 `art/`。以下游戏源码由 `wowayou/games` 管理，是否发布取决于配置：

| 目录 | 名字 | 类型 |
| --- | --- | --- |
| `neon-velocity/` | 霓虹极速 | Three.js 3D 赛车 |
| `forge-breaker/` | 地狱熔炉 | Canvas 肉鸽打砖块 |
| `neon-survivors/` | 霓虹幸存者 | Canvas 割草生存 |
| `boss-incoming/` | 老板来了 | 摸鱼生存，默认草稿 |

工作目录中还可能存在以下独立项目；它们已被顶层 `.gitignore` 排除，需要进入各自目录管理、提交和部署：

| 目录 | GitHub 仓库 |
| --- | --- |
| `cat-flap/` | https://github.com/wowayou/cat-flap |
| `city-lights/` | https://github.com/wowayou/city-lights |
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

输出包含大厅、`catalog.mjs`、`catalog.css`、仅含上架和草稿条目的 `games.json`、正式卡片使用的 `art/*.svg`，以及选中的本地游戏目录里的 HTML、CSS、JavaScript 文件。独立仓库、依赖、测试脚本、截图和本地工具配置不进入发布目录。每次成功打包会替换旧输出，避免已下架游戏残留；配置检查或资源复制失败时保留上一份本地输出，并阻止工作流继续部署。若游戏新增其他类型或子目录资源，需同步更新收集脚本。

```bash
node --test tests/*.test.mjs
node scripts/build-site.mjs
```

## 大厅浏览器检查

```bash
node scripts/catalog-smoke.mjs
```

脚本自动构建 `_site/`、启动临时本地服务并通过 `/games/` 子路径运行 Chromium，无需安装 npm 依赖。它复用现有 `neon-survivors/cdp.mjs` 浏览器驱动；默认 Chromium 路径不适用时，用 `CHROME=/path/to/chromium` 指定。需要允许启动浏览器进程与本地端口。

检查涵盖 320–1440 像素的 11 个宽度（含布局切换边界）、封面加载、卡片文字对比度、链接和操作提示、键盘焦点与 Enter 跳转、触摸点击、减少动态效果、空列表、仅草稿、请求/配置失败及禁用 JavaScript。默认截图与布局数据写入已忽略的 `.devtest/catalog/`，可用 `SCREENSHOTS` 指定其他目录；截图必须人工复核，模拟触摸不等同于真机或游戏玩法验收。脚本不进入发布目录，也不自动推送或部署。

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
node neon-survivors/deep-smoke.mjs
node neon-survivors/visual-smoke.mjs
```

脚本需要本机 Chromium。若默认缓存路径不适用，通过 `CHROME` 环境变量指定可执行文件；`TARGET` 可覆盖默认测试地址。浏览器检查需要允许启动进程与本地调试端口。

`deep-smoke.mjs` 使用受控抽牌和敌人场景，检查真实选卡、Boss 击杀、接触死亡与结算。`visual-smoke.mjs` 检查双方实际发射的弹丸、键盘反馈，以及低血量警告在 30% 阈值、暂停和回血时的显示状态；截图默认写入已忽略的 `neon-survivors/.devtest/entities.png`，可用 `SCREENSHOT` 指定其他路径。截图仍需人工查看，这两项检查不代表自然长局、真机性能或完整视觉验收。

### 熔炉离线分析

以下工具使用 Node.js 22 或更新版本，无需浏览器或 npm 依赖：

```bash
node forge-breaker/balance-sim.mjs
node forge-breaker/skill-sim.mjs
SEED=42 node forge-breaker/skill-sim.mjs
```

默认种子为 `12345`，`SEED` 接受 0–4294967295 的整数；相同源码、Node.js 版本和种子可重放同一结果。`sim-harness.mjs` 在独立环境执行真实 `game.js`，固定游戏随机数，并省略输入、渲染和提示音计时器。模拟视口为 1280×860，每秒推进 120 步。

- `balance-sim.mjs`：比较 11 个炉次的两种爆发策略。挡板可以瞬移，伤害按炉次预设，每炉最多模拟 120 秒；各策略在同一炉次从相同种子开始。
- `skill-sim.mjs`：比较四种操作误差及目标更新间隔。挡板由游戏平滑移动，每炉直接加伤害 ×1.5，跳过选卡和购物，最多模拟到第 30 炉或 900 秒。每档重置游戏与操作种子，但不同操作会让后续随机事件分叉。

输出区分完成目标、阵亡和超时；阵亡属于分析结果，不代表脚本执行失败。这些是假设条件下的比较，不能当作真实玩家通关率或平衡性合格证明。5 项可复现性与边界回归位于 `tests/simulations.test.mjs`，随发布工作流执行；浏览器检查按需手动运行。一次性 `forge-breaker/diag.mjs` 留在本地，不纳入仓库。以上 `.mjs` 工具、回归测试及截图均不进入网站发布目录。

## 许可

MIT
