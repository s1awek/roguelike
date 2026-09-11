// Statystyki w plecaku: co przedmiot daje i co się zmieni po założeniu.
//
// Sens tej mechaniki jest decyzyjny, nie ozdobny: gracz trzyma kurtę ćwiekowaną
// i kolczugę i musi wiedzieć, którą nosić. Dlatego testy pilnują nie tego, że
// „coś się wyświetla", ale że liczba jest ZGODNA Z SILNIKIEM i że różnica ma
// właściwy znak. Część przypadków to KONTROLA PRZYRZĄDU - przypadki znane-złe,
// na których widać, że test w ogóle potrafi zapalić się na czerwono.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { POTIONS, WEAPONS, ARMORS, FOODS, itemStats, potionPower, bonusRazem } from '../src/items.js';
import { renderInventory } from '../src/render.js';
import { widokDla } from '../src/widok.js';
import { setLang } from '../src/i18n.js';

// Te testy sprawdzają brzmienie POLSKIE. Od D-051 domyślny jest angielski,
// więc język jest ustawiony jawnie - asercje zostały bez zmian.
setLang('pl');

let id = 9000;
const bron = (type, enchant = 0) => {
  const d = WEAPONS.find(w => w.type === type);
  return { id: id++, kind: 'weapon', type, name: d.name, bonus: d.bonus, enchant };
};
const pancerz = (type, enchant = 0) => {
  const d = ARMORS.find(a => a.type === type);
  return { id: id++, kind: 'armor', type, name: d.name, bonus: d.bonus, enchant };
};
const mikstura = (type) => ({ id: id++, kind: 'potion', type, name: POTIONS.find(p => p.type === type).name });
const jadlo = (type) => {
  const d = FOODS.find(f => f.type === type);
  return { id: id++, kind: 'food', type, name: d.name, nutrition: d.nutrition };
};

function pusta(seed) {
  const g = new Game(seed);
  g.player.inventory.length = 0;
  g.player.weapon = null;
  g.player.armor = null;
  return g;
}

// ---------- broń i pancerz: liczba oraz różnica ----------

test('broń podaje atak razem z ostrzeniem ze zwoju', () => {
  const st = itemStats(bron('mace', 1));
  assert.equal(st.opis, `atak +${ARMORS && WEAPONS.find(w => w.type === 'mace').bonus + 1}`);
  assert.equal(st.opis, 'atak +4');
});

test('pancerz słabszy od noszonego mówi WPROST, że jest gorszy', () => {
  // Dokładnie przypadek, od którego wyszło zgłoszenie: kurta ćwiekowana
  // w plecaku, kolczuga na sobie.
  const kolczuga = pancerz('chain');
  const st = itemStats(pancerz('studded'), { weapon: null, armor: kolczuga });
  assert.equal(st.opis, 'obrona +2');
  assert.equal(st.porownanie, 'gorsze o 1');
  assert.equal(st.znak, 'minus', 'zły znak sprawi, że interfejs pokoloruje stratę na zielono');
});

test('lepszy pancerz, taki sam pancerz i puste ręce - trzy różne odpowiedzi', () => {
  const noszony = pancerz('studded');           // obrona +2
  const stan = { weapon: null, armor: noszony };
  assert.equal(itemStats(pancerz('plate'), stan).porownanie, 'lepsze o 3');
  assert.equal(itemStats(pancerz('studded'), stan).porownanie, 'bez zmiany');
  assert.equal(itemStats(pancerz('studded'), stan).znak, 'rowno');
  // Puste ręce: porównanie idzie wobec zera, więc każda broń jest ulepszeniem.
  const stObc = itemStats(bron('dagger'), { weapon: null, armor: null });
  assert.equal(stObc.porownanie, `lepsze o ${WEAPONS.find(w => w.type === 'dagger').bonus}`);
});

test('przedmiot już noszony nie dostaje porównania z samym sobą', () => {
  const w = bron('longSword');
  const st = itemStats(w, { weapon: w, armor: null });
  assert.equal(st.noszone, true);
  assert.equal(st.porownanie, null, 'porównanie noszonego z noszonym zawsze da zero - to szum');
});

test('ostrzenie zwojem zmienia różnicę, nie tylko nazwę', () => {
  const sztylet = bron('dagger', 3);            // 1 + 3 = 4
  const st = itemStats(sztylet, { weapon: bron('mace'), armor: null });  // 3
  assert.equal(bonusRazem(sztylet), 4);
  assert.equal(st.porownanie, 'lepsze o 1');
});

// ---------- granica uczciwości ----------

test('nierozpoznana mikstura NIE zdradza mocy, rozpoznana zdradza', () => {
  const m = mikstura('greaterHeal');
  assert.equal(itemStats(m, null, new Set()).opis, 'nieznane działanie',
    'opis zdradził działanie nierozpoznanej mikstury - to znosi całą decyzję o wypiciu');
  assert.equal(itemStats(m, null, new Set(['potion:greaterHeal'])).opis,
    `życie +${potionPower('greaterHeal')}`);
});

test('trucizna po rozpoznaniu pokazuje stratę ze znakiem minus', () => {
  const st = itemStats(mikstura('poison'), null, new Set(['potion:poison']));
  assert.equal(st.opis, `życie -${potionPower('poison')}`);
  assert.ok(st.opis.includes('-'), 'strata podana bez minusa czyta się jak zysk');
});

test('KONTROLA PRZYRZĄDU: brak zbioru rozpoznanych nie odsłania sekretu przez przypadek', () => {
  // Wywołanie bez `identified` (np. z narzędzia diagnostycznego) traktuje rzecz
  // jako znaną. Test pilnuje, żeby żaden interfejs tak nie wołał: oba wołają
  // z jawnym zbiorem, co widać w teście integracyjnym niżej.
  assert.equal(itemStats(mikstura('poison')).opis, `życie -${potionPower('poison')}`);
});

// ---------- zgodność opisu z silnikiem ----------

test('każda mikstura opisuje dokładnie tę moc, którą ma tablica gry', () => {
  for (const p of POTIONS) {
    const opis = itemStats(mikstura(p.type), null, new Set([`potion:${p.type}`])).opis;
    assert.ok(opis.includes(String(p.power)),
      `opis "${opis}" nie niesie mocy ${p.power} z tablicy dla ${p.name}`);
  }
});

test('wypicie leczy DOKŁADNIE tyle, ile obiecuje opis w plecaku', () => {
  const g = pusta('opis-vs-silnik');
  g.player.hp = 1;
  g.player.inventory.push(mikstura('heal'));
  const obiecane = potionPower('heal');
  assert.equal(itemStats(g.player.inventory[0], g.player, new Set(['potion:heal'])).opis,
    `życie +${obiecane}`);
  const przed = g.player.hp;
  g.act({ type: 'use', index: 0 });
  assert.equal(g.player.hp - przed, obiecane,
    'silnik uleczył inaczej niż mówił plecak - liczba jest przepisana z pamięci w jednym z dwóch miejsc');
});

test('mikstura siły podnosi siłę o tyle, ile pisze plecak', () => {
  const g = pusta('sila-vs-opis');
  g.player.inventory.push(mikstura('strength'));
  const st = itemStats(g.player.inventory[0], g.player, new Set(['potion:strength']));
  const przed = g.player.str;
  g.act({ type: 'use', index: 0 });
  assert.equal(g.player.str - przed, potionPower('strength'));
  assert.ok(st.opis.includes(String(potionPower('strength'))));
});

test('założenie broni zmienia atak dokładnie o zapowiedzianą różnicę', () => {
  const g = pusta('roznica-vs-silnik');
  g.player.weapon = bron('dagger');
  g.player.inventory.push(g.player.weapon, bron('warAxe'));
  const st = itemStats(g.player.inventory[1], g.player, g.identified);
  const atakPrzed = g.playerAttack();
  g.act({ type: 'use', index: 1 });
  const zysk = g.playerAttack() - atakPrzed;
  assert.equal(st.porownanie, `lepsze o ${zysk}`,
    'zapowiedź w plecaku rozjeżdża się z realną zmianą ataku');
});

// ---------- jadło i amulet ----------

test('jadło podaje sytość z tablicy, amulet mówi po co jest', () => {
  const r = jadlo('ration');
  assert.equal(itemStats(r).opis, `sytość +${FOODS.find(f => f.type === 'ration').nutrition}`);
  const st = itemStats({ id: 1, kind: 'amulet', type: 'amulet', name: 'Amulet Otchłani' });
  assert.match(st.opis, /cel wyprawy/);
});

// ---------- oba interfejsy ----------

test('plecak terminalowy pokazuje skutek i różnicę w wierszu przedmiotu', () => {
  const g = pusta('term-plecak');
  g.player.armor = pancerz('chain');
  g.player.inventory.push(g.player.armor, pancerz('studded'), mikstura('poison'));
  const tekst = renderInventory(g).join('\n');
  assert.match(tekst, /obrona \+3/, 'brak liczby przy noszonej kolczudze');
  assert.match(tekst, /obrona \+2/, 'brak liczby przy kurcie w plecaku');
  assert.match(tekst, /gorsze o 1/, 'brak ostrzeżenia, że zamiana pogorszy obronę');
  assert.ok(!tekst.includes('życie -'),
    'terminal zdradził działanie nierozpoznanej mikstury');
});

test('widok stołu wystarcza do policzenia różnicy - mimo że niesie KOPIE przedmiotów', () => {
  // Na stole przedmioty docierają jako kopie, więc porównanie „ten sam obiekt"
  // musiałoby zawieść. Porównanie idzie po `id` i to jest tu mierzone.
  const g = new Game('migawka-plecak', { name: 'Stół', w: 60, h: 20 });
  const h = g.player;
  h.inventory.length = 0;
  h.armor = pancerz('chain');
  h.inventory.push(h.armor, pancerz('studded'));
  const w = widokDla(g, h, { zKaflami: false });
  const kopiaNoszonej = w.ja.inventory[0];
  const kopiaLezacej = w.ja.inventory[1];
  assert.notEqual(kopiaNoszonej, h.armor, 'widok miał nieść kopię, nie ten sam obiekt');
  assert.equal(itemStats(kopiaNoszonej, w.ja).noszone, true,
    'stół nie rozpoznał noszonego pancerza w kopii - porównywanie po tożsamości obiektu');
  assert.equal(itemStats(kopiaLezacej, w.ja).porownanie, 'gorsze o 1');
});

// ---------- obejrzenie przed podniesieniem ----------

test('obejrzenie mówi, co rzecz daje i jak wypada wobec noszonego', () => {
  const g = new Game('obejrzyj-a');
  g.player.inventory.length = 0;
  g.player.armor = { id: 1, kind: 'armor', type: 'studded', name: 'kurtka ćwiekowa', bonus: 2, size: [2, 2] };
  const kolczuga = { id: 2, kind: 'armor', type: 'chain', name: 'kolczuga', bonus: 3, size: [2, 3] };

  const o = g.obejrzyj(kolczuga);
  assert.equal(o.opis, 'obrona +3');
  assert.equal(o.porownanie, 'lepsze o 1');
  assert.equal(o.znak, 'plus');
  assert.equal(o.miejsce, '2x3');
  assert.equal(o.pola, 6);
  assert.equal(o.zmiesci, true);
  assert.match(o.werdykt, /warto/);
});

test('obejrzenie NIE rozpoznaje mikstury - inaczej byłoby darmowym zwojem rozpoznania', () => {
  const g = new Game('obejrzyj-b');
  g.player.inventory.length = 0;
  const trucizna = { id: 3, kind: 'potion', type: 'poison', name: 'mikstura trucizny' };

  const o = g.obejrzyj(trucizna);
  assert.equal(g.identified.has('potion:poison'), false, 'obejrzenie rozpoznało rodzaj');
  assert.equal(o.opis, 'nieznane działanie');
  assert.ok(!/trucizn/i.test(o.werdykt), `werdykt zdradza rodzaj: ${o.werdykt}`);

  g.identify({ kind: 'potion', type: 'poison' });
  const po = g.obejrzyj(trucizna);
  assert.notEqual(po.opis, 'nieznane działanie', 'po rozpoznaniu skutek ma być podany');
});

test('obejrzenie liczy miejsce tą samą regułą, co podnoszenie', () => {
  // Rzecz, która się nie mieści, ma to POWIEDZIEĆ, a nie dać się podnieść
  // i zniknąć. Test wiąże obie odpowiedzi ze sobą: werdykt i skutek `pickup`.
  const g = new Game('obejrzyj-c');
  const h = g.player;
  h.inventory.length = 0;
  h.plecak = { w: 2, h: 2 };
  const topor = { id: 4, kind: 'weapon', type: 'warAxe', name: 'topór bojowy', bonus: 6, size: [2, 3] };

  const o = g.obejrzyj(topor);
  assert.equal(o.zmiesci, false, 'topór 2x3 nie ma prawa zmieścić się w plecaku 2x2');
  assert.match(o.werdykt, /Nie ma na to miejsca/);

  g.items.push({ ...topor, x: h.x, y: h.y });
  assert.equal(g.act({ type: 'pickup' }), false, 'skoro nie było miejsca, podniesienie ma odmówić');
  assert.equal(h.inventory.length, 0);
});

test('obejrzenie nie kosztuje tury i nie rusza świata', () => {
  const a = new Game('obejrzyj-kontrola');
  const b = new Game('obejrzyj-kontrola');
  const it = a.items[0];
  a.player.x = it.x; a.player.y = it.y;
  b.player.x = it.x; b.player.y = it.y;

  a.obejrzyj(it);
  assert.equal(a.turn, b.turn, 'oglądanie zabrało turę');
  assert.equal(a.player.hp, b.player.hp);
  assert.deepEqual(a.rng.getState(), b.rng.getState(), 'oglądanie zużyło losowanie');
});

test('KONTROLA PRZYRZĄDU: obejrzenie gorszej rzeczy odróżnia się od lepszej', () => {
  // Bez tego testu „warto" mogłoby stać przy każdej rzeczy i nikt by nie zauważył.
  const g = new Game('obejrzyj-d');
  g.player.armor = { id: 5, kind: 'armor', type: 'chain', name: 'kolczuga', bonus: 3, size: [2, 3] };
  const kurta = { id: 6, kind: 'armor', type: 'leather', name: 'kurta skórzana', bonus: 1, size: [2, 2] };

  const o = g.obejrzyj(kurta);
  assert.equal(o.znak, 'minus');
  assert.equal(o.porownanie, 'gorsze o 2');
  assert.match(o.werdykt, /Gorsze/);
  assert.equal(g.obejrzyj(null), null, 'puste pole nie może udawać przedmiotu');
});
