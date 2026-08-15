// Shared zero-dependency CDP harness for the forge-breaker browser tests.
// Picks a free debugging port at runtime so a stale browser can never fake a failure.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const EXE = process.env.CHROME
  || '/home/forbackup/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export async function launch(url) {
  const port = await freePort();
  const chrome = spawn(EXE, [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--window-size=1280,860',
    '--no-sandbox',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--disable-dev-shm-usage',
    '--mute-audio',
    'about:blank',
  ], { stdio: 'ignore' });

  let version;
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) { version = await r.json(); break; }
    } catch {}
    await sleep(150);
  }
  if (!version) { chrome.kill('SIGKILL'); throw new Error('Chromium 未能在超时内启动'); }

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let msgId = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const q = pending.get(m.id);
      pending.delete(m.id);
      m.error ? q.reject(new Error(JSON.stringify(m.error))) : q.resolve(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params?.exceptionDetails;
      errors.push(d?.exception?.description || d?.text || 'unknown exception');
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cmd = (m, p) => send(m, p, sessionId);
  await cmd('Page.enable');
  await cmd('Runtime.enable');
  await cmd('Page.navigate', { url });

  const evaluate = async (expression) => {
    const r = await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result.value;
  };

  const waitFor = async (expression, ms = 45000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try { if (await evaluate(expression)) return true; } catch {}
      await sleep(200);
    }
    return false;
  };

  const close = async () => {
    try { await send('Browser.close'); } catch {}
    try { ws.close(); } catch {}
    chrome.kill('SIGKILL');
  };

  return { evaluate, waitFor, errors, close, cmd, port };
}

export function reporter() {
  const failures = [];
  const check = (name, ok, detail) => {
    console.log(`${ok ? '✓' : '✗'} ${name}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ''}`);
    if (!ok) failures.push(name);
    return ok;
  };
  const finish = () => {
    if (failures.length) {
      console.log(`\n${failures.length} 项失败: ${failures.join(', ')}`);
      process.exitCode = 1;
    } else {
      console.log('\nALL BROWSER TESTS PASSED');
    }
  };
  return { check, finish, failures };
}
