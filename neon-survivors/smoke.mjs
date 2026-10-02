// Real-browser smoke test for NEON SURVIVORS. No npm dependency.
import { launch, reporter, sleep } from './cdp.mjs';

const base = process.env.TARGET || 'http://127.0.0.1:4180/neon-survivors/';
const { check, finish } = reporter();
let browser;
try {
  browser = await launch(base);
  const { evaluate: ev, waitFor, errors } = browser;

  // 1. Title screen loads
  check('Canvas initialized', await waitFor(`!!document.querySelector('#game')`));
  check('Debug API exposed', await waitFor(`!!window.__NS__`));
  check('Title screen visible', await ev(`!document.getElementById('title-screen').classList.contains('hidden')`));

  // 2. Start game
  await ev(`document.getElementById('start-btn').click()`);
  check('Game state = playing', await waitFor(`window.__NS__.state.state === 'playing'`));
  check('Player exists', await ev(`!!window.__NS__.G.player`));
  check('HUD visible', await ev(`!document.getElementById('hud').classList.contains('hidden')`));

  // 3. Enemies spawn
  check('Enemies spawned', await waitFor(`window.__NS__.state.enemies > 0`, 8000));
  await sleep(1500);
  check('Projectiles firing', await waitFor(`window.__NS__.state.projectiles > 0`, 6000));
  check('Time advancing', await ev(`window.__NS__.state.time > 0.5`));

  // 4. Test upgrade flow
  await ev(`window.__NS__.forceLevelUp()`);
  check('Upgrade bar shows', await waitFor(`!document.getElementById('upgrade-bar').classList.contains('hidden')`, 5000));
  const cardCount = await ev(`document.querySelectorAll('#upgrade-cards .card').length`);
  check('3 upgrade cards offered', cardCount === 3, `got ${cardCount}`);
  // pick first card (also test that game kept running during upgrade)
  await ev(`document.querySelector('#upgrade-cards .card').click()`);
  check('Upgrade chosen, bar hidden', await waitFor(`document.getElementById('upgrade-bar').classList.contains('hidden')`, 5000));
  // 关键验证：升级期间游戏不暂停，时间继续增长
  const timeBefore = await ev(`window.__NS__.state.time`);
  await sleep(1000);
  const timeAfter = await ev(`window.__NS__.state.time`);
  check('Game runs during upgrades (time advances)', timeAfter > timeBefore + 0.5, `before=${timeBefore.toFixed(1)} after=${timeAfter.toFixed(1)}`);

  // 5. Let it run a few seconds, ensure no errors and enemies dying
  await sleep(5000);
  check('Kills accumulating', await waitFor(`window.__NS__.state.kills > 0`, 8000));
  check('Level >= 2 after upgrade', await ev(`window.__NS__.state.level >= 2`));

  // 6. Pause toggle
  await ev(`window.__NS__.togglePause()`);
  check('Pause screen shows', await ev(`window.__NS__.state.state === 'paused'`));
  await ev(`window.__NS__.togglePause()`);

  check('No runtime errors', errors.length === 0, errors.slice(0, 3));
  console.log('final state', await ev(`window.__NS__.state`));
} catch (error) {
  check('Smoke test execution', false, String(error));
} finally {
  await browser?.close();
  finish();
}
