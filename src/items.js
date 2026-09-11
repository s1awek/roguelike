// Przedmioty. Mikstury i zwoje mają wygląd losowany per rozgrywka (spec §5),
// więc gracz nie wie, co pije, dopóki nie spróbuje - ale w obrębie jednej
// rozgrywki ten sam wygląd znaczy zawsze to samo.

import { t, getLang, nazwaRodzaju } from './i18n.js';
import { polaSlowo } from './lang/odmiana.js';

export { polaSlowo };

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

/** Zapach w danym języku: `short` albo `full`. */
export function scentText(scentKey, rodzaj = 'short', lang = getLang()) {
  return t(`zapach.${scentKey}.${rodzaj}`, {}, lang);
}

export const POTION_SCENT = {
  heal: 'mild', greaterHeal: 'mild',
  strength: 'sharp', poison: 'sharp',
};

/** Rodzaje mikstur o tym samym zapachu - to jest ta „para", której gracz nie rozróżni. */
export function scentGroup(scentKey) {
  return POTIONS.filter(p => POTION_SCENT[p.type] === scentKey);
}

export const POTION_LOOKS = ['czerwona', 'błękitna', 'zielona', 'perlista', 'mętna', 'bursztynowa', 'srebrzysta', 'czarna'];
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

/**
 * Uzupełnia wyglądy z zapisu o rodzaje, których w chwili zapisu jeszcze nie
 * było. Zapis sprzed dodania zwoju rozpoznania nie zna jego napisu, a gra
 * pokazywała wtedy zwój z napisem „undefined" (zgłoszone przez właściciela
 * 11.09.2026). Nowy rodzaj dostaje pierwszy NIEUŻYTY wygląd z listy, w stałej
 * kolejności - bez losowania, żeby nie ruszać stanu generatora. Zapis pełny
 * wraca bez zmian.
 */
export function uzupelnijWyglady(appearances) {
  const out = { potion: { ...(appearances?.potion || {}) }, scroll: { ...(appearances?.scroll || {}) } };
  const dopelnij = (mapa, rodzaje, wyglady) => {
    const wolne = wyglady.filter(w => !Object.values(mapa).includes(w));
    let i = 0;
    for (const r of rodzaje) {
      if (mapa[r.type]) continue;
      mapa[r.type] = wolne.length ? wolne[i % wolne.length] : wyglady[i % wyglady.length];
      i++;
    }
  };
  dopelnij(out.potion, POTIONS, POTION_LOOKS);
  dopelnij(out.scroll, SCROLLS, SCROLL_LOOKS);
  return out;
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

/**
 * Nazwa rodzaju w języku gracza - bez wyglądu i bez zagadki. Po polsku to pole
 * `name`, więc zapisy sprzed wprowadzenia języków nazywają się tak samo.
 */
export function itemName(item, lang = getLang()) {
  return nazwaRodzaju(`${item.kind}:${item.type}`, item.name, lang);
}

/** Wygląd nierozpoznanej mikstury („czerwona mikstura" / „red potion"). */
export function potionLook(appearance, lang = getLang()) {
  return t('miksturaWyglad', { wyglad: appearance }, lang);
}

/** Nazwa widziana przez gracza - nierozpoznane mikstury i zwoje mają tylko wygląd. */
export function itemLabel(item, appearances, identified, sniffed = null, lang = getLang()) {
  const known = identified.has(`${item.kind}:${item.type}`);
  if (item.kind === 'potion') {
    if (known) return itemName(item, lang);
    const look = potionLook(appearances.potion[item.type], lang);
    // Ślad po powąchaniu wisi przy nazwie, a nie tylko w dzienniku. Wiedza, którą
    // gracz musi pamiętać albo notować na kartce, jest wiedzą tylko z nazwy.
    if (sniffed && sniffed.has(`potion:${item.type}`)) {
      return t('miksturaZapach', { nazwa: look, zapach: scentText(POTION_SCENT[item.type], 'short', lang) }, lang);
    }
    return look;
  }
  if (item.kind === 'scroll') {
    return known ? itemName(item, lang) : t('zwojNapis', { napis: appearances.scroll[item.type] }, lang);
  }
  if (item.kind === 'weapon' || item.kind === 'armor') {
    const e = item.enchant || 0;
    const sign = e > 0 ? `+${e}` : e < 0 ? `${e}` : '';
    const name = itemName(item, lang);
    return sign ? `${name} ${sign}` : name;
  }
  return itemName(item, lang);
}

/**
 * Etykieta, po której łączą się stosy. ZAWSZE po polsku, niezależnie od języka
 * gracza: stos jest stanem gry i nie może zależeć od tego, jak ktoś ją czyta.
 * Zbiór rzeczy nierozróżnialnych jest w obu językach ten sam (każdy język ma
 * osobne słowo na każdy rodzaj i wygląd), ale ta równość byłaby twierdzeniem
 * o słowniku - a klucz stały jest gwarancją.
 */
export function stackLabel(item, appearances, identified, sniffed = null) {
  return itemLabel(item, appearances, identified, sniffed, 'pl');
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

const POTION_EFFECT = {
  heal: (p, lang) => t('st.zycie', { v: zn(p) }, lang),
  greaterHeal: (p, lang) => t('st.zycie', { v: zn(p) }, lang),
  strength: (p, lang) => t('st.silaStale', { v: zn(p) }, lang),
  poison: (p, lang) => t('st.zycie', { v: zn(-p) }, lang),
};

/**
 * Co przedmiot daje albo zabiera - i co się zmieni, jeśli gracz go założy.
 *
 * `hero` może być prawdziwym bohaterem albo migawką ze stołu; porównanie idzie
 * po `id`, bo migawka niesie KOPIE przedmiotów, nie te same obiekty.
 * `identified` jest granicą uczciwości: nierozpoznana mikstura nie zdradza mocy,
 * bo to jest sekret rozgrywki, a nie brakująca podpowiedź.
 */
export function itemStats(item, hero = null, identified = null, lang = getLang()) {
  const out = { opis: null, porownanie: null, znak: null, noszone: false, miejsce: null };
  if (!item) return out;
  const [kw, kh] = ksztaltBazowy(item);
  out.miejsce = `${kw}x${kh}`;
  const znane = identified ? identified.has(`${item.kind}:${item.type}`) : true;

  if (item.kind === 'weapon' || item.kind === 'armor') {
    const bron = item.kind === 'weapon';
    const suma = bonusRazem(item);
    out.opis = t(bron ? 'st.atak' : 'st.obrona', { v: zn(suma) }, lang);
    const noszony = hero ? (bron ? hero.weapon : hero.armor) : null;
    out.noszone = !!noszony && noszony.id === item.id;
    if (hero && !out.noszone) {
      const roznica = suma - (noszony ? bonusRazem(noszony) : 0);
      out.znak = roznica > 0 ? 'plus' : roznica < 0 ? 'minus' : 'rowno';
      out.porownanie = roznica > 0 ? t('st.lepsze', { n: roznica }, lang)
        : roznica < 0 ? t('st.gorsze', { n: -roznica }, lang)
        : t('st.bezZmiany', {}, lang);
    }
    return out;
  }

  if (item.kind === 'potion') {
    out.opis = znane ? POTION_EFFECT[item.type](potionPower(item.type), lang) : t('st.nieznane', {}, lang);
    return out;
  }
  if (item.kind === 'scroll') {
    out.opis = t(znane && SCROLLS.some(x => x.type === item.type) ? `st.zwoj.${item.type}` : 'st.nieznane', {}, lang);
    return out;
  }
  if (item.kind === 'food') {
    out.opis = t('st.sytosc', { v: zn(item.nutrition || 0) }, lang);
    return out;
  }
  if (item.kind === 'amulet') {
    out.opis = t('st.amulet', {}, lang);
    return out;
  }
  if (item.kind === 'pack') {
    out.opis = t('st.plecak', { w: item.w, h: item.h, n: item.w * item.h }, lang);
    if (hero && hero.plecak) {
      const teraz = hero.plecak.w * hero.plecak.h;
      const roznica = item.w * item.h - teraz;
      out.znak = roznica > 0 ? 'plus' : roznica < 0 ? 'minus' : 'rowno';
      out.porownanie = roznica > 0 ? t('st.wiekszy', { n: roznica }, lang)
        : roznica < 0 ? t('st.mniejszy', { n: -roznica }, lang) : t('st.tyleSamo', {}, lang);
    }
    return out;
  }
  return out;
}
