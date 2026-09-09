// Potwory. Siła rośnie z głębokością; na najniższym poziomie stoi przeciwnik ostateczny.

export const KINDS = [
  { type: 'rat',      name: 'szczur',        glyph: 'r', hp: 5,   str: 3,  def: 0, xp: 2,   minD: 1, maxD: 3, weight: 24 },
  { type: 'bat',      name: 'nietoperz',     glyph: 'b', hp: 6,   str: 3,  def: 1, xp: 3,   minD: 1, maxD: 4, weight: 20, erratic: true },
  { type: 'kobold',   name: 'kobold',        glyph: 'k', hp: 9,   str: 4,  def: 1, xp: 5,   minD: 1, maxD: 5, weight: 20 },
  { type: 'goblin',   name: 'goblin',        glyph: 'g', hp: 13,  str: 5,  def: 2, xp: 8,   minD: 2, maxD: 6, weight: 18 },
  { type: 'skeleton', name: 'szkielet',      glyph: 's', hp: 18,  str: 6,  def: 3, xp: 13,  minD: 3, maxD: 7, weight: 15 },
  { type: 'orc',      name: 'ork',           glyph: 'o', hp: 24,  str: 8,  def: 4, xp: 20,  minD: 4, maxD: 8, weight: 14 },
  { type: 'ogre',     name: 'ogr',           glyph: 'O', hp: 36,  str: 13, def: 6, xp: 32,  minD: 5, maxD: 8, weight: 10 },
  { type: 'troll',    name: 'troll',         glyph: 'T', hp: 48,  str: 15, def: 7, xp: 55,  minD: 6, maxD: 8, weight: 8, regen: 1 },
  { type: 'wraith',   name: 'zjawa',         glyph: 'W', hp: 40,  str: 17, def: 8, xp: 70,  minD: 7, maxD: 8, weight: 7 },
];

export const BOSS = {
  type: 'dragon', name: 'Smok Otchłani', glyph: 'D',
  hp: 130, str: 19, def: 10, xp: 400, boss: true,
};

let nextId = 1;
export function resetMonsterIds() { nextId = 1; }

export function spawnMonster(rng, depth, x, y) {
  const pool = KINDS.filter(k => depth >= k.minD && depth <= k.maxD);
  const kind = pool.length ? rng.weighted(pool.map(k => [k, k.weight])) : KINDS[0];
  return newFrom(kind, x, y);
}

export function spawnBoss(x, y) { return newFrom(BOSS, x, y); }

function newFrom(kind, x, y) {
  return {
    id: nextId++,
    type: kind.type, name: kind.name, glyph: kind.glyph,
    x, y,
    hp: kind.hp, maxHp: kind.hp,
    str: kind.str, def: kind.def, xp: kind.xp,
    asleep: true,
    erratic: !!kind.erratic,
    regen: kind.regen || 0,
    boss: !!kind.boss,
  };
}
