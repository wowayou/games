// Fast real-browser smoke test for the Canvas forge game. No npm dependency.
import { launch, reporter, sleep } from './cdp.mjs';

const base = process.env.TARGET || 'http://127.0.0.1:4173/forge-breaker/';
const { check, finish } = reporter();
let browser;
try {
  browser = await launch(base);
  const { evaluate: ev, waitFor, errors } = browser;
  check('Canvas initialized', await waitFor(`!!document.querySelector('#game')`));
  check('Game script loaded', await waitFor(`!!window.__FORGE_DEBUG__`));
  check('Menu visible', await ev(`document.getElementById('menu').classList.contains('active')`));
  await ev(`document.getElementById('start').click()`);
  check('Run starts', await waitFor(`__FORGE_DEBUG__.S.phase === 'playing' && __FORGE_DEBUG__.S.enemies.length > 0`));
  await ev(`__FORGE_DEBUG__.launch()`);
  await sleep(700);
  check('Projectile launches', await ev(`__FORGE_DEBUG__.S.shots > 0`));
  check('Vault HUD exists', await ev(`!!document.getElementById('vault')`));
  check('No runtime errors', errors.length === 0, errors.slice(0, 3));
  console.log('state', await ev(`({wave:__FORGE_DEBUG__.S.wave,enemies:__FORGE_DEBUG__.S.enemies.length,shots:__FORGE_DEBUG__.S.shots,vault:__FORGE_DEBUG__.meta.vault})`));
} catch (error) {
  check('Smoke test execution', false, String(error));
} finally {
  await browser?.close();
  finish();
}
