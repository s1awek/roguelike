// Języki (D-051): kompletność słowników, brak polskich znaków w wersji
// angielskiej, zgodność księgi zasad i niezmienność rozgrywki.
//
// Każde sprawdzenie jest funkcją, którą da się puścić na słowniku celowo
// zepsutym - kontrola, która nigdy niczego nie zgłosiła, jest nieodróżnialna
// od zepsutej.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLOWNIKI, setLang, t } from '../src/i18n.js';
import { NAZWY_EN, WYGLADY_EN } from '../src/lang/en.js';
import { POTIONS, SCROLLS, WEAPONS, ARMORS, FOODS, PACKS, POTION_LOOKS, itemLabel } from '../src/items.js';
import { KINDS, BOSS } from '../src/monsters.js';
import { buildRules } from '../src/rules.js';
import { Game } from '../src/game.js';
import { playOut } from '../src/bot.js';
import * as R from '../src/render.js';
import { stanyBohatera } from '../src/stany.js';
import { opisPrzyczyny } from '../src/przyczyny.js';

const POLSKIE = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

/** Klucze obecne w jednym słowniku, a brakujące w drugim. */
export function brakiKluczy(a, b) {
  return {
    brakWB: Object.keys(a).filter(k => !(k in b)),
    brakWA: Object.keys(b).filter(k => !(k in a)),
  };
}

/**
 * Parametry próbne: każdy odczyt zwraca napis, a `nazwy` - listę. Dzięki temu
 * każdy wpis-funkcja da się wywołać bez znajomości jego parametrów.
 */
const PROBNE = new Proxy({}, { get: (_, k) => (k === 'nazwy' ? ['x', 'y'] : k === 'zaDuzo' ? true : 'x') });

/** Wpisy słownika, których tekst zawiera polską literę. */
export function polskieWpisy(slownik) {
  const zle = [];
  for (const [k, v] of Object.entries(slownik)) {
    const tekst = typeof v === 'function' ? v(PROBNE) : v;
    if (POLSKIE.test(tekst)) zle.push(`${k}: ${tekst}`);
  }
  return zle;
}

/** Liczby z bloku księgi - w obu językach mają być te same, w tej samej liczbie. */
function liczbyBloku(b) {
  const tekst = b.t === 'table' ? [...b.head, ...b.rows.flat()].join(' ') : b.text;
  return (String(tekst).match(/\d+/g) || []).sort();
}

/** Rozjazdy budowy dwóch ksiąg: rozdziały, rodzaje bloków, wiersze tabel, liczby. */
export function rozjazdyKsiag(a, b) {
  const out = [];
  if (a.map(s => s.id).join() !== b.map(s => s.id).join()) out.push('inne rozdziały');
  a.forEach((sa, i) => {
    const sb = b[i];
    if (!sb) return;
    if (sa.blocks.length !== sb.blocks.length) { out.push(`${sa.id}: liczba bloków`); return; }
    sa.blocks.forEach((ba, j) => {
      const bb = sb.blocks[j];
      if (ba.t !== bb.t) out.push(`${sa.id}[${j}]: rodzaj bloku`);
      if (ba.t === 'table' && (ba.rows.length !== bb.rows.length || ba.head.length !== bb.head.length)) {
        out.push(`${sa.id}[${j}]: kształt tabeli`);
      }
      if (liczbyBloku(ba).join() !== liczbyBloku(bb).join()) {
        out.push(`${sa.id}[${j}]: liczby ${liczbyBloku(ba).join(',')} != ${liczbyBloku(bb).join(',')}`);
      }
    });
  });
  return out;
}

// ---------- słowniki ----------

test('oba słowniki mają te same klucze', () => {
  const { brakWB, brakWA } = brakiKluczy(SLOWNIKI.pl, SLOWNIKI.en);
  assert.deepEqual(brakWB, [], `brak w angielskim: ${brakWB.join(', ')}`);
  assert.deepEqual(brakWA, [], `brak w polskim: ${brakWA.join(', ')}`);
});

test('słownik angielski nie zawiera polskich liter', () => {
  assert.deepEqual(polskieWpisy(SLOWNIKI.en), []);
});

test('KONTROLA PRZYRZĄDU: zepsuty słownik jest wykrywany - brak klucza i polska litera', () => {
  const zepsuty = { ...SLOWNIKI.en };
  delete zepsuty['podnies.nic'];
  zepsuty['pada'] = (p) => `${p.kto} pada.`;          // polskie słowo bez ogonka - tego NIE złapie
  zepsuty['awans'] = 'Awansujesz na poziom!';          // też bez ogonka
  zepsuty['zwoj.mapa'] = 'Mapa lochu rozjaśnia się.';  // z ogonkiem - to złapie
  assert.deepEqual(brakiKluczy(SLOWNIKI.pl, zepsuty).brakWB, ['podnies.nic']);
  assert.deepEqual(polskieWpisy(zepsuty).map(s => s.split(':')[0]), ['zwoj.mapa']);
});

test('każdy rodzaj rzeczy, każdy potwór i każdy wygląd mikstury ma nazwę angielską', () => {
  const rzeczy = [
    ...POTIONS.map(x => `potion:${x.type}`), ...SCROLLS.map(x => `scroll:${x.type}`),
    ...WEAPONS.map(x => `weapon:${x.type}`), ...ARMORS.map(x => `armor:${x.type}`),
    ...FOODS.map(x => `food:${x.type}`), ...PACKS.map(x => `pack:${x.type}`),
    'amulet:amulet', ...KINDS.map(k => `monster:${k.type}`), `monster:${BOSS.type}`,
  ];
  const brak = rzeczy.filter(k => !NAZWY_EN[k]);
  assert.deepEqual(brak, []);
  assert.deepEqual(POTION_LOOKS.filter(w => !WYGLADY_EN[w]), []);
  for (const v of [...Object.values(NAZWY_EN), ...Object.values(WYGLADY_EN)]) {
    assert.ok(!POLSKIE.test(v), `polska litera w nazwie: ${v}`);
  }
});

// ---------- księga zasad ----------

test('księga angielska: te same rozdziały, bloki, tabele i LICZBY co polska', () => {
  for (const gdzie of ['doc', 'web', 'term']) {
    assert.deepEqual(rozjazdyKsiag(buildRules(gdzie, 'pl'), buildRules(gdzie, 'en')), [], gdzie);
  }
});

test('księga angielska nie zawiera polskich liter', () => {
  for (const gdzie of ['doc', 'web', 'term']) {
    const tekst = JSON.stringify(buildRules(gdzie, 'en'));
    const m = tekst.match(new RegExp(`.{0,40}${POLSKIE.source}.{0,40}`));
    assert.equal(m, null, `${gdzie}: ${m && m[0]}`);
  }
});

test('KONTROLA PRZYRZĄDU: rozjazd liczby w księdze jest wykrywany', () => {
  const pl = buildRules('doc', 'pl');
  const en = JSON.parse(JSON.stringify(buildRules('doc', 'en')));
  en.find(s => s.id === 'glod').blocks[0].text = en.find(s => s.id === 'glod').blocks[0].text.replace(/\d+/, '999');
  assert.equal(rozjazdyKsiag(pl, en).length, 1);
  assert.match(rozjazdyKsiag(pl, en)[0], /^glod\[0\]: liczby/);
});

// ---------- rozgrywka ----------

/** Cały tekst partii: dziennik w chwili doręczenia, ekrany, obejrzenia, stany. */
function tekstPartii(seed, lang) {
  setLang(lang);
  const zapis = [];
  const g = new Game(seed, { lang });
  const stary = g.tell.bind(g);
  g.tell = (hero, ...r) => { stary(hero, ...r); if (hero) zapis.push(hero.messages.at(-1).text); };
  playOut(g);
  const ekrany = [R.renderFrame(g, 'map'), R.renderFrame(g, 'inventory'), R.renderFrame(g, 'obejrzyj'),
    R.renderFrame(g, 'stos', '', 0, new Set()), R.renderGameOver(g)];
  for (let i = 0; i < R.RULE_COUNT; i++) ekrany.push(R.renderRules(i).join('\n'));
  const oceny = g.player.inventory.map(it => {
    const o = g.obejrzyj(it);
    return [o.opis, o.porownanie, o.werdykt, itemLabel(it, g.appearances, g.identified, g.sniffed, lang)].join('|');
  });
  const stany = stanyBohatera(g.player, lang).map(s => `${s.nazwa} ${s.etykieta}`);
  setLang('en');
  return { g, n: zapis.length, tekst: [...zapis, ...ekrany, ...oceny, ...stany, opisPrzyczyny(g.cause, lang)].join('\n') };
}

test('partia angielska: ani jednej polskiej litery w dzienniku, ekranach i opisach', () => {
  for (let i = 0; i < 6; i++) {
    const { tekst } = tekstPartii(`jezyk-${i}`, 'en');
    const m = tekst.match(new RegExp(`.{0,50}${POLSKIE.source}.{0,30}`));
    assert.equal(m, null, `jezyk-${i}: ${m && m[0]}`);
  }
});

test('KONTROLA PRZYRZĄDU: ta sama partia po polsku ma polskie litery (przyrząd widzi tekst)', () => {
  assert.match(tekstPartii('jezyk-0', 'pl').tekst, POLSKIE);
});

test('rozgrywka nie zależy od języka: te same tury, wynik i liczba komunikatów', () => {
  for (let i = 0; i < 6; i++) {
    const a = tekstPartii(`jezyk-${i}`, 'pl'), b = tekstPartii(`jezyk-${i}`, 'en');
    assert.equal(a.g.turn, b.g.turn);
    assert.equal(a.g.status, b.g.status);
    assert.equal(a.g.cause, b.g.cause, 'przyczyna w stanie gry jest identyfikatorem, nie tekstem');
    assert.deepEqual(a.g.rng.getState(), b.g.rng.getState());
    assert.equal(a.n, b.n, `seed jezyk-${i}: liczba komunikatów`);
  }
});

test('przyczyna końca jest tłumaczona przy pokazaniu, stan zostaje polskim identyfikatorem', () => {
  assert.equal(opisPrzyczyny('głód', 'en'), 'starvation');
  assert.equal(opisPrzyczyny('zabity przez: szczur', 'en'), 'killed by a rat');
  assert.equal(opisPrzyczyny('zabity przez: ork', 'en'), 'killed by an orc');
  assert.equal(opisPrzyczyny(`zabity przez: ${BOSS.name}`, 'en'), 'killed by the Dragon of the Abyss');
  assert.equal(opisPrzyczyny('zabity przez: Halina', 'en'), 'killed by Halina');
  assert.equal(opisPrzyczyny('zabity przez: szczur', 'pl'), 'zabity przez: szczur');
});

test('stos łączy się tak samo w obu językach - klucz stosu nie zależy od języka', () => {
  const liczby = {};
  for (const lang of ['pl', 'en']) {
    setLang(lang);
    const g = new Game('stos-jezyk', { lang });
    playOut(g, { maxTurns: 3000 });
    liczby[lang] = g.player.inventory.map(i => `${i.kind}:${i.type}:${i.ile || 1}`).join();
  }
  setLang('en');
  assert.equal(liczby.pl, liczby.en);
});

test('nieznany klucz wraca jako klucz - brak tłumaczenia nie chowa się pod drugim językiem', () => {
  assert.equal(t('nie.ma.takiego', {}, 'en'), 'nie.ma.takiego');
});

// ---------- stół: język jest cechą uczestnika ----------

/**
 * Dwóch uczestników okłada się nawzajem, aż jeden przegra starcie. Zwraca
 * dzienniki obu. Te same ziarno i te same ciosy - zmienia się tylko język.
 */
function potyczka(jezykA, jezykB) {
  const g = new Game('stol-jezyk', { name: 'Halina', w: 60, h: 20 });
  const a = g.player;
  const b = g.addHero('Bob', 1, { scatter: false });
  a.lang = jezykA; b.lang = jezykB;
  b.x = a.x; b.y = a.y;
  for (let i = 0; i < 60 && a.status === 'playing' && b.status === 'playing' && !a.przegrana && !b.przegrana; i++) {
    g.attack(i % 2 ? b : a, i % 2 ? a : b);
  }
  return { a: a.messages.map(m => m.text), b: b.messages.map(m => m.text) };
}

test('stół: każdy uczestnik czyta potyczkę we własnym języku, a język jednego nie rusza drugiego', () => {
  const mieszany = potyczka('pl', 'en');
  const obaPl = potyczka('pl', 'pl');
  const obaEn = potyczka('en', 'en');
  assert.ok(mieszany.a.length > 3 && mieszany.b.length > 3, 'przyrząd: potyczka musi coś wyprodukować po obu stronach');
  // C-2: dziennik A nie zależy od języka B, i odwrotnie
  assert.deepEqual(mieszany.a, obaPl.a);
  assert.deepEqual(mieszany.b, obaEn.b);
  // C-1: to naprawdę dwa języki, nie ten sam tekst dwa razy
  assert.notDeepEqual(mieszany.a, obaEn.a);
  assert.equal(mieszany.b.join('\n').match(POLSKIE), null, mieszany.b.join(' | '));
});

test('stół: odmowa niesie kod i zdanie w języku uczestnika', async () => {
  const { Stol } = await import('../src/stol.js');
  const g = new Game('stol-odmowa', { name: 'Halina', w: 60, h: 20 });
  const s = new Stol(g);
  const { hero } = s.dosiadz('Bob', { rodzaj: 'czlowiek' });
  hero.status = 'dead';
  hero.lang = 'en';
  const r = s.zadeklaruj(g.heroes.indexOf(hero), { type: 'wait' });
  assert.equal(r.ok, false);
  assert.equal(r.kod, 'stol.skonczona');
  assert.equal(r.powod, t('stol.skonczona', {}, 'en'));
  hero.lang = 'pl';
  assert.equal(s.zadeklaruj(g.heroes.indexOf(hero), { type: 'wait' }).powod, 'partia tego uczestnika skończona');
});
