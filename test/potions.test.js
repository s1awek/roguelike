// Rozpoznawanie mikstur: zapach, zwój rozpoznania, księga zasad.
//
// Część testów to KONTROLA PRZYRZĄDU - przypadki znane-złe, na których widać,
// że test w ogóle potrafi zgłosić usterkę. Test, który nigdy nie zapala się na
// czerwono, jest nieodróżnialny od testu zepsutego.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { POTIONS, SCROLLS, POTION_SCENT, SCENTS, scentGroup, itemLabel } from '../src/items.js';
import { buildRules } from '../src/rules.js';
import { serialize, loadFromString } from '../src/serialize.js';

let id = 5000;
const potion = (type) => ({ id: id++, kind: 'potion', type, name: POTIONS.find(p => p.type === type).name });
const scroll = (type) => ({ id: id++, kind: 'scroll', type, name: SCROLLS.find(s => s.type === type).name });

/**
 * Kilka ostatnich komunikatów sklejonych w jeden napis.
 *
 * Sprawdzanie WYŁĄCZNIE ostatniego komunikatu jest kruche i już raz dało fałszywy
 * wynik: w mijającej turze odzywa się świat, więc po działaniu gracza na końcu
 * dziennika potrafi stać „Szczur trafia Ciebie", a nie odpowiedź na to działanie.
 */
function ostatnie(g, ile = 4) {
  return g.messages.slice(-ile).map(m => m.text).join(' | ');
}

function pusta(seed) {
  const g = new Game(seed);
  g.player.inventory.length = 0;
  return g;
}

// ---------- podział zapachowy ----------

test('zapach dzieli mikstury na pary - żaden zapach nie wskazuje jednego rodzaju', () => {
  for (const key of Object.keys(SCENTS)) {
    const grupa = scentGroup(key);
    assert.ok(grupa.length >= 2,
      `zapach "${key}" ma ${grupa.length} rodzaj - wskazywałby go jednoznacznie`);
  }
  assert.equal(new Set(Object.values(POTION_SCENT)).size, 2, 'oczekiwane dwie grupy zapachowe');
});

test('grupa łagodna nie zawiera niczego szkodliwego, ostra zawiera truciznę', () => {
  const mild = scentGroup('mild').map(p => p.type);
  const sharp = scentGroup('sharp').map(p => p.type);
  assert.ok(!mild.includes('poison'), 'trucizna w grupie łagodnej - zapach kłamałby o ryzyku');
  assert.ok(sharp.includes('poison'), 'trucizna musi być w grupie ostrej');
  // Sens całej mechaniki: „łagodny" ma znaczyć „bezpieczne", i to musi być prawdą
  // dla KAŻDEGO rodzaju w tej grupie, nie tylko dla tego, który akurat sprawdzam.
  for (const t of mild) {
    const p = POTIONS.find(x => x.type === t);
    assert.notEqual(t, 'poison', `${p.name} nie może pachnieć łagodnie`);
  }
});

// ---------- wąchanie ----------

test('powąchanie kosztuje turę i NIE rozpoznaje rodzaju', () => {
  const g = pusta('wach-1');
  g.player.inventory.push(potion('poison'));
  const tura = g.turn;

  assert.equal(g.act({ type: 'sniff', index: 0 }), true, 'wąchanie powinno zużyć turę');
  assert.equal(g.turn, tura + 1, 'tura nie minęła');
  assert.equal(g.identified.has('potion:poison'), false,
    'powąchanie rozpoznało rodzaj - to znosi całą decyzję o wypiciu');
  assert.equal(g.sniffed.has('potion:poison'), true);
  assert.match(ostatnie(g), /mikstura siły albo mikstura trucizny/,
    'komunikat ma nazwać OBIE możliwości');
});

test('wąchanie samo w sobie nie zmienia świata - kosztuje dokładnie tyle co czekanie', () => {
  // Pomiar „punkty życia się nie zmieniły" jest NIEOSTRY: w mijającej turze bije
  // potwór, więc życie potrafi spaść z powodu, który z wąchaniem nie ma nic
  // wspólnego. Rozstrzyga porównanie z kontrolą: ta sama gra, ta sama tura,
  // jedyna różnica to działanie gracza.
  const a = pusta('wach-kontrola');
  const b = pusta('wach-kontrola');
  a.player.inventory.push(potion('poison'));
  b.player.inventory.push(potion('poison'));

  a.act({ type: 'sniff', index: 0 });
  b.act({ type: 'wait' });

  assert.equal(a.player.hp, b.player.hp, 'wąchanie zabrało życie ponad to, co zabiera sama tura');
  assert.equal(a.player.hunger, b.player.hunger);
  assert.deepEqual(a.rng.getState(), b.rng.getState(), 'wąchanie zużyło losowanie');
  assert.equal(a.player.inventory.length, 1, 'wąchanie zużyło miksturę');
  assert.deepEqual(
    a.monsters.map(m => [m.x, m.y, m.hp]),
    b.monsters.map(m => [m.x, m.y, m.hp]),
    'świat po powąchaniu różni się od świata po czekaniu');
});

test('zapach zostaje przy nazwie w plecaku', () => {
  const g = pusta('wach-2');
  g.player.inventory.push(potion('strength'));
  const przed = itemLabel(g.player.inventory[0], g.appearances, g.identified, g.sniffed);
  g.act({ type: 'sniff', index: 0 });
  const po = itemLabel(g.player.inventory[0], g.appearances, g.identified, g.sniffed);
  assert.ok(!przed.includes('zapach'), `etykieta przed powąchaniem nie może nieść zapachu: ${przed}`);
  assert.ok(po.includes('zapach ostry'), `etykieta po powąchaniu ma nieść zapach: ${po}`);
  assert.ok(po.startsWith(przed), 'wygląd mikstury nie może się zmienić po powąchaniu');
});

test('wykluczenie: gdy druga z pary jest znana, zapach rozstrzyga na pewno', () => {
  const g = pusta('wach-3');
  g.player.inventory.push(potion('greaterHeal'));
  g.identify({ kind: 'potion', type: 'heal' });
  g.act({ type: 'sniff', index: 0 });
  assert.equal(g.identified.has('potion:greaterHeal'), true,
    'ostatni nierozpoznany rodzaj w parze powinien zostać rozpoznany');
  assert.match(ostatnie(g), /mikstura pełni sił/);
});

test('odmowy nie kosztują tury', () => {
  const g = pusta('wach-4');
  g.player.inventory.push({ id: id++, kind: 'food', type: 'apple', name: 'jabłko' });
  g.player.inventory.push(potion('heal'));

  let t = g.turn;
  assert.equal(g.act({ type: 'sniff', index: 0 }), false, 'jedzenie nie ma czego pachnieć');
  assert.equal(g.turn, t, 'odmowa zabrała turę');

  g.act({ type: 'sniff', index: 1 });
  t = g.turn;
  assert.equal(g.act({ type: 'sniff', index: 1 }), false, 'powtórne wąchanie ma być darmowe');
  assert.equal(g.turn, t);

  g.identify({ kind: 'potion', type: 'heal' });
  t = g.turn;
  assert.equal(g.act({ type: 'sniff', index: 1 }), false, 'wąchanie znanej mikstury ma być darmowe');
  assert.equal(g.turn, t);
});

test('KONTROLA PRZYRZĄDU: wąchanie poza zakresem plecaka nie wywraca gry', () => {
  const g = pusta('wach-5');
  assert.equal(g.act({ type: 'sniff', index: 7 }), false);
  assert.equal(g.status, 'playing');
});

// ---------- zwój rozpoznania ----------

test('zwój rozpoznania rozpoznaje wszystko nieznane z plecaka', () => {
  const g = pusta('zwoj-1');
  g.player.inventory.push(scroll('identify'), potion('poison'), scroll('teleport'), potion('heal'));
  g.act({ type: 'use', index: 0 });
  for (const t of ['potion:poison', 'potion:heal', 'scroll:teleport']) {
    assert.equal(g.identified.has(t), true, `${t} miało zostać rozpoznane`);
  }
  assert.equal(g.player.inventory.length, 3, 'zwój ma zniknąć po przeczytaniu');
});

test('zwój rozpoznania działa na RODZAJ, nie na sztukę', () => {
  const g = pusta('zwoj-2');
  g.player.inventory.push(scroll('identify'), potion('poison'));
  g.act({ type: 'use', index: 0 });
  const inna = potion('poison');   // druga sztuka tego samego rodzaju, znaleziona później
  assert.equal(itemLabel(inna, g.appearances, g.identified, g.sniffed), 'mikstura trucizny');
});

test('zwój rozpoznania przy braku zagadek mówi to wprost', () => {
  const g = pusta('zwoj-3');
  g.player.inventory.push(scroll('identify'));
  g.act({ type: 'use', index: 0 });
  assert.match(ostatnie(g), /nie ma już żadnej zagadki/);
});

// ---------- zapis stanu ----------

test('powąchane rodzaje przeżywają zapis i wznowienie', () => {
  const g = pusta('zapis-1');
  g.player.inventory.push(potion('strength'));
  g.act({ type: 'sniff', index: 0 });
  const r = loadFromString(serialize(g));
  assert.equal(r.ok, true, r.error);
  assert.deepEqual([...r.game.sniffed], [...g.sniffed]);
});

test('zapis sprzed wprowadzenia wąchania daje się wczytać', () => {
  const g = pusta('zapis-2');
  const dane = JSON.parse(serialize(g));
  delete dane.sniffed;                      // tak wyglądał każdy zapis przed tą zmianą
  const r = loadFromString(JSON.stringify(dane));
  assert.equal(r.ok, true, `stary zapis odrzucony: ${r.error}`);
  assert.equal(r.game.sniffed.size, 0);
});

// ---------- księga zasad ----------

test('księga podaje liczby zgodne z tablicami gry', () => {
  const ksiega = buildRules('doc');
  const mikstury = ksiega.find(s => s.id === 'mikstury');
  const tabela = mikstury.blocks.find(b => b.t === 'table');
  assert.equal(tabela.rows.length, POTIONS.length, 'księga pomija rodzaj mikstury');
  for (const p of POTIONS) {
    const wiersz = tabela.rows.find(r => r[0] === p.name);
    assert.ok(wiersz, `brak wiersza dla: ${p.name}`);
    assert.ok(wiersz[1].includes(String(p.power)),
      `księga podaje inną moc niż tablica dla ${p.name}: "${wiersz[1]}" wobec ${p.power}`);
  }
});

test('księga nie zdradza sekretu partii: żadnej barwy mikstury', () => {
  const g = new Game('sekret');
  const tekst = JSON.stringify(buildRules('doc'));
  for (const [type, wyglad] of Object.entries(g.appearances.potion)) {
    assert.equal(tekst.includes(wyglad), false,
      `księga wymienia wygląd "${wyglad}" (${type}) - to sekret bieżącej rozgrywki`);
  }
});

test('księga ma rozdziały wymagane spec-em i te same w obu wersjach', () => {
  const wymagane = ['cel', 'sterowanie', 'widok', 'walka', 'rozwoj', 'glod', 'mikstury', 'zapis'];
  for (const gdzie of ['web', 'term', 'doc']) {
    const ids = buildRules(gdzie).map(s => s.id);
    for (const w of wymagane) assert.ok(ids.includes(w), `wersja ${gdzie} nie ma rozdziału ${w}`);
  }
  assert.deepEqual(buildRules('web').map(s => s.id), buildRules('term').map(s => s.id),
    'wersje różnią się rozdziałami');
});

test('KONTROLA PRZYRZĄDU: test liczb w księdze wykrywa zasianą pomyłkę', () => {
  // Ta sama procedura co w teście wyżej, ale na tablicy z celowo zepsutą liczbą.
  const zepsute = POTIONS.map(p => p.type === 'heal' ? { ...p, power: p.power + 1 } : p);
  const tabela = buildRules('doc').find(s => s.id === 'mikstury').blocks.find(b => b.t === 'table');
  const wiersz = tabela.rows.find(r => r[0] === 'mikstura leczenia');
  const zepsuta = zepsute.find(p => p.type === 'heal');
  assert.equal(wiersz[1].includes(String(zepsuta.power)), false,
    'test nie odróżnia poprawnej liczby od zasianej - jest ślepy');
});
