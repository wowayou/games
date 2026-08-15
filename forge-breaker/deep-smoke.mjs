// Full real-browser progression acceptance: draft -> forge -> next wave -> boss -> fusion -> persistent vault.
import { launch, reporter } from './cdp.mjs';

const base = process.env.TARGET || 'http://127.0.0.1:4173/forge-breaker/';
const { check, finish } = reporter();
let browser;
try {
  browser = await launch(base);
  const { evaluate: ev, waitFor, errors } = browser;
  check('Game debug API ready', await waitFor(`!!window.__FORGE_DEBUG__`));
  await ev(`localStorage.removeItem('hellforge.meta.v1'); document.getElementById('start').click()`);
  check('Run starts with enemies', await waitFor(`__FORGE_DEBUG__.S.phase==='playing' && __FORGE_DEBUG__.S.enemies.length > 0`));

  // Wave 1 clear: player must receive a three-card draft.
  await ev(`__FORGE_DEBUG__.clearWave()`);
  check('Draft opens after clear', await waitFor(`__FORGE_DEBUG__.S.phase==='draft' && document.querySelectorAll('#cards [data-up]').length===3`));
  check('Draft cards render', await ev(`[...document.querySelectorAll('#cards [data-up]')].map(x=>x.dataset.up)`));
  await ev(`(document.querySelector('#cards [data-up="fire"]') || document.querySelector('#cards [data-up]')).click()`);
  check('Card choice advances to wave 2', await waitFor(`__FORGE_DEBUG__.S.phase==='playing' && __FORGE_DEBUG__.S.wave===2`));

  // Wave 2 clear: player must get draft then forge, with ore and localStorage-backed purchase.
  await ev(`__FORGE_DEBUG__.grantOre(80); __FORGE_DEBUG__.clearWave()`);
  check('Second draft opens', await waitFor(`__FORGE_DEBUG__.S.phase==='draft'`));
  await ev(`(document.querySelector('#cards [data-up="ice"]') || document.querySelector('#cards [data-up]')).click()`);
  check('Forge opens after second draft', await waitFor(`__FORGE_DEBUG__.S.phase==='forge' && document.querySelectorAll('#forgeCards [data-forge]').length===4`));
  const beforeForge = await ev(`({ore:__FORGE_DEBUG__.S.ore,damage:__FORGE_DEBUG__.meta.forge.damage})`);
  await ev(`document.querySelector('#forgeCards [data-forge="damage"]').click()`);
  check('Forge purchase persists', await ev(`__FORGE_DEBUG__.meta.forge.damage===1 && __FORGE_DEBUG__.S.ore < ${beforeForge.ore}`));
  await ev(`document.getElementById('continue').click()`);
  check('Forge continue reaches wave 3', await waitFor(`__FORGE_DEBUG__.S.phase==='playing' && __FORGE_DEBUG__.S.wave===3`));

  // Clear wave 3, select a fusion in its draft, and start boss wave 4.
  // Seed the two required elements so this acceptance is deterministic.
  await ev(`__FORGE_DEBUG__.S.fire=1; __FORGE_DEBUG__.S.ice=1; __FORGE_DEBUG__.clearWave()`);
  check('Wave 3 draft opens', await waitFor(`__FORGE_DEBUG__.S.phase==='draft'`));
  check('Fire + ice fusion offered', await ev(`!!document.querySelector('#cards [data-up="melting"]')`));
  await ev(`document.querySelector('#cards [data-up="melting"]').click()`);
  check('Melting fusion activates', await waitFor(`__FORGE_DEBUG__.S.fusion.melting && __FORGE_DEBUG__.S.wave===4 && __FORGE_DEBUG__.S.phase==='playing'`));
  const boss = await ev(`__FORGE_DEBUG__.S.enemies.find(e=>e.kind==='boss')`);
  check('Wave 4 spawns a boss', !!boss, boss && { hp: boss.hp, w: boss.w, h: boss.h });

  // F must deposit ore to persistent vault and no longer discard it.
  await ev(`__FORGE_DEBUG__.grantOre(17); window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF'}))`);
  check('F deposits ore in vault', await waitFor(`__FORGE_DEBUG__.S.ore===0 && __FORGE_DEBUG__.meta.vault>=17`));
  check('Vault persists to localStorage', await ev(`JSON.parse(localStorage.getItem('hellforge.meta.v1')).vault >= 17`));

  check('No runtime errors', errors.length===0, errors.slice(0, 3));
  console.log('final state', await ev(`({wave:__FORGE_DEBUG__.S.wave,phase:__FORGE_DEBUG__.S.phase,fusion:__FORGE_DEBUG__.S.fusion,vault:__FORGE_DEBUG__.meta.vault,forge:__FORGE_DEBUG__.meta.forge})`));
} catch (error) {
  check('Deep progression test execution', false, String(error));
} finally {
  await browser?.close();
  finish();
}
