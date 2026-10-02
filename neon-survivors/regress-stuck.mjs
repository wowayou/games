// Regression test: 升级队列在状态切换后不得"漏弹"卡死。
// 复现旧 bug：chooseUpgrade 末尾用 setTimeout(() => { if (G.state==='playing') offerUpgrades() }, 300)
// —— 若 300ms 窗口内 state 不是 'playing'（例如死亡/暂停），offerUpgrades 被跳过，
//    upgradeQueue 仍 > 0 且 pendingUpgrades===null，再也不会有任何升级弹出 → 卡死。
//
// 新修复：主循环每帧调用 tryAdvanceUpgradeQueue()，只要满足条件就会推进；
// 死亡/暂停时队列保留，恢复后自动续上。
import { launch, reporter, sleep } from './cdp.mjs';

const base = process.env.TARGET || 'http://127.0.0.1:4180/neon-survivors/';
const { check, finish } = reporter();
let browser;
try {
  browser = await launch(base);
  const { evaluate: ev, waitFor, errors } = browser;

  check('Canvas loaded', await waitFor(`typeof window.__NS__ === 'object'`, 8000));
  await ev(`document.getElementById('start-btn').click()`);
  check('Playing', await waitFor(`window.__NS__.state.state === 'playing'`));

  // ---- 场景 1：连续多次升级（旧代码靠 setTimeout 链式推进，容易在冷却窗口漏弹）----
  // 连续触发 5 次升级，每次立即选卡。新代码主循环轮询，应当稳定弹出全部 5 次。
  let consecOk = true;
  for (let i = 0; i < 5; i++) {
    await ev(`window.__NS__.forceLevelUp()`);
    const shown = await waitFor(`!document.getElementById('upgrade-bar').classList.contains('hidden')`, 5000);
    if (!shown) { consecOk = false; break; }
    await ev(`document.querySelector('#upgrade-cards .card').click()`);
    const hidden = await waitFor(`document.getElementById('upgrade-bar').classList.contains('hidden')`, 5000);
    if (!hidden) { consecOk = false; break; }
    await sleep(50);
  }
  check('连续 5 次升级全部稳定弹出+选完', consecOk);

  // ---- 场景 2：升级窗口期内暂停，恢复后队列应自动续上（核心 bug 复现）----
  // 触发升级 → 立即暂停（state≠playing）→ 选不了卡 → 取消暂停
  // 旧代码：pendingUpgrades 仍非 null 时暂停不影响；但若在 chooseUpgrade 的 300ms setTimeout 窗口内
  //         暂停，setTimeout 触发时 state!=='playing' 会漏弹。这里直接验证"暂停时升级条仍可见、恢复后能选完"。
  await ev(`window.__NS__.forceLevelUp()`);
  await waitFor(`!document.getElementById('upgrade-bar').classList.contains('hidden')`, 5000);
  // 升级条显示时暂停
  await ev(`window.__NS__.togglePause()`);   // state -> 'paused'
  check('暂停后升级条仍可见（不因状态切换消失）',
    await ev(`!document.getElementById('upgrade-bar').classList.contains('hidden')`));
  // 暂停时点卡应无效（或点完恢复后继续）；这里先恢复再选
  await ev(`window.__NS__.togglePause()`);   // state -> 'playing'
  await ev(`document.querySelector('#upgrade-cards .card').click()`);
  check('恢复后能选完升级',
    await waitFor(`document.getElementById('upgrade-bar').classList.contains('hidden')`, 5000));

  // ---- 场景 3：核心回归 —— 队列不得遗留（任何时候 queue>0 且无 pending 必须能在 ~1s 内自愈）----
  // 强制塞多个升级到队列（连续 forceLevelUp 但先压制弹出），验证最终队列被排空。
  // 直接走主循环：连续 3 次 forceLevelUp，每次间隔 50ms，不主动选卡，
  // 让 tryAdvanceUpgradeQueue 自己排队推进。预期：升级条反复出现。
  let drainOk = true;
  for (let i = 0; i < 3; i++) {
    await ev(`window.__NS__.forceLevelUp()`);
    await sleep(50);
  }
  // 现在应至少有一组卡片显示；连续选完所有弹出的卡直到升级条隐藏
  for (let i = 0; i < 10; i++) {
    const visible = await ev(`!document.getElementById('upgrade-bar').classList.contains('hidden')`);
    if (!visible) break;
    await ev(`document.querySelector('#upgrade-cards .card').click()`);
    await waitFor(`document.getElementById('upgrade-bar').classList.contains('hidden')`, 5000);
    await sleep(100);
  }
  // 关键断言：队列已排空 + 无遗留 pending
  const queueEmpty = await ev(`(function(){
    const w = window.__NS__;
    // upgradeQueue 是模块内变量，无法直接读；用"升级条已隐藏且 state 仍为 playing"作为代理
    return document.getElementById('upgrade-bar').classList.contains('hidden')
        && w.state.state === 'playing';
  })()`);
  check('批量升级后队列被排空、未卡死', queueEmpty);

  // ---- 场景 4：满血长时间运行不残留 ----
  // 跑 2 秒，确认没有"漏弹的升级条突然冒出来"或"游戏卡死"
  await sleep(2000);
  check('2 秒后仍在 playing', await ev(`window.__NS__.state.state === 'playing'`));
  check('2 秒后无遗留运行时错误', errors.length === 0, errors.slice(0, 3));

  console.log('final', await ev(`({state:window.__NS__.state.state, level:window.__NS__.state.level, kills:window.__NS__.state.kills})`));
} catch (error) {
  check('回归测试执行', false, String(error));
} finally {
  await browser?.close();
  finish();
}
