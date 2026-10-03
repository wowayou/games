# Games 项目交接（仓库结构更新于 2026-10-03）

工作目录：`/home/forbackup/Dev/my-projects/games`。大厅及四个游戏目录归 `wowayou/games`，其余独立项目保留各自仓库。

> 不要删除、移动或重命名既有独立项目。大厅的四款游戏由总仓库管理，其余独立项目保留各自仓库。

## 仓库地图

| 路径 | 状态 | 说明 |
| --- | --- | --- |
| `games.json` | 上下架配置 | 唯一的游戏展示、发布选择和文案来源 |
| `index.html` / `catalog.mjs` | 大厅 | 根入口，读取配置生成卡片和草稿链接 |
| `scripts/build-site.mjs` | 发布文件收集 | 按同一配置生成 `_site/` |
| `arcade-site/` | 历史大厅副本 | 已忽略，后续维护根 `index.html` |
| `.release-games/` | 旧发布仓库 | 保留作迁移来源和备份；不再维护第二份代码 |
| `neon-velocity/` | 大厅在架 | Three.js 3D 赛博朋克赛车 |
| `forge-breaker/` | 大厅在架 | Canvas roguelite 熔炉打砖块 |
| `neon-survivors/` | 大厅在架 | Canvas 割草生存 |
| `boss-incoming/` | 草稿 | 「老板来了」摸鱼生存；大厅页脚有弱链 |
| `six-pm-sprint`（外链） | 大厅在架，独立站点 | 六点夺秒；`https://wowayou.github.io/six-pm-sprint/` |
| `cat-flap/`（外链） | 大厅在架，独立站点 | Cat Flap，一键飞行与好友幽灵赛；`https://wowayou.github.io/cat-flap/` |
| `cosmic-merge/` | 大厅在架，独立站点 | 星球合成；`https://wowayou.github.io/cosmic-merge/` |
| `linan-xia-ying/` | 独立 | Three.js 关卡动作 |
| `cloud-shepherd/` | 独立（Vite） | 牧云玩法，有 vitest / dist |
| `magnet-sandbox/` | 独立（Vite） | 磁力沙盒，细节见该目录 `HANDOFF.md` |

根目录文档：

- `GAMES-HANDOFF.md` — 本交接
- `TEST-REPORT.md` — 2026-08-15 起的测试记录，含 2026-10-03 Cat Flap 收录检查
- `test-server.mjs` — 本地静态服务入口

根目录 `README.md` 是仓库布局、本地运行和部署的入口说明。

## 顶层 Git 关联修复（2026-10-02）

已核实 https://github.com/wowayou/games 与 https://wowayou.github.io/games/ 存在且正常，核查时线上最新提交为 `fc8b3bd`，与 `.release-games/` 的 `main` / `origin/main` 一致。原问题是顶层没有关联这个 Git 仓库，现已修复。

已补齐根 `index.html`、`.github/workflows/deploy-pages.yml`、`.gitignore` 和 `scripts/restore-root-git.py`。用户已在普通 WSL 终端执行脚本，实际顶层迁移完成：工作树根为当前 `games/`，分支 `main` 跟踪 `origin/main`，远程为 `https://github.com/wowayou/games.git`。原 `.release-games/` 和所有工作文件均保留。已关联的目录无需重复迁移；脚本仍可供其他旧副本使用，默认只检查，不自动提交或发布。

用户已确认保留现有仓库划分。`cloud-shepherd/`、`cosmic-merge/`、`linan-xia-ying/` 各有对应的 GitHub 远程；`magnet-sandbox/` 仅有本地 Git、未配置远程。独立项目已被顶层忽略规则排除。牧云和磁力沙盒现有未提交改动应保留；本次不涉及玩法修改。

本次验证：临时副本中的迁移、重复执行、历史及工作文件保留、独立仓库隔离、异常拒绝和发布资源检查共 16 项通过；12 个本地 HTML 引用可在 Pages 子路径下解析；发布配置产出的 20 个资源与线上逐文件一致。用户完成迁移后，已在实际顶层复核：Git 历史、全部引用和远程与原发布仓库一致，`git fsck --full` 通过，上游为 `origin/main`，忽略规则正确排除独立仓库，5 个既有仓库的工作区状态未变，迁移脚本检查提示无需重复迁移。本地 HTTP 服务验证因环境禁止创建 socket 而未执行，未重新测试游戏玩法，也未推送或部署。

迁移后的 `M` 是尚未提交的文件修改，`??` 是尚未纳入版本控制的本地文件，包含原有测试脚本和本次新增的配置、工具；这些状态不是迁移失败。后续提交前按用途审查文件，不要把所有未跟踪文件直接批量提交。

## 用户目标（仍有效）

1. 纯静态、零构建浏览器游戏可玩、可上线；
2. 目标仓库 `wowayou/games` + GitHub Pages；子域以后再挂；
3. **不要改** `personal-blog` 的 `apps.config.json`，也不要推博客；
4. 用中文汇报；普通测试失败要修完再继续，不要停在报错上。

`cosmic-merge` 单独部署到 GitHub Pages。2026-10-02 已核实 `wowayou/games` 启用 Pages，最近一次发布工作流成功，大厅 HTTP 200。

## 游戏上下架：`games.json`

游戏列表不再写死在 HTML 或工作流中。`games.json` 是唯一配置，`catalog.mjs` 负责验证和大厅展示，`scripts/build-site.mjs` 使用同一验证逻辑决定发布内容。状态及编辑方法见 README「上下架只改一个文件」。

当前配置为六款正式游戏、一款草稿，其余隐藏。正式区顺序为六点夺秒、Cat Flap、宇宙合成、霓虹幸存者、地狱熔炉、霓虹极速；前三款使用独立站点外链。Cat Flap 于 2026-10-03 按用户要求加入策展，采用独立项目提供的收录文案，放在六点夺秒之后。`published` 为正式卡片，`draft` 为公开的页脚试玩入口，`hidden` 不展示且不打包本仓库游戏文件。数组顺序控制展示顺序，文案也在配置中维护。独立游戏使用 `url` 连接各自站点，不复制仓库；磁力沙盒上线前需先填写独立站点地址。

发布工作流先运行 `node --test tests/*.test.mjs`（目录配置及离线模拟回归），再执行 `node scripts/build-site.mjs`。默认配置收集到 `_site/` 的布局：

```text
_site/
  index.html
  catalog.mjs
  games.json              # 仅含上架和草稿条目
  neon-velocity/
  forge-breaker/
  neon-survivors/
  boss-incoming/
```

收集脚本只复制配置选中的本地目录内的 HTML / CSS / JavaScript 正式资源，排除独立项目、依赖、文档、截图和 `.mjs` 测试脚本。每次成功打包替换旧 `_site/`，下架后不残留旧游戏目录；配置或文件检查失败则报错并保留原输出，工作流不会部署。新增资源类型或子目录时同步修改收集脚本。游戏本体仍无构建；发布工具使用 Node.js 22 或更新版本，无 npm 依赖。

配置功能最初验证：`node tests/catalog.test.mjs` 实际执行 13 项测试并全部通过，覆盖配置排序、三种状态切换、全部隐藏、外链、错误配置及发布失败、旧文件移除和独立仓库隔离。当时默认打包为 3 款正式游戏、1 款草稿，共 22 个文件，游戏正式资源逐文件保持不变。另用 jsdom 验证实际页面文档的卡片、计数、草稿、空状态和 `/games/` 链接，5 个原有独立/发布仓库状态未变。当时 HTTP 服务和 Chromium 受权限限制，尚未完成 HTTP 浏览器验收；五款策展落地后的补验见下方和 `TEST-REPORT.md`。未推送或部署。

干净目录补验已通过：从 Git 提交提取源码并覆盖本次实现，不包含 `node_modules` 或独立游戏仓库，默认打包仍为 22 个文件。只修改配置即可下架两款本地游戏、上架宇宙合成外链（16 个发布文件），13 项测试仍全部通过；全部隐藏后仅剩 3 个大厅文件，再恢复配置可重新得到原 22 个文件。检查脚本启动子进程曾受环境限制，改由执行工具分别运行测试和打包后通过。

## 游戏策展评估（2026-10-02）

用户先要求「检查候选游戏，给出上架与排序建议」，随后认可五款方案并授权推送发布。`games.json` 已落实状态、顺序及赛车的「电脑体验更佳」提示；发布由根部署工作流执行，[实际状态以 GitHub Actions 为准](https://github.com/wowayou/games/actions/workflows/deploy-pages.yml)。以下保留评估依据与最终选择；短时自动化试玩不能证明长期好玩。

**当时正式区按下表前五项排序：新增六点夺秒与宇宙合成，保留原有三款。** 前两款便于第一次访问就开玩，再逐步引入生存、构筑和赛车。独立游戏继续使用各自站点的 `url`，不复制源码。2026-10-03 加入 Cat Flap 后的当前顺序见上方「游戏上下架」。

| 位置 / 处理 | 游戏 | 评估依据与取舍 |
| --- | --- | --- |
| 1 · 新增正式卡片 | [六点夺秒](https://wowayou.github.io/six-pm-sprint/) | 45 秒目标、单指反向、每日同图，上手说明明确。触屏开局、昨日地图切换、暂停、自然结算、本地记录与重开通过；适合大厅第一入口。原生分享、幽灵回放与离线功能本轮未验。 |
| 2 · 从隐藏改为正式 | [宇宙合成](https://wowayou.github.io/cosmic-merge/) | 熟悉的投放合成规则，竖屏布局清楚，补充较从容的休闲玩法。触屏投放获得合成分数，观察到触顶结算，设置与重开可用；未验证高阶天体终局。 |
| 3 · 保留正式 | [霓虹幸存者](https://wowayou.github.io/games/neon-survivors/) | 移动加自动攻击，生存目标直观。触屏摇杆、自动击杀、升级选卡、暂停、保存后刷新续玩通过；未覆盖长局及 Boss。 |
| 4 · 保留正式 | [地狱熔炉](https://wowayou.github.io/games/forge-breaker/) | 接球叠伤与元素构筑提供较深玩法，但需要读装填、热度、丢球规则，手机侧栏也较密。触屏发球、挡板移动、暂停与恢复通过。 |
| 5 · 保留正式，注明电脑体验更佳 | [霓虹极速](https://wowayou.github.io/games/neon-velocity/) | 提供 3D 赛车与明显的视觉差异。首轮停在加载页，单独重试后引擎、倒数与键盘加速通过；有外部 Three.js 加载依赖，不宜把首轮等待误报成游戏损坏。手机性能本轮未确认。 |
| 电脑候补，暂不增加正式卡片 | [临安侠影](https://wowayou.github.io/linan-xia-ying/) | 三关武侠动作有题材差异，桌面开局、移动、暂停通过。现实现依赖键鼠，未提供触屏移动 / 战斗控件；本轮没有完整通关，建议补验后再考虑扩充正式区。 |
| 保留草稿 | [老板来了](https://wowayou.github.io/games/boss-incoming/) | 按住工作的操作清楚，触屏按住、躲过老板、被抓与重开通过。和六点夺秒同属职场短局题材，正式区先保留一款，另一款供草稿试玩。老板出现边界通过调试接口触发，非自然长局验收。 |
| 保持隐藏 | [牧云](https://wowayou.github.io/cloud-shepherd/) | 线上首先要求建角色、选关，竖屏提示横屏；当前入口仍展示搬水教学。本地 `FUN.md` 已转向赶云核心，不能把旧入口、线上「试玩新核心」与本地最新玩法视为同一验收对象。需先明确要展出的版本，并完成手感判断。 |
| 保持隐藏 | 磁力沙盒 | 本轮复核无 Git 远程、配置无在线地址；交接定位为手感原型，尚无游戏目标、计分或关卡。适合继续原型评估，不应作为已完成游戏上架。 |
| 另作互动作品入口 | [战国沙盘](https://wowayou.github.io/warring-states-sandtable/) | 桌面 / 手机均有可读首屏，年份切换和放映模式通过。核心是阅读与历史推演，不是玩家胜负循环；若展示，名称与说明应明确为历史互动作品，不占上述五款游戏的位置。 |

六点夺秒已新增为正式外链，宇宙合成由隐藏转为正式外链。老板来了保持草稿，临安侠影、牧云、磁力沙盒保持隐藏。战国沙盘的独立站点继续保留，本轮未扩展大厅分区。更新后的打包仍为 22 个文件，仅增加公开目录中的外链条目，没有复制独立游戏仓库。

落地后验证：配置测试 13/13 通过，19 个游戏发布资源与源文件一致；大厅在本地 HTTP `/games/` 路径下通过顺序、计数、链接、草稿及提示核对。320、390、768、1024、1440 像素宽的浏览器检查通过。修复了原卡片标签在窄屏与箭头 / 介绍重叠的问题，中等屏宽使用两栏。具体记录见 `TEST-REPORT.md` 的「五款策展落地」。

本轮核验了 9 个公开入口的桌面（1440×1000）与手机视口（390×844），对其中 7 款游戏补了局部交互检查，另核对战国沙盘控件、牧云入口及磁力沙盒本地记录。真实触摸设备和真机性能未测试；手机交互使用 Chromium 触摸模拟。明细见 `TEST-REPORT.md`。截图与探查脚本位于本机临时目录 `/tmp/games-curation-20261002/`，不属于发布资源。

## 霓虹极速：`neon-velocity/`

### 玩法

- Three.js 0.170 CDN、程序化闭环城市、雨天、泛光、合成音效
- WASD、空格手刹漂移、Shift 氮气、触屏
- 三台 hard AI、3 圈计时、碰撞、加速带

### 修（8 月 15 日前 + 测试报告）

- 路边建筑/广告牌外推；卡死脱困（`stuckTimer`）
- 氮气尾焰锚点；氮气有限（加速带/漂移补给）
- AI 提到 hard
- **相机被坡面挡住**：车–相机连线采样赛道高度，抬相机越过地形；建筑遮挡射线保留；`computeBoundingBox()` 空指针；CDN 失败文案改 `textContent`

### 验证

```bash
cd neon-velocity
node --check world.js && node --check particles.js && node --check ai.js && node --check main.js
node test-physics.mjs
```

`TEST-REPORT.md` 记录：物理 9/9，浏览器 24/24。

## 地狱熔炉：`forge-breaker/`

### 玩法

- Canvas 2D、挡板接球、炉心保卫、无尽波次
- 火/冰/雷/穿透/多球/暴击/磁铁；三卡 draft；融合球
- 每 4 炉 Boss；每 2 炉锻炉花矿石
- 菜单有 5 步操作说明；HUD 显示剩余敌人

### 文件

- `index.html` / `style.css` / `game.js`
- `smoke.mjs`、`deep-smoke.mjs`、`ball-physics-test.mjs`、`cdp.mjs`
- `balance-sim.mjs`、`skill-sim.mjs`、`sim-harness.mjs`：固定种子的离线分析；运行方式与模拟假设见 README「熔炉离线分析」。`diag.mjs` 为本地一次性诊断，已忽略。

### 验证

```bash
cd forge-breaker
node --check game.js
node smoke.mjs
node deep-smoke.mjs
node ball-physics-test.mjs
```

`TEST-REPORT.md` 记录：冒烟 7/7，深度流程 16/16，球物理 7/7。烟测必须 `waitFor(window.__FORGE_DEBUG__)`，不要改回固定 `sleep`。

当前实现已将 `F` 入库矿石、永久锻造和最佳纪录写入 `localStorage`（本轮核对 `loadMeta` / `saveMeta` 及按键处理）。旧交接「仅本局 bank」已不适用；本轮未实测跨局锻造恢复。

## 霓虹幸存者：`neon-survivors/`

大厅第三款。废土割草：移动躲避、武器自射、升级三选一、暂停/存档续玩、本地最佳时间。

操作（标题屏）：WASD / 方向键移动，`1` `2` `3` 选升级，`P` 暂停，`M` 静音。

### 文件

- `index.html` / `style.css` / `game.js`
- `smoke.mjs`、`deep-smoke.mjs`、`visual-smoke.mjs`
- `regress-save.mjs`、`regress-save-passives.mjs`、`regress-stuck.mjs`
- `cdp.mjs`

2026-10-02 发布前已对实际 `_site/` 执行烟测与三组回归：分别 17/17、25/25、20/20、8/8 通过；另保留先前 7 项局部交互记录。2026-10-03 整理并纳入深度与视觉脚本，使用独立发布目录补验选卡、Boss 击杀、死亡结算与视觉状态；具体结果见 `TEST-REPORT.md`，本地服务及 `CHROME` / `TARGET` / `SCREENSHOT` 用法见 README。低血量警告改为仅在游玩且生命低于 30% 时启用动画，修复满血时仍闪烁的问题；暂停、结算及标题屏关闭警告。

## 草稿：`boss-incoming/`（老板来了）

按住假装工作、松开摸鱼；老板进门才算抓，同事经过可忽略。本机最佳存本地。大厅只在页脚挂草稿，未做正式卡片。

文件：`index.html` / `style.css` / `game.js`。无独立烟测脚本；本轮策展已检查触屏按住、老板判定及重开，见测试报告。

## 独立项目（不要当大厅发布物打包）

### 宇宙合成 `cosmic-merge/`

零依赖 Canvas 合成；15 级天体按真实赤道半径排序。有 README、物理/平衡 harness、线上地址。本体不需要 npm；`tools/` 才用 jsdom。

### 临安侠影 `linan-xia-ying/`

Three.js 关卡动作。`TEST-REPORT.md`：VFX/切关几何体释放后浏览器 21/21。

### 牧云 `cloud-shepherd/`

Vite + TypeScript + vitest。文档在 `MODULES.md` / `ELEMENTS.md` / `FUN.md` / `LEARNINGS.md` / `ARCHIVE.md`。

### 磁力沙盒 `magnet-sandbox/`

Vite + TypeScript。交接细节以该目录 `HANDOFF.md` 为准。

## 本地怎么跑

在 `games/` 下：

```bash
python3 -m http.server 4173
```

大厅打开 `http://127.0.0.1:4173/`，修改 `games.json` 后刷新。`node test-server.mjs` 也已指向根大厅并支持游戏目录入口。核对实际发布内容时，先运行 `node scripts/build-site.mjs`，再执行 `python3 -m http.server 4174 --directory _site`。不要假定某个后台服务仍在运行。

## 建议下一步

1. 五款策展及发布前回归已完成；2026-10-03 本地配置新增 Cat Flap，检查记录见 `TEST-REPORT.md`。后续上下架继续修改 `games.json`。
2. 幸存者六组烟测 / 回归已随仓库提供；后续修改其玩法时按范围复验，长局与真机性能不能由现有烟测代替。
3. 顶层 Git 关联已完成；后续检查差异并按用途选择提交文件。发布使用根工作流，不再手工复制到 `.release-games/`。
4. 博客与 `personal-blog` 仍不要动。

## 历史坑

- 8 月 15 日交接只覆盖赛车 + 熔炉，过时。
- Headless SwiftShader 很慢，烟测用轮询/等待 debug 钩子，禁用固定 sleep。
- 工具 sandbox 权限来回切换时，不要重复同一失败调用。
