// Generator poziomu lochu metodą podziału binarnego (BSP).
//
// Spójność (kryterium 2 spec-a) wynika z konstrukcji: drzewo podziału łączy każde
// rodzeństwo korytarzem, więc pokoje tworzą drzewo rozpinające. "Wynika z konstrukcji"
// jest jednak hipotezą do czasu zmierzenia, więc kontrola po fakcie i tak istnieje
// w testach, na tysiącu poziomów, z niezależnym floodfillem napisanym w teście.

import { bytesToBase64, base64ToBytes } from './bytes.js';

export const WALL = 0;
export const FLOOR = 1;
export const STAIRS_DOWN = 2;
export const STAIRS_UP = 3;

export const GLYPH = { [WALL]: '#', [FLOOR]: '.', [STAIRS_DOWN]: '>', [STAIRS_UP]: '<' };

export class Level {
  constructor(w, h, depth = 1) {
    this.w = w;
    this.h = h;
    this.depth = depth;
    this.tiles = new Uint8Array(w * h); // 0 = WALL, czyli domyślnie lita skała
    this.rooms = [];
    this.upPos = null;
    this.downPos = null;
  }

  idx(x, y) { return y * this.w + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  at(x, y) { return this.inBounds(x, y) ? this.tiles[this.idx(x, y)] : WALL; }
  set(x, y, t) { if (this.inBounds(x, y)) this.tiles[this.idx(x, y)] = t; }

  isWalkable(x, y) { return this.at(x, y) !== WALL; }
  isOpaque(x, y) { return this.at(x, y) === WALL; }

  roomAt(x, y) {
    return this.rooms.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) || null;
  }

  clone() {
    const l = new Level(this.w, this.h, this.depth);
    l.tiles = Uint8Array.from(this.tiles);
    l.rooms = this.rooms.map(r => ({ ...r }));
    l.upPos = this.upPos ? { ...this.upPos } : null;
    l.downPos = this.downPos ? { ...this.downPos } : null;
    return l;
  }

  toJSON() {
    return {
      w: this.w, h: this.h, depth: this.depth,
      tiles: bytesToBase64(this.tiles),
      rooms: this.rooms,
      upPos: this.upPos, downPos: this.downPos,
    };
  }

  static fromJSON(o) {
    const l = new Level(o.w, o.h, o.depth);
    l.tiles = base64ToBytes(o.tiles);
    l.rooms = o.rooms.map(r => ({ ...r }));
    l.upPos = o.upPos;
    l.downPos = o.downPos;
    return l;
  }
}

const MIN_LEAF = 8;  // najmniejszy liść podziału
const MIN_ROOM = 4;  // najmniejszy bok pokoju

/** Rekurencyjny podział prostokąta. Zwraca ten sam węzeł, z dowiązanymi dziećmi. */
function buildTree(rng, node, depth, maxDepth) {
  const canH = node.h >= MIN_LEAF * 2;
  const canV = node.w >= MIN_LEAF * 2;
  if (depth >= maxDepth || (!canH && !canV)) return node;
  if (depth >= 2 && rng.chance(0.10)) return node; // czasem zostaje większa sala

  let horizontal;
  if (canH && canV) horizontal = node.h > node.w ? true : node.w > node.h ? false : rng.chance(0.5);
  else horizontal = canH;

  if (horizontal) {
    const cut = rng.range(MIN_LEAF, node.h - MIN_LEAF);
    node.left = { x: node.x, y: node.y, w: node.w, h: cut };
    node.right = { x: node.x, y: node.y + cut, w: node.w, h: node.h - cut };
  } else {
    const cut = rng.range(MIN_LEAF, node.w - MIN_LEAF);
    node.left = { x: node.x, y: node.y, w: cut, h: node.h };
    node.right = { x: node.x + cut, y: node.y, w: node.w - cut, h: node.h };
  }
  buildTree(rng, node.left, depth + 1, maxDepth);
  buildTree(rng, node.right, depth + 1, maxDepth);
  return node;
}

/** Wycina pokój w liściu i zapamiętuje go na poziomie. Margines 1 chroni obrzeże mapy. */
function carveRoom(rng, level, leaf) {
  const maxW = leaf.w - 2;
  const maxH = leaf.h - 2;
  if (maxW < MIN_ROOM || maxH < MIN_ROOM) return null;
  const rw = rng.range(MIN_ROOM, Math.min(maxW, MIN_ROOM + 8));
  const rh = rng.range(MIN_ROOM, Math.min(maxH, MIN_ROOM + 5));
  const rx = rng.range(leaf.x + 1, leaf.x + leaf.w - rw - 1);
  const ry = rng.range(leaf.y + 1, leaf.y + leaf.h - rh - 1);
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) level.set(x, y, FLOOR);
  }
  const room = { x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1) };
  leaf.room = room;
  level.rooms.push(room);
  return room;
}

/** Korytarz w kształcie litery L między dwoma punktami. */
function carveCorridor(rng, level, a, b) {
  const horizontalFirst = rng.chance(0.5);
  const [x1, y1] = [a.cx ?? a.x, a.cy ?? a.y];
  const [x2, y2] = [b.cx ?? b.x, b.cy ?? b.y];
  const hLine = (y, xa, xb) => {
    for (let x = Math.min(xa, xb); x <= Math.max(xa, xb); x++) {
      if (level.at(x, y) === WALL) level.set(x, y, FLOOR);
    }
  };
  const vLine = (x, ya, yb) => {
    for (let y = Math.min(ya, yb); y <= Math.max(ya, yb); y++) {
      if (level.at(x, y) === WALL) level.set(x, y, FLOOR);
    }
  };
  if (horizontalFirst) { hLine(y1, x1, x2); vLine(x2, y1, y2); }
  else { vLine(x1, y1, y2); hLine(y2, x1, x2); }
}

/** Łączy poddrzewa korytarzami. Zwraca reprezentanta (pokój) poddrzewa. */
function connect(rng, level, node) {
  if (!node.left && !node.right) return node.room || null;
  const a = connect(rng, level, node.left);
  const b = connect(rng, level, node.right);
  if (a && b) { carveCorridor(rng, level, a, b); return rng.chance(0.5) ? a : b; }
  return a || b;
}

function collectLeaves(node, out = []) {
  if (!node.left && !node.right) { out.push(node); return out; }
  collectLeaves(node.left, out);
  collectLeaves(node.right, out);
  return out;
}

/** Spójność: ile pól przechodnich osiągalnych z punktu startu, ile jest wszystkich. */
export function connectivity(level, from) {
  const seen = new Uint8Array(level.w * level.h);
  const stack = [from];
  let reached = 0;
  seen[level.idx(from.x, from.y)] = 1;
  while (stack.length) {
    const p = stack.pop();
    reached++;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = p.x + dx, ny = p.y + dy;
        if (!level.inBounds(nx, ny) || !level.isWalkable(nx, ny)) continue;
        // bez ścinania rogów: ukos wymaga wolnych obu pól ortogonalnych
        if (dx !== 0 && dy !== 0 && (!level.isWalkable(p.x + dx, p.y) || !level.isWalkable(p.x, p.y + dy))) continue;
        const i = level.idx(nx, ny);
        if (seen[i]) continue;
        seen[i] = 1;
        stack.push({ x: nx, y: ny });
      }
    }
  }
  let total = 0;
  for (let y = 0; y < level.h; y++) for (let x = 0; x < level.w; x++) if (level.isWalkable(x, y)) total++;
  return { reached, total, ok: reached === total };
}

const DEFAULT_W = 76;
const DEFAULT_H = 20;

/**
 * Buduje poziom. Zwraca Level ze schodami w górę i w dół.
 * Schody w dół stawiane są w pokoju NAJDALSZYM od wejścia, żeby zejście
 * wymagało przejścia przez loch, a nie dwóch kroków od schodów.
 */
export function generateLevel(rng, opts = {}) {
  const w = opts.w ?? DEFAULT_W;
  const h = opts.h ?? DEFAULT_H;
  const depth = opts.depth ?? 1;
  const level = new Level(w, h, depth);

  const root = buildTree(rng, { x: 0, y: 0, w, h }, 0, opts.maxDepth ?? 5);
  const leaves = collectLeaves(root);
  for (const leaf of leaves) carveRoom(rng, level, leaf);

  if (level.rooms.length === 0) {
    // awaryjnie: jeden pokój na środku, żeby poziom nigdy nie był pusty
    const room = { x: 2, y: 2, w: w - 4, h: h - 4, cx: w >> 1, cy: h >> 1 };
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) level.set(x, y, FLOOR);
    level.rooms.push(room);
  } else {
    connect(rng, level, root);
    // kilka dodatkowych połączeń, żeby loch nie był drzewem bez pętli
    const extra = Math.min(3, Math.max(1, level.rooms.length >> 2));
    for (let i = 0; i < extra; i++) {
      const a = rng.pick(level.rooms), b = rng.pick(level.rooms);
      if (a !== b) carveCorridor(rng, level, a, b);
    }
  }

  const startRoom = level.rooms[0];
  level.upPos = { x: startRoom.cx, y: startRoom.cy };

  let far = startRoom, bestD = -1;
  for (const r of level.rooms) {
    const d = Math.abs(r.cx - startRoom.cx) + Math.abs(r.cy - startRoom.cy);
    if (d > bestD) { bestD = d; far = r; }
  }
  // schody w dół nie mogą stanąć dokładnie na schodach w górę
  let dx = far.cx, dy = far.cy;
  if (dx === level.upPos.x && dy === level.upPos.y) {
    dx = far.x + (far.w > 1 ? 1 : 0);
    dy = far.y;
  }
  level.downPos = { x: dx, y: dy };
  level.set(level.upPos.x, level.upPos.y, STAIRS_UP);
  level.set(level.downPos.x, level.downPos.y, STAIRS_DOWN);

  return level;
}

/** Wypisuje poziom jako tekst - do kontroli okiem i do testów. */
export function levelToString(level) {
  const lines = [];
  for (let y = 0; y < level.h; y++) {
    let s = '';
    for (let x = 0; x < level.w; x++) s += GLYPH[level.at(x, y)];
    lines.push(s);
  }
  return lines.join('\n');
}
