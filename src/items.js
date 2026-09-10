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

// `size` to [szerokość, wysokość] w polach plecaka. Kształt jest częścią
// charakterystyki rzeczy tak samo jak premia do ataku: długi miecz jest lepszy
// od sztyletu i JEDNOCZEŚNIE trudniejszy do upchnięcia - i to jest ta decyzja.
export const WEAPONS = [
  { type: 'dagger', name: 'sztylet', bonus: 1, weight: 20, minDepth: 1, size: [1, 2] },
  { type: 'shortSword', name: 'krótki miecz', bonus: 2, weight: 16, minDepth: 1, size: [1, 3] },
  { type: 'mace', name: 'buzdygan', bonus: 3, weight: 12, minDepth: 2, size: [2, 2] },
  { type: 'longSword', name: 'długi miecz', bonus: 4, weight: 8, minDepth: 4, size: [1, 4] },
  { type: 'warAxe', name: 'topór bojowy', bonus: 6, weight: 5, minDepth: 5, size: [2, 3] },
];

export const ARMORS = [
  { type: 'leather', name: 'kurta skórzana', bonus: 1, weight: 20, minDepth: 1, size: [2, 2] },
  { type: 'studded', name: 'kurta ćwiekowana', bonus: 2, weight: 14, minDepth: 1, size: [2, 2] },
  { type: 'chain', name: 'kolczuga', bonus: 3, weight: 10, minDepth: 3, size: [2, 3] },
  { type: 'plate', name: 'zbroja płytowa', bonus: 5, weight: 5, minDepth: 5, size: [3, 3] },
];

export const FOODS = [
  { type: 'ration', name: 'racja żywnościowa', nutrition: 800, weight: 20, size: [2, 1] },
  { type: 'apple', name: 'jabłko', nutrition: 250, weight: 12, size: [1, 1] },
];

// Większe schowanie na rzeczy - nagroda za schodzenie w głąb. Pojemność jest
// jedyną rzeczą, którą ten przedmiot daje, i daje ją raz: po użyciu znika.
export const PACKS = [
  { type: 'travel', name: 'plecak podróżny', w: 6, h: 4, weight: 10, minDepth: 3, size: [2, 2] },
  { type: 'great', name: 'wielki plecak', w: 6, h: 5, weight: 6, minDepth: 5, size: [2, 3] },
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

export const GLYPHS = { potion: '!', scroll: '?', weapon: ')', armor: '[', food: '%', amulet: '"', pack: '(' };

let nextId = 1;
export function resetItemIds() { nextId = 1; }

function make(kind, def, extra = {}) {
  return { id: nextId++, kind, type: def.type, name: def.name, ...extra };
}

/** Losowy przedmiot odpowiedni dla głębokości. */
export function randomItem(rng, depth) {
  const dostepnePlecaki = PACKS.filter(p => p.minDepth <= depth);
  const kind = rng.weighted([
    ['potion', 32], ['scroll', 22], ['weapon', 14], ['armor', 12], ['food', 20],
    ...(dostepnePlecaki.length ? [['pack', 6]] : []),
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
    case 'pack': {
      const p = rng.weighted(dostepnePlecaki.map(x => [x, x.weight]));
      return make('pack', p, { w: p.w, h: p.h });
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

// ---------- skutek przedmiotu w liczbach ----------
//
// Plecak, który pokazuje same nazwy, zmusza gracza do pamiętania tablic z księgi
// zasad albo do zgadywania. „Kurta ćwiekowana" nic nie mówi o tym, czy jest
// lepsza od noszonej kolczugi - a to jest cała decyzja, którą gracz ma podjąć.
// Dlatego liczby idą tam, gdzie zapada decyzja: obok przedmiotu.
//
// To jest JEDNO źródło opisu dla terminala, wersji jednoosobowej i stołu (D-021):
// żaden interfejs nie przepisuje tych liczb u siebie.

const TABELE_KSZTALTOW = { weapon: WEAPONS, armor: ARMORS, food: FOODS, pack: PACKS };

/** Kształt [szerokość, wysokość] w polach plecaka - z tablicy rodzaju. */
export function ksztaltBazowy(it) {
  const tab = TABELE_KSZTALTOW[it.kind];
  const def = tab && tab.find(x => x.type === it.type);
  return (def && def.size) || [1, 1];
}

/** Moc mikstury z tablicy - nigdy przepisana z pamięci. */
export function potionPower(type) {
  const p = POTIONS.find(x => x.type === type);
  return p ? p.power : 0;
}

/** Premia przedmiotu razem z ostrzeniem/wzmocnieniem ze zwojów. */
export function bonusRazem(it) { return (it.bonus || 0) + (it.enchant || 0); }

const zn = (n) => (n > 0 ? `+${n}` : `${n}`);

/** Odmiana słowa „pole" - napis z błędem gramatycznym czyta się jak usterka. */
export function polaSlowo(n) {
  const a = Math.abs(n), d = a % 10, s = a % 100;
  if (a === 1) return 'pole';
  if (d >= 2 && d <= 4 && !(s >= 12 && s <= 14)) return 'pola';
  return 'pól';
}

const POTION_EFFECT = {
  heal: (p) => `życie ${zn(p)}`,
  greaterHeal: (p) => `życie ${zn(p)}`,
  strength: (p) => `siła ${zn(p)} na stałe`,
  poison: (p) => `życie ${zn(-p)}`,
};

const SCROLL_EFFECT = {
  identify: 'rozpoznaje zawartość plecaka',
  magicMap: 'odkrywa mapę piętra',
  teleport: 'przenosi w losowe miejsce',
  enchantWeapon: 'broń w dłoni: atak +1',
  enchantArmor: 'pancerz na sobie: obrona +1',
};

/**
 * Co przedmiot daje albo zabiera - i co się zmieni, jeśli gracz go założy.
 *
 * `hero` może być prawdziwym bohaterem albo migawką ze stołu; porównanie idzie
 * po `id`, bo migawka niesie KOPIE przedmiotów, nie te same obiekty.
 * `identified` jest granicą uczciwości: nierozpoznana mikstura nie zdradza mocy,
 * bo to jest sekret rozgrywki, a nie brakująca podpowiedź.
 */
export function itemStats(item, hero = null, identified = null) {
  const out = { opis: null, porownanie: null, znak: null, noszone: false, miejsce: null };
  if (!item) return out;
  const [kw, kh] = ksztaltBazowy(item);
  out.miejsce = `${kw}x${kh}`;
  const znane = identified ? identified.has(`${item.kind}:${item.type}`) : true;

  if (item.kind === 'weapon' || item.kind === 'armor') {
    const bron = item.kind === 'weapon';
    const suma = bonusRazem(item);
    out.opis = `${bron ? 'atak' : 'obrona'} ${zn(suma)}`;
    const noszony = hero ? (bron ? hero.weapon : hero.armor) : null;
    out.noszone = !!noszony && noszony.id === item.id;
    if (hero && !out.noszone) {
      const roznica = suma - (noszony ? bonusRazem(noszony) : 0);
      out.znak = roznica > 0 ? 'plus' : roznica < 0 ? 'minus' : 'rowno';
      out.porownanie = roznica > 0 ? `lepsze o ${roznica}`
        : roznica < 0 ? `gorsze o ${-roznica}`
        : 'bez zmiany';
    }
    return out;
  }

  if (item.kind === 'potion') {
    out.opis = znane ? POTION_EFFECT[item.type](potionPower(item.type)) : 'nieznane działanie';
    return out;
  }
  if (item.kind === 'scroll') {
    out.opis = znane ? (SCROLL_EFFECT[item.type] || 'nieznane działanie') : 'nieznane działanie';
    return out;
  }
  if (item.kind === 'food') {
    out.opis = `sytość ${zn(item.nutrition || 0)}`;
    return out;
  }
  if (item.kind === 'amulet') {
    out.opis = 'cel wyprawy - wynieś go schodami z pierwszego piętra';
    return out;
  }
  if (item.kind === 'pack') {
    out.opis = `plecak ${item.w}x${item.h} = ${item.w * item.h} ${polaSlowo(item.w * item.h)}`;
    if (hero && hero.plecak) {
      const teraz = hero.plecak.w * hero.plecak.h;
      const roznica = item.w * item.h - teraz;
      out.znak = roznica > 0 ? 'plus' : roznica < 0 ? 'minus' : 'rowno';
      out.porownanie = roznica > 0 ? `większy o ${roznica} ${polaSlowo(roznica)}`
        : roznica < 0 ? `mniejszy o ${-roznica} ${polaSlowo(roznica)}` : 'tyle samo co Twój';
    }
    return out;
  }
  return out;
}
