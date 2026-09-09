// Szukanie drogi po siatce ośmiokierunkowej.
//
// Koszt każdego kroku wynosi 1, także po skosie, więc dopuszczalną i spójną
// heurystyką jest odległość Czebyszewa. Dzięki temu A* zwraca trasę o długości
// równej najkrótszej możliwej - co sprawdza kryterium 4 spec-a niezależnym
// przeszukiwaniem wszerz, napisanym osobno w pliku testu.
//
// Ścinanie rogów jest zabronione: ruch po skosie wymaga, żeby oba sąsiadujące
// pola ortogonalne były przechodnie. Ta sama reguła obowiązuje w obu algorytmach,
// inaczej porównanie nie miałoby sensu.

export const DIRS = [
  [0, -1], [1, -1], [1, 0], [1, 1],
  [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

/** Sąsiedzi pola z zakazem ścinania rogów. */
export function neighbors(x, y, passable) {
  const out = [];
  for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (!passable(nx, ny)) continue;
    if (dx !== 0 && dy !== 0 && (!passable(x + dx, y) || !passable(x, y + dy))) continue;
    out.push([nx, ny]);
  }
  return out;
}

export function chebyshev(ax, ay, bx, by) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** Kopiec binarny - bez niego A* na większej mapie degeneruje się do przeglądu liniowego. */
class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * A* z punktu start do celu goal.
 * @returns tablica pól [{x,y}, ...] BEZ pola startowego, albo null gdy nie ma drogi.
 */
export function findPath(start, goal, passable, opts = {}) {
  const maxNodes = opts.maxNodes ?? 20000;
  if (start.x === goal.x && start.y === goal.y) return [];
  // cel bywa zajęty (np. stoi na nim potwór) - wtedy i tak chcemy do niego dojść
  const passableOrGoal = (x, y) => passable(x, y) || (x === goal.x && y === goal.y);

  const key = (x, y) => `${x},${y}`;
  const open = new MinHeap();
  const gScore = new Map();
  const cameFrom = new Map();
  const startKey = key(start.x, start.y);
  gScore.set(startKey, 0);
  open.push({ x: start.x, y: start.y, f: chebyshev(start.x, start.y, goal.x, goal.y) });

  const closed = new Set();
  let expanded = 0;

  while (open.size) {
    const cur = open.pop();
    const ck = key(cur.x, cur.y);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (cur.x === goal.x && cur.y === goal.y) {
      const path = [];
      let k = ck;
      while (k !== startKey) {
        const [px, py] = k.split(',').map(Number);
        path.push({ x: px, y: py });
        k = cameFrom.get(k);
        if (k === undefined) return null;
      }
      return path.reverse();
    }
    if (++expanded > maxNodes) return null;

    const g = gScore.get(ck);
    for (const [nx, ny] of neighbors(cur.x, cur.y, passableOrGoal)) {
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const ng = g + 1;
      if (gScore.has(nk) && gScore.get(nk) <= ng) continue;
      gScore.set(nk, ng);
      cameFrom.set(nk, ck);
      open.push({ x: nx, y: ny, f: ng + chebyshev(nx, ny, goal.x, goal.y) });
    }
  }
  return null;
}

/**
 * Mapa odległości od zbioru źródeł (przeszukiwanie wszerz).
 * Używa jej bot do wybierania najbliższego celu bez liczenia trasy do każdego z osobna.
 * @returns Map klucz "x,y" -> odległość
 */
export function distanceField(sources, passable, opts = {}) {
  const limit = opts.limit ?? Infinity;
  const dist = new Map();
  const queue = [];
  for (const s of sources) {
    const k = `${s.x},${s.y}`;
    if (!dist.has(k)) { dist.set(k, 0); queue.push({ x: s.x, y: s.y, d: 0 }); }
  }
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur.d >= limit) continue;
    for (const [nx, ny] of neighbors(cur.x, cur.y, passable)) {
      const nk = `${nx},${ny}`;
      if (dist.has(nk)) continue;
      dist.set(nk, cur.d + 1);
      queue.push({ x: nx, y: ny, d: cur.d + 1 });
    }
  }
  return dist;
}
