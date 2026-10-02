// 存档功能回归：保存/恢复/清理 + 状态一致性
import { launch, reporter, sleep } from './cdp.mjs';

const base = process.env.TARGET || 'http://127.0.0.1:4180/neon-survivors/';
const { check, finish } = reporter();
let browser;
try {
  browser = await launch(base);
  const { evaluate: ev, waitFor, errors } = browser;

  check('Loaded', await waitFor(`typeof window.__NS__ === 'object'`, 8000));

  // 清理：开始时应无存档
  await ev(`window.__NS__.clearSave()`).catch(() => {});
  check('初始无存档', await ev(`window.__NS__.hasSave() === false`));
  check('CONTINUE 按钮初始隐藏',
    await ev(`document.getElementById('continue-btn').classList.contains('hidden')`));

  // 开局并升级 2 次，确认存档出现
  await ev(`document.getElementById('start-btn').click()`);
  await waitFor(`window.__NS__.state.state === 'playing'`);
  for (let i = 0; i < 2; i++) {
    await ev(`window.__NS__.forceLevelUp()`);
    await waitFor(`!document.getElementById('upgrade-bar').classList.contains('hidden')`, 5000);
    await ev(`document.querySelector('#upgrade-cards .card').click()`);
    await waitFor(`document.getElementById('upgrade-bar').classList.contains('hidden')`, 5000);
    await sleep(50);
  }
  // 选完升级会落盘
  await sleep(100);
  check('升级后存档生成', await ev(`window.__NS__.hasSave() === true`));

  const snap1 = await ev(`window.__NS__.readSave()`);
  check('存档含正确等级', snap1.level === 3, `level=${snap1.level}`);
  check('存档含时间', snap1.time > 0, `time=${snap1.time}`);
  check('存档版本=1', snap1.v === 1);

  // 记下关键状态用于恢复后比对
  const before = await ev(`JSON.stringify({
    level: window.__NS__.state.level,
    kills: window.__NS__.state.kills,
    gold: window.__NS__.state.gold,
    time: window.__NS__.state.time,
    weapons: window.__NS__.state.weapons,
    hp: window.__NS__.G.player.hp,
    maxHp: window.__NS__.G.player.maxHp,
    passives: window.__NS__.G.player.passives,
    px: Math.round(window.__NS__.G.player.x),
    py: Math.round(window.__NS__.G.player.y),
  })`);

  // SAVE & EXIT 回标题
  await ev(`window.__NS__.saveAndExit()`);
  check('退出后回到 title',
    await ev(`window.__NS__.state.state === 'title'`));
  check('退出后 CONTINUE 可见',
    await ev(`!document.getElementById('continue-btn').classList.contains('hidden')`));
  check('退出后仍有存档', await ev(`window.__NS__.hasSave() === true`));

  // CONTINUE 恢复
  await ev(`document.getElementById('continue-btn').click()`);
  check('CONTINUE 后回到 playing',
    await waitFor(`window.__NS__.state.state === 'playing'`, 5000));

  const after = await ev(`JSON.stringify({
    level: window.__NS__.state.level,
    kills: window.__NS__.state.kills,
    gold: window.__NS__.state.gold,
    time: window.__NS__.state.time,
    weapons: window.__NS__.state.weapons,
    hp: window.__NS__.G.player.hp,
    maxHp: window.__NS__.G.player.maxHp,
    passives: window.__NS__.G.player.passives,
    px: Math.round(window.__NS__.G.player.x),
    py: Math.round(window.__NS__.G.player.y),
  })`);

  check('恢复后等级一致', JSON.parse(before).level === JSON.parse(after).level,
    `${before} → ${after}`);
  check('恢复后击杀一致', JSON.parse(before).kills === JSON.parse(after).kills);
  check('恢复后武器一致',
    JSON.stringify(JSON.parse(before).weapons) === JSON.stringify(JSON.parse(after).weapons),
    `before=${JSON.parse(before).weapons} after=${JSON.parse(after).weapons}`);
  check('恢复后被动一致',
    JSON.stringify(JSON.parse(before).passives) === JSON.stringify(JSON.parse(after).passives));
  check('恢复后 maxHp 一致', JSON.parse(before).maxHp === JSON.parse(after).maxHp);
  // 时间会有少量推进（恢复时刷一波、然后 evaluate 之间有延迟），允许 +3s 以内
  check('恢复后时间近似一致',
    JSON.parse(after).time >= JSON.parse(before).time &&
    JSON.parse(after).time - JSON.parse(before).time < 3,
    `before=${JSON.parse(before).time} after=${JSON.parse(after).time}`);

  // 恢复后派生字段重算验证：spdMul/dmgMul 应与被动等级吻合
  const derived = await ev(`JSON.stringify({
    spdMul: window.__NS__.G.player.spdMul,
    dmgMul: window.__NS__.G.player.dmgMul,
    cdMul: window.__NS__.G.player.cdMul,
    pierce: window.__NS__.G.player.pierce,
    regen: window.__NS__.G.player.regen,
  })`);
  const d = JSON.parse(derived);
  const ps = JSON.parse(after).passives || {};
  // 重新算期望值
  const expSpd = 1 + (ps.speed || 0) * 0.12;
  const expDmg = 1 + (ps.dmg || 0) * 0.15;
  const expCd = 1 - (ps.cd || 0) * 0.08;
  check('恢复后 spdMul 重算正确', Math.abs(d.spdMul - expSpd) < 1e-6, `got=${d.spdMul} exp=${expSpd}`);
  check('恢复后 dmgMul 重算正确', Math.abs(d.dmgMul - expDmg) < 1e-6, `got=${d.dmgMul} exp=${expDmg}`);
  check('恢复后 cdMul 重算正确', Math.abs(d.cdMul - expCd) < 1e-6, `got=${d.cdMul} exp=${expCd}`);
  check('恢复后 pierce 正确', d.pierce === (ps.pierce || 0));
  check('恢复后 regen 正确', d.regen === (ps.regen || 0) * 1.5);

  // 死亡应清存档
  await ev(`window.__NS__.G.enemies = []; window.__NS__.G.projectiles = [];`);
  await sleep(200);
  await ev(`window.__NS__.G.player.hp = 1; window.__NS__.G.player.invuln = 0;`);
  await ev(`window.__NS__.spawnEnemyAt('drone', 5, 0)`);
  await waitFor(`window.__NS__.state.state === 'dead'`, 10000);
  check('死亡后存档被清除', await ev(`window.__NS__.hasSave() === false`));

  // 死亡回标题后 CONTINUE 应隐藏
  await ev(`document.getElementById('end-restart-btn').click()`);
  await waitFor(`window.__NS__.state.state === 'playing'`, 5000);
  // 开新局也应清存档
  await ev(`window.__NS__.saveAndExit()`);  // 制造一个存档
  await ev(`document.getElementById('start-btn').click()`);
  await waitFor(`window.__NS__.state.state === 'playing'`, 5000);
  check('开新局清掉旧存档', await ev(`window.__NS__.hasSave() === false`));

  check('全程无运行时错误', errors.length === 0, errors.slice(0, 3));
} catch (error) {
  check('存档回归执行', false, String(error));
} finally {
  await browser?.close();
  finish();
}
