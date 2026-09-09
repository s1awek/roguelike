import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RNG } from '../src/rng.js';
import { generateLevel, WALL } from '../src/map.js';
import { findPath, distanceField } from '../src/path.js';

/**
 * Niezależne przeszukiwanie wszerz napisane w teście od zera. Nie importuje
 * neighbors() z src/path.js celowo: jeżeli reguła sąsiedztwa jest błędna,
 * wspólna funkcja przepisałaby ten sam błąd do obu stron porównania i test
 * potwierdziłby wynik jego własnym głosem.
 */
function bfsLength(level, start, goal) {
  const key = (x, y) => `${x},${y}`;
  const dist = new Map([[key(start.x, start.y), 0]]);
  const q = [start];
  let head = 0;
  while (head < q.length) {
    const c = q[head++];
    if (c.x === goal.x && c.y === goal.y) return dist.get(key(c.x, c.y));
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = c.x + dx, ny = c.y + dy;
        if (nx < 0 || ny < 0 || nx >= level.w || ny >= level.h) continue;
        if (level.at(nx, ny) === WALL) continue;
        if (dx && dy && (level.at(c.x + dx, c.y) === WALL || level.at(c.x, c.y + dy) === WALL)) continue;
        const k = key(nx, ny);
        if (dist.has(k)) continue;
        dist.set(k, dist.get(key(c.x, c.y)) + 1);
        q.push({ x: nx, y: ny });
      }
    }
  }
  return null;
}

function randomFloors(level, rng, n) {
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 5000) {
    const x = rng.int(level.w), y = rng.int(level.h);
    if (level.isWalkable(x, y)) out.push({ x, y });
  }
  return out;
}

test('A* zwraca trasę optymalną - 400 par pól, porównanie z niezależnym BFS', () => {
  const rng = new RNG('pary');
  let sprawdzonych = 0;
  for (let s = 0; s < 20; s++) {
    const L = generateLevel(new RNG(`sciezka-${s}`), { depth: (s % 8) + 1 });
    const pts = randomFloors(L, rng, 40);
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const a = pts[i], b = pts[i + 1];
      const path = findPath(a, b, (x, y) => L.isWalkable(x, y));
      const ref = bfsLength(L, a, b);
      if (ref === null) { assert.equal(path, null, `BFS nie znalazł drogi, a A* tak: ${JSON.stringify(a)}->${JSON.stringify(b)}`); continue; }
      assert.ok(path !== null, `A* nie znalazł drogi, którą widzi BFS: ${JSON.stringify(a)}->${JSON.stringify(b)}`);
      assert.equal(path.length, ref, `trasa dłuższa od optymalnej: ${path.length} zamiast ${ref}`);
      sprawdzonych++;
    }
  }
  assert.ok(sprawdzonych > 300, `sprawdzono tylko ${sprawdzonych} par - test niczego nie mierzy`);
});

test('kolejne pola trasy są sąsiednie i przechodnie', () => {
  const L = generateLevel(new RNG('ciaglosc'), { depth: 2 });
  const path = findPath(L.upPos, L.downPos, (x, y) => L.isWalkable(x, y));
  assert.ok(path && path.length);
  let prev = L.upPos;
  for (const step of path) {
    assert.ok(Math.max(Math.abs(step.x - prev.x), Math.abs(step.y - prev.y)) === 1, 'skok w trasie');
    assert.ok(L.isWalkable(step.x, step.y), 'trasa przez ścianę');
    prev = step;
  }
  assert.deepEqual(prev, L.downPos);
});

test('mapa odległości zgadza się z A* dla losowych celów', () => {
  const L = generateLevel(new RNG('pole-odleglosci'), { depth: 4 });
  const passable = (x, y) => L.isWalkable(x, y);
  const field = distanceField([L.upPos], passable);
  const rng = new RNG('cele');
  for (const t of randomFloors(L, rng, 30)) {
    const d = field.get(`${t.x},${t.y}`);
    const p = findPath(L.upPos, t, passable);
    if (d === undefined) { assert.equal(p, null); continue; }
    assert.equal(p.length, d, `rozjazd BFS vs A* dla ${t.x},${t.y}`);
  }
});

test('KONTROLA PRZYRZĄDU: trasa z nadmiarowym objazdem zostaje wykryta jako nieoptymalna', () => {
  const L = generateLevel(new RNG('kontrola-sciezki'), { depth: 1 });
  const path = findPath(L.upPos, L.downPos, (x, y) => L.isWalkable(x, y));
  const ref = bfsLength(L, L.upPos, L.downPos);
  const zepsuta = [...path, path[path.length - 1]]; // celowo o krok za długa
  assert.equal(path.length, ref);
  assert.notEqual(zepsuta.length, ref, 'porównanie z BFS nie odróżnia trasy dłuższej od optymalnej');
});
