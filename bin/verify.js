#!/usr/bin/env node
// Odbiór: sprawdza po kolei KAŻDE kryterium z docs/acceptance-spec.md i wypisuje
// werdykt razem z liczbą, na której stoi. Kryterium bez zmierzonej liczby jest
// raportowane jako niesprawdzone, nie jako spełnione - cisza nie może udawać
// "sprawdzone, nic nie wisi".

import { execFileSync } from 'node:child_process';
import { RNG } from '../src/rng.js';
import { generateLevel, WALL } from '../src/map.js';
import { visibleSet } from '../src/fov.js';
import { findPath } from '../src/path.js';
import { Game } from '../src/game.js';
import { playOut } from '../src/bot.js';
import { serialize, fingerprint, loadFromString } from '../src/save.js';

const szybko = process.argv.includes('--fast');
const N_POZIOMOW = szybko ? 120 : 1000;
const N_PARTII = Number((process.argv.find(a => a.startsWith('--games=')) || '').split('=')[1] || (szybko ? 60 : 1000));

const wyniki = [];
const zapisz = (nr, nazwa, ok, dowod) => {
  wyniki.push({ nr, nazwa, ok, dowod });
  const znak = ok === true ? '  PRZESZŁO' : ok === false ? '  ODPADŁO ' : ' NIESPRAWDZONE';
  console.log(`${znak}  ${nr}. ${nazwa}\n              ${dowod}`);
};

console.log(`\nOdbiór wg docs/acceptance-spec.md${szybko ? '  (tryb skrócony)' : ''}\n${'='.repeat(64)}`);

// --- 1. powtarzalność ---
{
  const R = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1]];
  let zgodne = 0;
  for (let i = 0; i < 50; i++) {
    const graj = () => { const g = new Game(`odb-${i}`); for (let k = 0; k < 300; k++) { const [dx, dy] = R[k % 5]; if (!g.act({ type: 'move', dx, dy })) g.act({ type: 'wait' }); } return fingerprint(g); };
    if (graj() === graj()) zgodne++;
  }
  zapisz(1, 'Powtarzalność z ziarna', zgodne === 50, `${zgodne}/50 ziaren dało identyczny odcisk stanu`);
}

// --- 2. spójność lochu ---
{
  let niespojne = 0, bezSchodow = 0;
  for (let i = 0; i < N_POZIOMOW; i++) {
    const L = generateLevel(new RNG(`odb-poziom-${i}`), { depth: (i % 8) + 1 });
    if (!L.upPos || !L.downPos) bezSchodow++;
    const seen = new Set([`${L.upPos.x},${L.upPos.y}`]);
    const q = [L.upPos];
    let h = 0;
    while (h < q.length) {
      const c = q[h++];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = c.x + dx, ny = c.y + dy;
        if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h || L.at(nx, ny) === WALL) continue;
        if (dx && dy && (L.at(c.x + dx, c.y) === WALL || L.at(c.x, c.y + dy) === WALL)) continue;
        const k = `${nx},${ny}`;
        if (!seen.has(k)) { seen.add(k); q.push({ x: nx, y: ny }); }
      }
    }
    let podloga = 0;
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (L.at(x, y) !== WALL) podloga++;
    if (seen.size !== podloga) niespojne++;
  }
  zapisz(2, 'Spójność lochu', niespojne === 0 && bezSchodow === 0,
    `${N_POZIOMOW} poziomów: ${niespojne} niespójnych, ${bezSchodow} bez schodów`);
}

// --- 3. wzajemność widzenia ---
{
  let naruszen = 0, par = 0;
  for (let s = 0; s < 4; s++) {
    const L = generateLevel(new RNG(`odb-fov-${s}`), { depth: s + 1 });
    const opaque = (x, y) => !L.inBounds(x, y) || L.isOpaque(x, y);
    const pola = [];
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (L.isWalkable(x, y)) pola.push({ x, y });
    const widok = new Map(pola.map(p => [`${p.x},${p.y}`, visibleSet(p, 8, opaque)]));
    for (const a of pola) {
      const ka = `${a.x},${a.y}`;
      for (const kb of widok.get(ka)) {
        const [bx, by] = kb.split(',').map(Number);
        if (!L.isWalkable(bx, by)) continue;
        par++;
        if (!widok.get(kb).has(ka)) naruszen++;
      }
    }
  }
  zapisz(3, 'Wzajemność widzenia', naruszen === 0, `${par} par pól przechodnich, ${naruszen} naruszeń`);
}

// --- 4. droga optymalna ---
{
  const bfs = (L, a, b) => {
    const d = new Map([[`${a.x},${a.y}`, 0]]); const q = [a]; let h = 0;
    while (h < q.length) {
      const c = q[h++];
      if (c.x === b.x && c.y === b.y) return d.get(`${c.x},${c.y}`);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = c.x + dx, ny = c.y + dy;
        if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h || L.at(nx, ny) === WALL) continue;
        if (dx && dy && (L.at(c.x + dx, c.y) === WALL || L.at(c.x, c.y + dy) === WALL)) continue;
        const k = `${nx},${ny}`;
        if (!d.has(k)) { d.set(k, d.get(`${c.x},${c.y}`) + 1); q.push({ x: nx, y: ny }); }
      }
    }
    return null;
  };
  const rng = new RNG('odb-pary');
  let rozjazdow = 0, sprawdzonych = 0;
  for (let s = 0; s < 20; s++) {
    const L = generateLevel(new RNG(`odb-sciezka-${s}`), { depth: (s % 8) + 1 });
    for (let i = 0; i < 20; i++) {
      const los = () => { for (let t = 0; t < 400; t++) { const x = rng.int(L.w), y = rng.int(L.h); if (L.isWalkable(x, y)) return { x, y }; } return L.upPos; };
      const a = los(), b = los();
      const p = findPath(a, b, (x, y) => L.isWalkable(x, y));
      const ref = bfs(L, a, b);
      if (ref === null) { if (p !== null) rozjazdow++; continue; }
      sprawdzonych++;
      if (!p || p.length !== ref) rozjazdow++;
    }
  }
  zapisz(4, 'Droga optymalna', rozjazdow === 0, `${sprawdzonych} par porównanych z niezależnym BFS, ${rozjazdow} rozjazdów`);
}

// --- 5. zapis wierny ---
{
  let zle = 0;
  for (let i = 0; i < 20; i++) {
    const g = new Game(`odb-zapis-${i}`);
    for (let k = 0; k < 250; k++) if (!g.act({ type: 'move', dx: (k % 3) - 1, dy: (k % 2) ? 1 : -1 })) g.act({ type: 'wait' });
    const raw = serialize(g);
    const r = loadFromString(raw);
    if (!r.ok || fingerprint(r.game) !== fingerprint(g) || serialize(r.game) !== raw) { zle++; continue; }
    const g2 = loadFromString(raw).game;
    for (let k = 0; k < 150; k++) { const a = { type: 'move', dx: (k % 3) - 1, dy: (k % 2) ? 1 : -1 }; if (!g.act(a)) g.act({ type: 'wait' }); if (!g2.act(a)) g2.act({ type: 'wait' }); }
    if (fingerprint(g) !== fingerprint(g2)) zle++;
  }
  const odporny = ['', '{', 'null', '{"format":99}'].every(z => loadFromString(z).ok === false);
  zapisz(5, 'Zapis wierny i odporny', zle === 0 && odporny, `20 zapisów: ${zle} rozjazdów; zapis uszkodzony odrzucany: ${odporny ? 'tak' : 'NIE'}`);
}

// --- 6 i 7. odporność i grywalność ---
{
  const res = [];
  const t0 = Date.now();
  for (let i = 0; i < N_PARTII; i++) {
    try { res.push(playOut(new Game(`odb-bot-${i}`))); }
    catch (e) { res.push({ outcome: 'crash', cause: e.message, turns: 0, depth: 0 }); }
  }
  const crash = res.filter(r => r.outcome === 'crash').length;
  const stall = res.filter(r => r.outcome === 'stalled').length;
  const won = res.filter(r => r.outcome === 'won').length;
  const bezPrzyczyny = res.filter(r => !r.cause).length;
  const pct = (won / res.length) * 100;
  zapisz(6, 'Odporność serii partii', crash === 0 && bezPrzyczyny === 0,
    `${N_PARTII} partii w ${((Date.now() - t0) / 1000).toFixed(0)}s: ${crash} wywrotek, ${stall} bez rozstrzygnięcia (${(stall / res.length * 100).toFixed(1)}%), ${bezPrzyczyny} bez przyczyny końca`);
  zapisz(7, 'Grywalność (5-60% zwycięstw)', pct >= 5 && pct <= 60,
    `${won}/${N_PARTII} zwycięstw = ${pct.toFixed(1)}%`);
}

// --- 8. uczciwość kontroli ---
{
  let ok = null, dowod = 'nie udało się uruchomić testów';
  try {
    const out = execFileSync('node', ['--test', 'test/'], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 900000 });
    const kontrole = (out.match(/^ok \d+ - KONTROLA PRZYRZĄDU/gm) || []).length;
    const fail = (out.match(/^# fail (\d+)/m) || [])[1];
    ok = kontrole >= 5 && fail === '0';
    dowod = `${kontrole} kontroli przyrządu przeszło, testów nieudanych: ${fail}`;
  } catch (e) {
    const out = String(e.stdout || '') + String(e.stderr || '');
    const fail = (out.match(/^# fail (\d+)/m) || [])[1];
    ok = false;
    dowod = `testy zgłosiły błąd; nieudanych: ${fail ?? '?'}`;
  }
  zapisz(8, 'Uczciwość kontroli (przypadki znane-złe)', ok, dowod);
}

// --- 9. uruchamialność ---
{
  let ok = false, dowod = '';
  try {
    const out = execFileSync('node', ['bin/play.js', '--help'], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
    ok = out.includes('Roguelike');
    dowod = 'node bin/play.js --help odpowiada bez żadnych kroków wstępnych; zero zależności zewnętrznych';
  } catch (e) { dowod = `nie startuje: ${e.message}`; }
  zapisz(9, 'Uruchamialność u obcego', ok, dowod);
}

console.log('='.repeat(64));
const odpadly = wyniki.filter(w => w.ok !== true);
if (odpadly.length === 0) console.log(`\nODBIÓR ZALICZONY: ${wyniki.length}/${wyniki.length} kryteriów.\n`);
else console.log(`\nODBIÓR NIEZALICZONY. Nie przeszło: ${odpadly.map(w => w.nr).join(', ')}\n`);
process.exit(odpadly.length === 0 ? 0 : 1);
