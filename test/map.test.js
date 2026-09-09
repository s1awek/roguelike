import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RNG } from '../src/rng.js';
import { generateLevel, connectivity, Level, WALL, FLOOR, STAIRS_DOWN, STAIRS_UP } from '../src/map.js';

/**
 * Niezależne przeszukiwanie wszerz, napisane w teście od zera.
 * Świadomie NIE korzysta z connectivity() z src/map.js: gdyby obie strony
 * używały tej samej funkcji, test potwierdzałby jej błąd jej własnym głosem.
 */
function reachableFrom(level, start) {
  const seen = new Set();
  const q = [start];
  seen.add(`${start.x},${start.y}`);
  while (q.length) {
    const { x, y } = q.shift();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= level.w || ny >= level.h) continue;
        if (level.at(nx, ny) === WALL) continue;
        if (dx && dy && (level.at(x + dx, y) === WALL || level.at(x, y + dy) === WALL)) continue;
        const k = `${nx},${ny}`;
        if (seen.has(k)) continue;
        seen.add(k);
        q.push({ x: nx, y: ny });
      }
    }
  }
  return seen;
}

function allFloor(level) {
  const out = [];
  for (let y = 0; y < level.h; y++) for (let x = 0; x < level.w; x++) if (level.at(x, y) !== WALL) out.push(`${x},${y}`);
  return out;
}

test('1000 poziomów: każde pole przechodnie osiągalne z wejścia', () => {
  let worst = null;
  for (let i = 0; i < 1000; i++) {
    const level = generateLevel(new RNG(`poziom-${i}`), { depth: (i % 8) + 1 });
    const reach = reachableFrom(level, level.upPos);
    const floor = allFloor(level);
    if (reach.size !== floor.length) { worst = { i, reach: reach.size, floor: floor.length }; break; }
  }
  assert.equal(worst, null, `poziom niespójny: ${JSON.stringify(worst)}`);
});

test('1000 poziomów: schody w dół i w górę istnieją i nie są tym samym polem', () => {
  for (let i = 0; i < 1000; i++) {
    const level = generateLevel(new RNG(`schody-${i}`), { depth: (i % 8) + 1 });
    assert.ok(level.upPos && level.downPos, `poziom ${i} bez schodów`);
    assert.notDeepEqual(level.upPos, level.downPos, `poziom ${i}: schody w tym samym miejscu`);
    assert.equal(level.at(level.upPos.x, level.upPos.y), STAIRS_UP);
    assert.equal(level.at(level.downPos.x, level.downPos.y), STAIRS_DOWN);
  }
});

test('obrzeże mapy jest zawsze ścianą', () => {
  for (let i = 0; i < 200; i++) {
    const l = generateLevel(new RNG(`brzeg-${i}`), { depth: 1 });
    for (let x = 0; x < l.w; x++) { assert.equal(l.at(x, 0), WALL); assert.equal(l.at(x, l.h - 1), WALL); }
    for (let y = 0; y < l.h; y++) { assert.equal(l.at(0, y), WALL); assert.equal(l.at(l.w - 1, y), WALL); }
  }
});

test('to samo ziarno daje ten sam poziom', () => {
  const a = generateLevel(new RNG('powt'), { depth: 3 });
  const b = generateLevel(new RNG('powt'), { depth: 3 });
  assert.deepEqual([...a.tiles], [...b.tiles]);
});

test('poziom przeżywa zapis i odczyt bez zmian', () => {
  const a = generateLevel(new RNG('serial'), { depth: 5 });
  const b = Level.fromJSON(JSON.parse(JSON.stringify(a.toJSON())));
  assert.deepEqual([...a.tiles], [...b.tiles]);
  assert.deepEqual(a.downPos, b.downPos);
});

test('KONTROLA PRZYRZĄDU: poziom z zamurowaną kieszenią zostaje wykryty', () => {
  // Bez tego przypadku nie wiadomo, czy test spójności cokolwiek mierzy.
  const l = generateLevel(new RNG('kontrola'), { depth: 1 });
  // dokładamy odciętą komorę w rogu, otoczoną ścianą ze wszystkich stron
  const cx = l.w - 3, cy = l.h - 3;
  l.set(cx, cy, FLOOR);
  const reach = reachableFrom(l, l.upPos);
  const floor = allFloor(l);
  assert.notEqual(reach.size, floor.length, 'test spójności przepuścił poziom z odciętą komorą');
  assert.equal(connectivity(l, l.upPos).ok, false, 'connectivity() przepuściła poziom z odciętą komorą');
});
