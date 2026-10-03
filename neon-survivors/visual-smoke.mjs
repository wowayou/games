// 受控实体截图及 UI 状态检查；截图需人工复核，不是自动视觉相似度测试。
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, reporter } from './cdp.mjs';

const base = process.env.TARGET || 'http://127.0.0.1:4180/neon-survivors/';
const output = process.env.SCREENSHOT ? resolve(process.env.SCREENSHOT)
  : fileURLToPath(new URL('./.devtest/entities.png', import.meta.url));
const { check, finish } = reporter();
function must(name, ok, detail) {
  if (!check(name, ok, detail)) throw new Error(name);
}
let browser;
try {
  browser = await launch(base);
  const { evaluate: ev, waitFor, errors, cmd } = browser;
  must('Debug API loaded', await waitFor(`!!window.__NS__`, 10000));
  must('Title screen has no low-HP effect', await ev(`Number(getComputedStyle(document.getElementById('vignette-lowhp')).opacity) === 0`));
  await ev(`document.getElementById('start-btn').click()`);
  must('Playing', await waitFor(`window.__NS__.G.state === 'playing'`, 5000));
  await ev(`(() => {
    const g = window.__NS__.G;
    Object.assign(g, { enemies: [], projectiles: [], pickups: [], spawnTimer: 3600, bossTimer: 3600 });
    for (const [dx, dy] of [[-200, -150], [220, 180]]) {
      window.__NS__.spawnEnemyAt('shooter', g.player.x + dx, g.player.y + dy);
    }
    g.enemies.forEach(e => Object.assign(e, { shootTimer: 0, hp: 99999, maxHp: 99999, spd: 0 }));
    g.player.weaponTimers = {}; // 保留初始武器，让双方都通过真实发射路径产生弹丸。
  })()`);
  must('Both sides fire visible projectiles', await waitFor(`(() => {
    const g = window.__NS__.G;
    const visible = p => p.x > g.cam.x + 20 && p.x < g.cam.x + innerWidth - 20
      && p.y > g.cam.y + 20 && p.y < g.cam.y + innerHeight - 20
      && Math.hypot(p.x - g.player.x, p.y - g.player.y) > 50;
    if (!g.projectiles.some(p => p.hostile && visible(p)) || !g.projectiles.some(p => !p.hostile && visible(p))) return false;
    // 仅冻结场景，避免两次检查或截图之间弹丸消失；不打开暂停遮罩。
    g.state = 'paused';
    return true;
  })()`, 10000));
  await ev(`(() => {
    const g = window.__NS__.G;
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      for (const [kind, offset, radius] of [['gold', 0, 6], ['xp', 0.2, 5]]) {
        g.pickups.push({ x: g.player.x + Math.cos(angle + offset) * 180,
          y: g.player.y + Math.sin(angle + offset) * 180, vx: 0, vy: 0,
          kind, value: 1, r: radius, life: 30, t: 0 });
      }
    }
  })()`);
  const colors = await ev(`({
    hostile: window.__NS__.G.projectiles.filter(p => p.hostile).map(p => p.color),
    friendly: window.__NS__.G.projectiles.filter(p => !p.hostile).map(p => p.color)
  })`);
  must('Enemy projectiles exist and are rust-red', colors.hostile.length > 0 && colors.hostile.every(c => c === '#c8341a'), colors.hostile);
  must('Friendly projectiles exist and use distinct colors', colors.friendly.length > 0 && colors.friendly.every(c => typeof c === 'string' && !colors.hostile.includes(c)), colors.friendly);
  must('Gold and XP coexist', await ev(`['gold', 'xp'].every(kind => window.__NS__.G.pickups.filter(p => p.kind === kind).length === 6)`));
  await ev(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  const screenshot = await cmd('Page.captureScreenshot', { format: 'png' });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, Buffer.from(screenshot.data, 'base64'));
  must('Screenshot saved', screenshot.data.length > 0, output);

  must('Desktop keypad visible', await ev(`!document.body.classList.contains('touch') && !!document.querySelector('.keypad')?.getClientRects().length`));
  await cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
  must('W highlights on keydown', await waitFor(`document.querySelector('.key-w')?.classList.contains('active')`, 2000));
  await cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
  must('W clears on keyup', await waitFor(`!document.querySelector('.key-w')?.classList.contains('active')`, 2000));
  must('Hurt and offscreen layers exist', await ev(`!!document.getElementById('vignette-hurt') && !!document.getElementById('offscreen-indicators')`));

  await ev(`Object.assign(window.__NS__.G, { enemies: [], projectiles: [], pickups: [], state: 'playing' }); window.__NS__.G.player.hp = 100;`);
  must('Full health hides low-HP effect', await waitFor(`Number(getComputedStyle(document.getElementById('vignette-lowhp')).opacity) === 0`, 3000));
  await ev(`window.__NS__.G.player.hp = 20`);
  must('Low health shows low-HP effect', await waitFor(`Number(getComputedStyle(document.getElementById('vignette-lowhp')).opacity) > 0`, 3000));
  await ev(`window.__NS__.togglePause()`);
  must('Pause hides low-HP effect', await waitFor(`Number(getComputedStyle(document.getElementById('vignette-lowhp')).opacity) === 0`, 3000));
  await ev(`window.__NS__.togglePause()`);
  must('Resume restores low-HP effect', await waitFor(`Number(getComputedStyle(document.getElementById('vignette-lowhp')).opacity) > 0`, 3000));
  await ev(`window.__NS__.G.player.hp = 30`);
  must('Exactly 30 percent HP hides warning', await waitFor(`Number(getComputedStyle(document.getElementById('vignette-lowhp')).opacity) === 0`, 3000));
  await ev(`window.__NS__.G.player.hp = 29`);
  must('Below 30 percent HP shows warning', await waitFor(`Number(getComputedStyle(document.getElementById('vignette-lowhp')).opacity) > 0`, 3000));
  await ev(`window.__NS__.G.player.hp = 100`);
  must('Healing hides low-HP effect again', await waitFor(`Number(getComputedStyle(document.getElementById('vignette-lowhp')).opacity) === 0`, 3000));
  must('No runtime errors', errors.length === 0, errors);
} catch (error) {
  check('Visual smoke execution', false, String(error));
} finally {
  await browser?.close();
  finish();
}
