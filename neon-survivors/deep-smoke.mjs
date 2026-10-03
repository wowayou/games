// 受控场景回归：真实选卡、Boss 受击死亡、玩家死亡与结算；不代表自然长局通关。
import { launch, reporter } from './cdp.mjs';

const base = process.env.TARGET || 'http://127.0.0.1:4180/neon-survivors/';
const { check, finish } = reporter();
function must(name, ok, detail) {
  if (!check(name, ok, detail)) throw new Error(name);
}
let browser;
try {
  browser = await launch(base);
  const { evaluate: ev, waitFor, errors } = browser;
  must('Debug API loaded', await waitFor(`!!window.__NS__`, 10000));
  await ev(`document.getElementById('start-btn').click()`);
  must('Playing', await waitFor(`window.__NS__.state.state === 'playing'`, 5000));
  // 移除自然刷怪/拾取的干扰，后面逐个布置敌人，仍走真实攻击、受伤和 UI 路径。
  await ev(`Object.assign(window.__NS__.G, { enemies: [], pickups: [], spawnTimer: 3600, bossTimer: 3600 })`);

  for (let i = 0; i < 5; i++) {
    const time = await ev(`window.__NS__.G.time`);
    must(`Upgrade ${i + 1}: cooldown elapsed`, await waitFor(`window.__NS__.G.time >= ${time + 0.35}`, 5000));
    // 只在同步生成卡片时固定抽牌顺序，随后立刻恢复；不验证抽牌概率。
    await ev(`(() => {
      const random = Math.random;
      try { Math.random = () => 0.75; window.__NS__.forceLevelUp(); }
      finally { Math.random = random; }
    })()`);
    must(`Upgrade ${i + 1}: cards visible`, await waitFor(`!document.getElementById('upgrade-bar').classList.contains('hidden')`, 5000));
    const selection = await ev(`(() => {
      const names = { '脉冲弹': 'pulse', '轨道光刃': 'orbit', '散射爆': 'spread',
        '聚焦射线': 'laser', '感应雷': 'mine', '回旋刃': 'boomerang' };
      const weapons = window.__NS__.G.player.weapons;
      const cards = [...document.querySelectorAll('#upgrade-cards .card')];
      const id = card => names[card.querySelector('.card-name')?.textContent];
      const target = cards.find(card => id(card) && !weapons[id(card)]) || cards.find(card => id(card));
      if (!target) throw new Error('受控抽牌没有武器卡');
      const wid = id(target), before = weapons[wid] || 0;
      target.click();
      return { id: wid, before, after: weapons[wid] };
    })()`);
    must(`Upgrade ${i + 1}: selected weapon increased`, selection.after === selection.before + 1, selection);
    must(`Upgrade ${i + 1}: cards cleared`, await waitFor(`document.getElementById('upgrade-bar').classList.contains('hidden') && document.querySelectorAll('#upgrade-cards .card').length === 0`, 5000));
  }
  must('Exactly five levels gained', await ev(`window.__NS__.G.level === 6`));
  must('Multiple weapons acquired by clicking cards', await ev(`window.__NS__.state.weapons.length >= 2`));

  await ev(`(() => {
    const g = window.__NS__.G;
    g.projectiles = []; g.enemies = [];
    window.__NS__.spawnEnemyAt('brute', g.player.x + 180, g.player.y);
    window.__testBoss = g.enemies.at(-1);
    Object.assign(window.__testBoss, { hp: 10000, maxHp: 10000, spd: 0 });
    window.__killsBeforeBoss = g.kills;
  })()`);
  must('Boss present before damage', await ev(`window.__testBoss.boss && !window.__testBoss.dead && window.__NS__.G.enemies.includes(window.__testBoss)`));
  await ev(`window.__testBoss.hp = 1`);
  must('Actual weapon damage kills the boss', await waitFor(`window.__testBoss.dead && !window.__NS__.G.enemies.includes(window.__testBoss) && window.__NS__.G.kills === window.__killsBeforeBoss + 1`, 10000));
  must('Boss drops XP and gold', await ev(`['xp', 'gold'].every(kind => window.__NS__.G.pickups.some(p => p.kind === kind))`));

  // 禁止武器先杀死接触敌人；只由真实接触伤害触发死亡。
  await ev(`(() => {
    const g = window.__NS__.G;
    g.enemies = []; g.projectiles = []; g.pickups = [];
    Object.assign(g.player, { hp: 1, invuln: 0, regen: 0, weapons: {}, orbitCount: 0, laserActive: false });
    window.__NS__.spawnEnemyAt('drone', g.player.x + 1, g.player.y);
  })()`);
  must('Contact damage triggers game over', await waitFor(`window.__NS__.G.state === 'dead' && window.__NS__.G.player.hp === 0`, 5000));
  must('End screen visible after animation', await waitFor(`!document.getElementById('end-screen').classList.contains('hidden')`, 5000));
  must('End stats match actual kills and level', await ev(`(() => {
    const rows = Object.fromEntries([...document.querySelectorAll('#end-stats .row')].map(r => [r.querySelector('.k').textContent, r.querySelector('.v').textContent]));
    return Number(rows['击杀数']) === window.__NS__.G.kills && Number(rows['等级']) === 6;
  })()`));
  must('Death clears in-progress save', await ev(`!window.__NS__.hasSave()`));
  must('No runtime errors', errors.length === 0, errors);
} catch (error) {
  check('Deep smoke execution', false, String(error));
} finally {
  await browser?.close();
  finish();
}
