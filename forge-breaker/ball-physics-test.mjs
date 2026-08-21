// forge-breaker ball physics test
import { launch, reporter, sleep } from './cdp.mjs';

const base = process.env.TARGET || 'http://127.0.0.1:4173/forge-breaker/';
const { check, finish } = reporter();
let browser;
try {
  browser = await launch(base);
  const { evaluate: ev, waitFor, errors } = browser;
  await waitFor('!!window.__FORGE_DEBUG__');
  await ev('localStorage.removeItem("hellforge.meta.v1"); document.getElementById("start").click()');
  await waitFor('__FORGE_DEBUG__.S.phase === "playing" && __FORGE_DEBUG__.S.enemies.length > 0');

  // Test 1: ball stays within horizontal bounds
  await ev('__FORGE_DEBUG__.launch()');
  await sleep(800);
  const b1Str = await ev('JSON.stringify({count:__FORGE_DEBUG__.S.balls.length,balls:__FORGE_DEBUG__.S.balls.map(function(b){return{x:Math.round(b.x),y:Math.round(b.y)}})})');
  const b1Obj = JSON.parse(b1Str);
  const cw = await ev('document.querySelector("#game").width');
  var outOfBounds = b1Obj.balls.filter(function(b){return b.x < 0 || b.x > cw;});
  check('Ball stays in horizontal bounds', outOfBounds.length === 0, 'count=' + b1Obj.count + ' outOfBounds=' + outOfBounds.length);

  // Test 2: ball stays below top boundary
  var topStr = await ev('JSON.stringify({aboveTop:__FORGE_DEBUG__.S.balls.filter(function(b){return b.y<70}).length,minY:__FORGE_DEBUG__.S.balls.length?Math.min.apply(null,__FORGE_DEBUG__.S.balls.map(function(b){return b.y})):null})');
  var topObj = JSON.parse(topStr);
  check('Ball stays below top boundary', topObj.aboveTop === 0, 'minY=' + topObj.minY);

  // Test 3: high-speed ball bounces off paddle (use direct tick to simulate)
  // Spawn ball above paddle, then manually call many ticks to simulate movement
  await ev('var S=__FORGE_DEBUG__.S;var H=innerHeight;S.balls=[];S.balls.push({x:S.paddle.x,y:H-120,vx:0,vy:800,r:7,damage:1,pierce:0,kind:"ember",trail:[]})');
  // The ball oscillates paddle <-> brick field with a ~2s period, so sampling vy once at a
  // fixed delay is phase-dependent and flaky. Latch the first upward frame instead: a paddle
  // bounce is proven by vy ever going negative, whatever the ball is doing when we look.
  await ev('window.__PB_LATCH__=false;(function p(){if(!window.__PB_DONE__){var b=__FORGE_DEBUG__.S.balls[0];if(b&&b.vy<0)window.__PB_LATCH__=true;requestAnimationFrame(p)}})()');
  const bounced = await waitFor('window.__PB_LATCH__===true', 8000);
  await ev('window.__PB_DONE__=true');
  var pbObj = JSON.parse(await ev('JSON.stringify({count:__FORGE_DEBUG__.S.balls.length,vy:__FORGE_DEBUG__.S.balls.length?Math.round(__FORGE_DEBUG__.S.balls[0].vy):0,y:__FORGE_DEBUG__.S.balls.length?Math.round(__FORGE_DEBUG__.S.balls[0].y):0})'));
  check('High-speed ball bounces off paddle', bounced, 'latchedUpward=' + bounced + ' nowVy=' + pbObj.vy + ' y=' + pbObj.y + ' count=' + pbObj.count);

  // Test 4: ball removed after falling below screen (miss paddle)
  await ev('var S=__FORGE_DEBUG__.S;var H=innerHeight;S.balls=[];S.balls.push({x:50,y:H-120,vx:50,vy:600,r:7,damage:1,pierce:0,kind:"ember",trail:[]})');
  await sleep(5000);
  var lostStr = await ev('JSON.stringify({balls:__FORGE_DEBUG__.S.balls.length})');
  var lostObj = JSON.parse(lostStr);
  check('Ball removed after falling below screen', lostObj.balls === 0, 'balls=' + lostObj.balls);

  // Test 5: game continues when all balls lost
  var hintStr = await ev('JSON.stringify({phase:__FORGE_DEBUG__.S.phase,balls:__FORGE_DEBUG__.S.balls.length})');
  var hintObj = JSON.parse(hintStr);
  check('Game continues when all balls lost', hintObj.phase === 'playing' && hintObj.balls === 0);

  // Test 6: can relaunch after ball lost
  await ev('__FORGE_DEBUG__.launch()');
  await sleep(300);
  var relStr = await ev('JSON.stringify({balls:__FORGE_DEBUG__.S.balls.length})');
  var relObj = JSON.parse(relStr);
  check('Can relaunch after ball lost', relObj.balls > 0);

  check('No runtime errors', errors.length === 0, errors.slice(0, 3));
  console.log('final', await ev('JSON.stringify({phase:__FORGE_DEBUG__.S.phase,wave:__FORGE_DEBUG__.S.wave,balls:__FORGE_DEBUG__.S.balls.length})'));
} catch (error) {
  check('Ball physics test execution', false, String(error));
} finally {
  await browser?.close();
  finish();
}
