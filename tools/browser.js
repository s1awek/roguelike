// Sterownik przeglądarki po protokole debugowania (CDP). Zero zależności,
// wymaga Node 22 (globalny `WebSocket`) i Chrome'a w `/usr/bin/google-chrome`.
//
// Po co to jest: twierdzenia o wersji graficznej („po odświeżeniu stan jest ten
// sam", „konsola czysta") wolno zapisać dopiero wtedy, gdy ktoś je ZMIERZYŁ.
// Lektura własnego kodu nie jest pomiarem. Ten plik jest przyrządem, którym
// zmierzone są ustalenia z `docs/przebieg.md`.
//
// Pułapka, na którą trzeba uważać: wielka litera wysłana BEZ bitu Shift
// (`modifiers: 8`) dociera do strony jako mała. Stąd trzeci argument `key()`.
//
//   import b from './tools/browser.js';
//   await b.goto('http://localhost:8080/web/');
//   await b.key('l', 'KeyL');          // ruch w prawo
//   await b.key('N', 'KeyN', true);    // Shift+N
//   console.log(await b.eval('roguelike.game.turn'));
//   await b.shot('/tmp/zrzut.png');
//   console.log(b.errors());           // błędy konsoli i wyjątki
//   b.close();
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9333;
const profile = mkdtempSync(join(tmpdir(), 'cdp-'));
const chrome = spawn('/usr/bin/google-chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1400,820', '--no-first-run', '--no-default-browser-check',
  '--force-device-scale-factor=1', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

async function waitFor(fn, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    try { const r = await fn(); if (r) return r; } catch {}
    if (Date.now() - t0 > ms) throw new Error('limit czasu');
    await new Promise(r => setTimeout(r, 150));
  }
}

const ver = await waitFor(async () => (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json());
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));

let id = 0;
const pending = new Map();
const events = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  else if (m.method) events.push(m);
});
function send(method, params = {}, sessionId) {
  const msg = { id: ++id, method, params };
  if (sessionId) msg.sessionId = sessionId;
  ws.send(JSON.stringify(msg));
  return new Promise((res, rej) => pending.set(msg.id, { res, rej }));
}

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable'); await S('Log.enable');

const consoleMsgs = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') consoleMsgs.push(m.params.entry.text);
  if (m.method === 'Runtime.exceptionThrown') consoleMsgs.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
});

const api = {
  async goto(url) {
    await S('Page.navigate', { url });
    await new Promise(r => setTimeout(r, 900));
  },
  reload: async () => { await S('Page.reload'); await new Promise(r => setTimeout(r, 900)); },
  async eval(expr) {
    const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'blad eval');
    return r.result.value;
  },
  async key(text, code, shift = false) {
    // Wielka litera BEZ bitu Shift (modifiers 8) dociera do strony jako mala.
    const mod = shift ? 8 : 0;
    const base = { modifiers: mod, key: text, code, windowsVirtualKeyCode: code.startsWith('Key') ? code.charCodeAt(3) : 0 };
    const printable = text.length === 1;
    await S('Input.dispatchKeyEvent', printable ? { type: 'keyDown', text, ...base } : { type: 'rawKeyDown', ...base });
    await S('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await new Promise(r => setTimeout(r, 60));
  },
  async shot(path) {
    const { data } = await S('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path, Buffer.from(data, 'base64'));
    return path;
  },
  errors: () => consoleMsgs.slice(),
  close: () => { ws.close(); chrome.kill(); },
};

export default api;
