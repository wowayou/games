// 存档带被动场景：升级选被动后再存/读，确认派生字段（spdMul/dmgMul 等）重算正确
import { launch, reporter, sleep } from './cdp.mjs';

const base = process.env.TARGET || 'http://127.0.0.1:4180/neon-survivors/';
const { check, finish } = reporter();
let browser;
try {
  browser = await launch(base);
  const { evaluate: ev, waitFor, errors } = browser;

  await waitFor(`typeof window.__NS__ === 'object'`, 8000);

  await ev(`window.__NS__.clearSave()`).catch(() => {});
  // 等 __NS__ 真就绪再点开始
  await waitFor(`typeof window.__NS__ === 'object'`, 8000);
  await ev(`document.getElementById('start-btn').click()`);
  await waitFor(`window.__NS__.state.state === 'playing'`, 8000);

  // 多次升级，优先选被动卡（不是新武器）来累积 passives
  for (let i = 0; i < 6; i++) {
    await ev(`window.__NS__.forceLevelUp()`);
    const shown = await waitFor(`!document.getElementById('upgrade-bar').classList.contains('hidden')`, 8000);
    if (!shown) { check(`第${i+1}次升级条出现`, false, `iter ${i+1} state=${await ev('window.__NS__.state.state')}`); break; }
    // 优先选被动卡：被动卡名匹配 PASSIVES 列表
    const picked = await ev(`(() => {
      const cards = document.querySelectorAll('#upgrade-cards .card');
      if (cards.length === 0) return false;
      const passiveNames = ['疾步','强化外壳','攻击强化','冷却缩减','磁吸场','纳米修复','穿透弹头','金币磁铁'];
      let target = null;
      for (const c of cards) {
        const name = c.querySelector('.card-name')?.textContent || '';
        if (passiveNames.some(n => name.includes(n))) { target = c; break; }
      }
      (target || cards[0]).click();
      return true;
    })()`);
    if (!picked) { check(`第${i+1}次选卡`, false); break; }
    const hidden = await waitFor(`document.getElementById('upgrade-bar').classList.contains('hidden')`, 5000);
    if (!hidden) { check(`第${i+1}次选完隐藏`, false); break; }
    await sleep(50);
  }
  await sleep(100);

  const before = await ev(`JSON.stringify({
    passives: window.__NS__.G.player.passives,
    spdMul: window.__NS__.G.player.spdMul,
    dmgMul: window.__NS__.G.player.dmgMul,
    cdMul: window.__NS__.G.player.cdMul,
    pickupR: window.__NS__.G.player.pickupR,
    pierce: window.__NS__.G.player.pierce,
    regen: window.__NS__.G.player.regen,
    goldMul: window.__NS__.G.player.goldMul,
    maxHp: window.__NS__.G.player.maxHp,
    hp: window.__NS__.G.player.hp,
  })`);
  const b = JSON.parse(before);
  const ps = b.passives || {};
  check('本场景至少选了 1 个被动', Object.keys(ps).length >= 1, JSON.stringify(ps));

  // SAVE & EXIT → CONTINUE
  await ev(`window.__NS__.saveAndExit()`);
  await ev(`document.getElementById('continue-btn').click()`);
  await waitFor(`window.__NS__.state.state === 'playing'`, 5000);
  await sleep(100);

  const after = await ev(`JSON.stringify({
    passives: window.__NS__.G.player.passives,
    spdMul: window.__NS__.G.player.spdMul,
    dmgMul: window.__NS__.G.player.dmgMul,
    cdMul: window.__NS__.G.player.cdMul,
    pickupR: window.__NS__.G.player.pickupR,
    pierce: window.__NS__.G.player.pierce,
    regen: window.__NS__.G.player.regen,
    goldMul: window.__NS__.G.player.goldMul,
    maxHp: window.__NS__.G.player.maxHp,
    hp: window.__NS__.G.player.hp,
  })`);
  const a = JSON.parse(after);

  check('被动等级一致', JSON.stringify(b.passives) === JSON.stringify(a.passives));
  check('spdMul 恢复一致', Math.abs(b.spdMul - a.spdMul) < 1e-9, `b=${b.spdMul} a=${a.spdMul}`);
  check('dmgMul 恢复一致', Math.abs(b.dmgMul - a.dmgMul) < 1e-9, `b=${b.dmgMul} a=${a.dmgMul}`);
  check('cdMul 恢复一致', Math.abs(b.cdMul - a.cdMul) < 1e-9, `b=${b.cdMul} a=${a.cdMul}`);
  check('pickupR 恢复一致', Math.abs(b.pickupR - a.pickupR) < 1e-9, `b=${b.pickupR} a=${a.pickupR}`);
  check('pierce 恢复一致', b.pierce === a.pierce);
  check('regen 恢复一致', b.regen === a.regen);
  check('goldMul 恢复一致', b.goldMul === a.goldMul);
  check('maxHp 恢复一致', b.maxHp === a.maxHp);
  check('hp 恢复一致', b.hp === a.hp);

  // 手动验算期望值
  check('spdMul 期望正确', Math.abs(a.spdMul - (1 + (ps.speed||0)*0.12)) < 1e-9);
  check('dmgMul 期望正确', Math.abs(a.dmgMul - (1 + (ps.dmg||0)*0.15)) < 1e-9);
  check('cdMul 期望正确', Math.abs(a.cdMul - (1 - (ps.cd||0)*0.08)) < 1e-9);
  check('pickupR 期望正确', Math.abs(a.pickupR - 60*(1+(ps.pickup||0)*0.6)) < 1e-9);
  check('regen 期望正确', Math.abs(a.regen - (ps.regen||0)*1.5) < 1e-9);
  check('pierce 期望正确', a.pierce === (ps.pierce||0));
  check('goldMul 期望正确', Math.abs(a.goldMul - (1 + (ps.magnet||0))) < 1e-9);
  check('maxHp 期望正确', a.maxHp === 100 + (ps.hp||0)*25);

  check('无运行时错误', errors.length === 0, errors.slice(0, 3));
} catch (error) {
  check('带被动存档回归执行', false, String(error));
} finally {
  await browser?.close();
  finish();
}
