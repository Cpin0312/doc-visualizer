// 小さな CDP（Chrome DevTools Protocol）の道具。Mac・Windows・Linux の Chrome / Edge を探して、ヘッドレスで動かす。
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function findBrowser() {
  if (process.env.CHROME_PATH) {
    if (existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
    throw new Error('CHROME_PATH の場所にブラウザがない：' + process.env.CHROME_PATH);
  }
  const env = process.env, c = [];
  if (process.platform === 'win32') {
    for (const base of [env['ProgramFiles'], env['ProgramFiles(x86)'], env['LOCALAPPDATA']].filter(Boolean)) {
      c.push(join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
      c.push(join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    }
  } else if (process.platform === 'darwin') {
    c.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium');
  } else {
    c.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge', '/snap/bin/chromium');
  }
  const hit = c.find(p => existsSync(p));
  if (!hit) throw new Error('Chrome も Edge も見つからない。CHROME_PATH に場所を入れてください。探した場所：\n' + c.join('\n'));
  return hit;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch({ headless = true } = {}) {
  const exe = findBrowser();
  const profile = mkdtempSync(join(tmpdir(), 'docvis-'));
  // 番号は 0（空いている番号を選ばせ、DevToolsActivePort から読む）
  const args = ['--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-sync', '--disable-component-update',
    '--window-size=1366,900', 'about:blank'];
  if (headless) args.unshift('--headless=new');
  const proc = spawn(exe, args, { stdio: 'ignore' });
  const cleanup = () => { try { proc.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
  process.on('exit', cleanup);
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    try { port = +readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0]; } catch {}
    if (!port) await sleep(150);
  }
  if (!port) throw new Error('ブラウザが立ち上がらない：' + exe);
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
    if (!page) await sleep(150);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map(), listeners = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
    else listeners.forEach(f => f(m));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
    return r.result.value;
  };
  const on = f => listeners.push(f);
  const close = () => { try { ws.close(); } catch {} cleanup(); };
  return { send, evalJs, on, close, exe };
}
