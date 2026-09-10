// Przedmioty. Mikstury i zwoje mają wygląd losowany per rozgrywka (spec §5),
// więc gracz nie wie, co pije, dopóki nie spróbuje - ale w obrębie jednej
// rozgrywki ten sam wygląd znaczy zawsze to samo.

export const POTIONS = [
  { type: 'heal', name: 'mikstura leczenia', power: 12, weight: 20 },
  { type: 'greaterHeal', name: 'mikstura pełni sił', power: 30, weight: 10 },
  { type: 'strength', name: 'mikstura siły', power: 1, weight: 8 },
  { type: 'poison', name: 'mikstura trucizny', power: 8, weight: 8 },
];

export const SCROLLS = [
  { type: 'identify', name: 'zwój rozpoznania', weight: 10 },
  { type: 'magicMap', name: 'zwój odkrycia', weight: 10 },
  { type: 'teleport', name: 'zwój przeniesienia', weight: 12 },
  { type: 'enchantWeapon', name: 'zwój ostrzenia', weight: 8 },
  { type: 'enchantArmor', name: 'zwój wzmocnienia', weight: 8 },
];

export const WEAPONS = [
  { type: 'dagger', name: 'sztylet', bonus: 1, weight: 20, minDepth: 1 },
  { type: 'shortSword', name: 'krótki miecz', bonus: 2, weight: 16, minDepth: 1 },
  { type: 'mace', name: 'buzdygan', bonus: 3, weight: 12, minDepth: 2 },
  { type: 'longSword', name: 'długi miecz', bonus: 4, weight: 8, minDepth: 4 },
  { type: 'warAxe', name: 'topór bojowy', bonus: 6, weight: 5, minDepth: 5 },
];

export const ARMORS = [
  { type: 'leather', name: 'kurta skórzana', bonus: 1, weight: 20, minDepth: 1 },
  { type: 'studded', name: 'kurta ćwiekowana', bonus: 2, weight: 14, minDepth: 1 },
  { type: 'chain', name: 'kolczuga', bonus: 3, weight: 10, minDepth: 3 },
  { type: 'plate', name: 'zbroja płytowa', bonus: 5, weight: 5, minDepth: 5 },
];

export const FOODS = [
  { type: 'ration', name: 'racja żywnościowa', nutrition: 800, weight: 20 },
  { type: 'apple', name: 'jabłko', nutrition: 250, weight: 12 },
];

/**
 * Zapach mikstury. Dzieli cztery rodzaje na DWIE PARY i nigdy nie wskazuje
 * jednego rodzaju samodzielnie - to jest cała istota tej podpowiedzi.
 *
 * Podział idzie po skutku, nie po nazwie: „łagodny" to wyłącznie mikstury
 * korzystne, „ostry" to siła ALBO trucizna. Powąchanie odpowiada więc na
 * pytanie „czy to mnie zaboli", ale nie na pytanie „co to dokładnie jest".
 * Gdyby każdy rodzaj miał własny zapach, wąchanie byłoby darmowym rozpoznaniem
 * i mikstury przestałyby być decyzją.
 */
export const SCENTS = {
  mild:  { key: 'mild',  short: 'łagodny', full: 'łagodny i słodkawy, jak nagrzane zioła' },
  sharp: { key: 'sharp', short: 'ostry',   full: 'ostry, drapie w gardle' },
};

export const POTION_SCENT = {
  heal: 'mild', greaterHeal: 'mild',
  strength: 'sharp', poison: 'sharp',
};

/** Rodzaje mikstur o tym samym zapachu - to jest ta „para", której gracz nie rozróżni. */
export function scentGroup(scentKey) {
  return POTIONS.filter(p => POTION_SCENT[p.type] === scentKey);
}

const POTION_LOOKS = ['czerwona', 'błękitna', 'zielona', 'perlista', 'mętna', 'bursztynowa', 'srebrzysta', 'czarna'];
const SCROLL_LOOKS = ['ZELGO MER', 'VE FORBRYDERNE', 'HACKEM MUCHE', 'PRIRUTSENIE', 'ELBIB YLOH', 'ANDOVA BEGARIN'];

/** Losuje wygląd mikstur i zwojów na całą rozgrywkę. */
export function makeAppearances(rng) {
  const pl = rng.shuffle([...POTION_LOOKS]);
  const sl = rng.shuffle([...SCROLL_LOOKS]);
  const potion = {}, scroll = {};
  POTIONS.forEach((p, i) => { potion[p.type] = pl[i % pl.length]; });
  SCROLLS.forEach((s, i) => { scroll[s.type] = sl[i % sl.length]; });
  return { potion, scroll };
}

export const GLYPHS = { potion: '!', scroll: '?', weapon: ')', armor: '[', food: '%', amulet: '"' };

let nextId = 1;
export function resetItemIds() { nextId = 1; }

function make(kind, def, extra = {}) {
  return { id: nextId++, kind, type: def.type, name: def.name, ...extra };
}

/** Losowy przedmiot odpowiedni dla głębokości. */
export function randomItem(rng, depth) {
  const kind = rng.weighted([
    ['potion', 32], ['scroll', 22], ['weapon', 14], ['armor', 12], ['food', 20],
  ]);
  switch (kind) {
    case 'potion': return make('potion', rng.weighted(POTIONS.map(p => [p, p.weight])));
    case 'scroll': return make('scroll', rng.weighted(SCROLLS.map(s => [s, s.weight])));
    case 'weapon': {
      const pool = WEAPONS.filter(w => w.minDepth <= depth);
      const w = rng.weighted(pool.map(x => [x, x.weight]));
      return make('weapon', w, { bonus: w.bonus, enchant: 0 });
    }
    case 'armor': {
      const pool = ARMORS.filter(a => a.minDepth <= depth);
      const a = rng.weighted(pool.map(x => [x, x.weight]));
      return make('armor', a, { bonus: a.bonus, enchant: 0 });
    }
    default: {
      const f = rng.weighted(FOODS.map(x => [x, x.weight]));
      return make('food', f, { nutrition: f.nutrition });
    }
  }
}

export function makeAmulet() {
  return { id: nextId++, kind: 'amulet', type: 'amulet', name: 'Amulet Otchłani' };
}

/** Nazwa widziana przez gracza - nierozpoznane mikstury i zwoje mają tylko wygląd. */
export function itemLabel(item, appearances, identified, sniffed = null) {
  const known = identified.has(`${item.kind}:${item.type}`);
  if (item.kind === 'potion') {
    if (known) return item.name;
    const look = `${appearances.potion[item.type]} mikstura`;
    // Ślad po powąchaniu wisi przy nazwie, a nie tylko w dzienniku. Wiedza, którą
    // gracz musi pamiętać albo notować na kartce, jest wiedzą tylko z nazwy.
    if (sniffed && sniffed.has(`potion:${item.type}`)) {
      return `${look} (zapach ${SCENTS[POTION_SCENT[item.type]].short})`;
    }
    return look;
  }
  if (item.kind === 'scroll') {
    return known ? item.name : `zwój z napisem "${appearances.scroll[item.type]}"`;
  }
  if (item.kind === 'weapon' || item.kind === 'armor') {
    const e = item.enchant || 0;
    const sign = e > 0 ? `+${e}` : e < 0 ? `${e}` : '';
    return sign ? `${item.name} ${sign}` : item.name;
  }
  return item.name;
}

export function itemGlyph(item) { return GLYPHS[item.kind] || '*'; }
