# ARCADE · 浏览器游戏实验场

两款纯静态、零构建的浏览器游戏，直接用原生 JavaScript 写成，没有打包步骤，也没有 npm 依赖。

**在线试玩：** https://wowayou.github.io/games/

| 游戏 | 说明 | 技术 |
| --- | --- | --- |
| [NEON VELOCITY · 霓虹疾速](neon-velocity/) | 赛博朋克雨夜赛车，程序化生成的 3D 闭环城市赛道、AI 对手、三圈计时赛 | Three.js 0.170（CDN importmap） |
| [HELL FORGE · 地狱熔炉](forge-breaker/) | roguelite 打砖块，元素球、卡牌强化、球种融合、Boss 与永久锻造 | Canvas 2D + Web Audio |

## 玩法

### NEON VELOCITY

WASD 或方向键驾驶，空格手刹漂移，Shift 释放氮气。氮气不会自动回充，只能靠赛道上的加速带和漂移补充，所以要计划好什么时候用。三名 AI 对手按 hard 难度配置。移动端有触屏按钮。

### HELL FORGE

鼠标或 A / D 移动挡板，点击或空格发射炼狱球。清空一炉后抽三张强化卡；同时持有两种元素时会出现融合卡，可以合成消融之球、夜噬之球或孕火之球。每两炉进入永恒锻炉，用矿石买永久强化；每四炉迎战熔铸巨像。按 F 把当前矿石存进金库，存进去的矿石死亡后不会丢失，并跨对局保存在 localStorage。

## 本地运行

不需要构建，任何静态服务器都行：

```bash
python3 -m http.server 4173
# 打开 http://127.0.0.1:4173/
```

直接用 `file://` 打开赛车不行——它用了 ES module 和 importmap，需要 HTTP 协议。

## 部署

推送到 `main` 会触发 `.github/workflows/deploy-pages.yml`，把仓库根目录整体作为静态站点发布到 GitHub Pages。

## 许可

MIT
