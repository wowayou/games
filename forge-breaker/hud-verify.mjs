// 真实浏览器验证新 HUD 与球权机制的端到端表现，并截图检查布局（含移动端）。
import { launch, reporter, sleep } from './cdp.mjs';
import { writeFile } from 'node:fs/promises';

const base = process.env.TARGET || 'http://127.0.0.1:4173/forge-breaker/index.html';
const { check, finish } = reporter();
let browser;
try {
  browser = await launch(base);
  const { evaluate: ev, waitFor, errors, cmd } = browser;
  await waitFor('!!window.__FORGE_DEBUG__');
  await ev('localStorage.removeItem("hellforge.meta.v1"); document.getElementById("start").click()');
  await waitFor('__FORGE_DEBUG__.S.phase==="playing" && __FORGE_DEBUG__.S.enemies.length>0');

  // 新 HUD 元素必须都存在且已填值
  const hud = JSON.parse(await ev(`JSON.stringify({
    forgex:  document.getElementById('forgex')?.textContent,
    stackInfo: document.getElementById('stackInfo')?.textContent,
    stackbar: document.getElementById('stackbar')?.style.width,
    heatx:   document.getElementById('heatx')?.textContent,
    heatInfo:document.getElementById('heatInfo')?.textContent,
    pips:    document.getElementById('reloadPips')?.textContent,
    rinfo:   document.getElementById('reloadInfo')?.textContent
  })`));
  check('New HUD elements render', Object.values(hud).every((v) => v !== undefined && v !== null && v !== ''), hud);
  check('Reload pips show 3 free at wave start', hud.pips === '●●●', { pips: hud.pips });

  // 叠层 -> HUD 倍率跟着变
  await ev('__FORGE_DEBUG__.setStacks(10)');
  const m = await ev(`document.getElementById('forgex').textContent`);
  check('Stacks drive the HUD multiplier', m === '3.0', { forgex: m });

  // 装填指示器随消耗更新
  await ev('__FORGE_DEBUG__.S.balls=[]; __FORGE_DEBUG__.launch(); __FORGE_DEBUG__.S.balls=[]; __FORGE_DEBUG__.launch()');
  const pips2 = await ev(`document.getElementById('reloadPips').textContent`);
  check('Reload pips deplete as reloads are used', pips2.split('●').length - 1 < 3, { pips: pips2, used: await ev('__FORGE_DEBUG__.S.reloadsUsed') });

  // 满热度 -> 提示切换 + 爆发可用
  await ev('__FORGE_DEBUG__.fillHeat()');
  const hi = await ev(`document.getElementById('heatInfo').textContent`);
  check('Full heat flips the HUD hint', hi.includes('爆发'), { heatInfo: hi });
  const before = await ev('__FORGE_DEBUG__.S.enemies.filter(e=>!e.dead).reduce((a,e)=>a+e.hp,0)');
  await ev('__FORGE_DEBUG__.nova()');
  const after = await ev('__FORGE_DEBUG__.S.enemies.filter(e=>!e.dead).reduce((a,e)=>a+e.hp,0)');
  check('Nova damages field in real browser', after < before, { before, after });

  // 空格键绑定：满热度时按空格应触发爆发
  await ev('__FORGE_DEBUG__.setWave(3); __FORGE_DEBUG__.launch(); __FORGE_DEBUG__.fillHeat()');
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space'}))`);
  const heatAfterKey = await ev('__FORGE_DEBUG__.S.heat');
  check('Space releases nova when heat is full', heatAfterKey === 0, { heat: heatAfterKey });

  // 爆发闪光必须衰减，即使清场后进入 draft（tick 已停）也不能残留
  await ev('__FORGE_DEBUG__.setWave(5); __FORGE_DEBUG__.launch(); __FORGE_DEBUG__.fillHeat(); __FORGE_DEBUG__.nova(); __FORGE_DEBUG__.clearWave()');
  await waitFor('__FORGE_DEBUG__.S.phase!=="playing"');
  await sleep(1800);
  const flash = await ev('__FORGE_DEBUG__.S.novaFlash');
  check('Nova flash decays even outside playing phase', flash === 0, { novaFlash: flash, phase: await ev('__FORGE_DEBUG__.S.phase') });

  // 桌面截图
  const shot = async (name, w, h, mobile) => {
    await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    await sleep(900);
    const { data } = await cmd('Page.captureScreenshot', { format: 'png' });
    await writeFile(new URL(`./${name}`, import.meta.url), Buffer.from(data, 'base64'));
    return name;
  };
  await shot('shot-desktop.png', 1280, 860, false);
  await shot('shot-mobile.png', 390, 844, true);
  check('Screenshots captured', true, ['shot-desktop.png', 'shot-mobile.png']);

  // 移动端左栏是否溢出
  const overflow = JSON.parse(await ev(`(()=>{const a=document.querySelector('aside.left');const r=a.getBoundingClientRect();return JSON.stringify({top:Math.round(r.top),bottom:Math.round(r.bottom),vh:innerHeight,overflow:r.bottom>innerHeight})})()`));
  check('Left HUD fits mobile viewport', !overflow.overflow, overflow);

  check('No runtime errors', errors.length === 0, errors.slice(0, 3));
} catch (error) {
  check('HUD verification execution', false, String(error));
} finally {
  await browser?.close();
  finish();
}
