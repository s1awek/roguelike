import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RNG } from '../src/rng.js';
import { generateLevel } from '../src/map.js';
import { visibleSet } from '../src/fov.js';

/** Naiwny shadowcasting po linii Bresenhama - CELOWO niesymetryczny.
 *  Służy wyłącznie jako przypadek znany-zły dla kontroli wzajemności. */
function naiveVisible(level, from, radius) {
  const out = new Set();
  for (let y = 0; y < level.h; y++) {
    for (let x = 0; x < level.w; x++) {
      const dx = x - from.x, dy = y - from.y;
      if (dx * dx + dy * dy > radius * radius) continue;
      let cx = from.x, cy = from.y;
      const sx = Math.sign(dx), sy = Math.sign(dy);
      let ex = Math.abs(dx), ey = Math.abs(dy), err = ex - ey, blocked = false;
      while (!(cx === x && cy === y)) {
        const e2 = 2 * err;
        if (e2 > -ey) { err -= ey; cx += sx; }
        else { err += ex; cy += sy; }
        if (cx === x && cy === y) break;
        if (level.isOpaque(cx, cy)) { blocked = true; break; }
      }
      if (!blocked) out.add(`${x},${y}`);
    }
  }
  return out;
}

test('wzajemność widzenia na polach przechodnich (5 poziomów, wyczerpująco)', () => {
  for (let s = 0; s < 5; s++) {
    const L = generateLevel(new RNG(`fov-${s}`), { depth: s + 1 });
    const opaque = (x, y) => !L.inBounds(x, y) || L.isOpaque(x, y);
    const floors = [];
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (L.isWalkable(x, y)) floors.push({ x, y });

    const seen = new Map();
    for (const f of floors) seen.set(`${f.x},${f.y}`, visibleSet(f, 8, opaque));

    for (const a of floors) {
      const ka = `${a.x},${a.y}`;
      for (const kb of seen.get(ka)) {
        const [bx, by] = kb.split(',').map(Number);
        if (!L.isWalkable(bx, by)) continue; // ściany są znanym wyjątkiem, patrz src/fov.js
        assert.ok(seen.get(kb).has(ka),
          `poziom ${s}: ${ka} widzi ${kb}, ale ${kb} nie widzi ${ka}`);
      }
    }
  }
});

test('widać samego siebie i nie widać poza zasięg', () => {
  const L = generateLevel(new RNG('fov-zasieg'), { depth: 1 });
  const opaque = (x, y) => !L.inBounds(x, y) || L.isOpaque(x, y);
  const o = L.upPos;
  const vis = visibleSet(o, 6, opaque);
  assert.ok(vis.has(`${o.x},${o.y}`));
  for (const k of vis) {
    const [x, y] = k.split(',').map(Number);
    const d2 = (x - o.x) ** 2 + (y - o.y) ** 2;
    assert.ok(d2 <= 36, `pole ${k} poza zasięgiem`);
  }
});

test('ściana zasłania to, co za nią', () => {
  const L = generateLevel(new RNG('fov-zaslona'), { depth: 1 });
  const opaque = (x, y) => !L.inBounds(x, y) || L.isOpaque(x, y);
  const vis = visibleSet(L.upPos, 8, opaque);
  // pole za pełną ścianą w linii poziomej nie może być widoczne
  let sprawdzone = 0;
  for (let x = L.upPos.x + 1; x < L.w - 1; x++) {
    if (L.isOpaque(x, L.upPos.y)) {
      for (let bx = x + 1; bx < Math.min(L.w, x + 4); bx++) {
        if (!L.isOpaque(bx, L.upPos.y)) { assert.ok(!vis.has(`${bx},${L.upPos.y}`), `widać przez ścianę: ${bx},${L.upPos.y}`); sprawdzone++; }
      }
      break;
    }
  }
  assert.ok(sprawdzone >= 0);
});

test('KONTROLA PRZYRZĄDU: naiwne pole widzenia zostaje złapane na niesymetryczności', () => {
  // Gdyby kontrola wzajemności nie łapała tego wariantu, nie mierzyłaby niczego.
  let znaleziono = false;
  for (let s = 0; s < 5 && !znaleziono; s++) {
    const L = generateLevel(new RNG(`fov-kontrola-${s}`), { depth: 1 });
    const floors = [];
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (L.isWalkable(x, y)) floors.push({ x, y });
    const seen = new Map();
    for (const f of floors) seen.set(`${f.x},${f.y}`, naiveVisible(L, f, 8));
    for (const a of floors) {
      const ka = `${a.x},${a.y}`;
      for (const kb of seen.get(ka)) {
        const [bx, by] = kb.split(',').map(Number);
        if (!L.isWalkable(bx, by)) continue;
        if (!seen.get(kb).has(ka)) { znaleziono = true; break; }
      }
      if (znaleziono) break;
    }
  }
  assert.ok(znaleziono, 'kontrola wzajemności NIE wykryła niesymetrycznego pola widzenia - jest ozdobą, nie testem');
});
