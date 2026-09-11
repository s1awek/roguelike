// Podnoszenie z kupki: kilka rzeczy na jednym kaflu.
//
// Rzeczy wolno układać w stos, więc na jednym polu potrafi leżeć kilka sztuk.
// Do tej pory `,` brało wyłącznie wierzchnią, a reszta wymagała przebierania:
// podnieś, wyrzuć niepotrzebne, podnieś następne. Te testy pilnują dwóch rzeczy
// naraz - że wybór działa i że NIE stał się furtką do brania cudzych rzeczy
// z drugiego końca poziomu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { setLang } from '../src/i18n.js';

// Te testy sprawdzają brzmienie POLSKIE. Od D-051 domyślny jest angielski,
// więc język jest ustawiony jawnie - asercje zostały bez zmian.
setLang('pl');

/** Gra z pustym plecakiem i trzema rzeczami pod nogami. */
function zKupka(seed, ile = 3) {
  const g = new Game(seed);
  g.player.inventory.length = 0;
  const p = g.player;
  const wybrane = g.items.filter(i => i.kind !== 'amulet').slice(0, ile);
  for (const it of wybrane) { it.x = p.x; it.y = p.y; }
  return { g, kupka: g.stosPodNogami() };
}

test('bez listy bierze wierzchnią rzecz - tak jak zawsze', () => {
  const { g, kupka } = zKupka('kupka-1');
  assert.equal(kupka.length, 3);
  assert.equal(g.act({ type: 'pickup' }), true);
  assert.equal(g.player.inventory.length, 1, 'brak listy ma brać dokładnie jedną rzecz');
  assert.equal(g.stosPodNogami().length, 2);
});

test('wybrane rzeczy idą do plecaka razem, za jedną turę', () => {
  const { g, kupka } = zKupka('kupka-2');
  const ids = [kupka[0].id, kupka[2].id];
  const tura = g.turn;
  assert.equal(g.act({ type: 'pickup', ids }), true);
  assert.equal(g.turn, tura + 1, 'cały wybór ma kosztować jedną turę');
  assert.deepEqual(g.player.inventory.map(i => i.id).sort(), [...ids].sort());
  // Niewybrana rzecz zostaje na podłodze - wybór ma być wyborem, nie zgarnianiem.
  assert.deepEqual(g.stosPodNogami().map(i => i.id), [kupka[1].id]);
});

test('lista nie sięga dalej niż własne stopy', () => {
  // Klient przy stole przysyła listę identyfikatorów. Gdyby silnik brał je
  // z całego poziomu, wystarczyłby jeden spreparowany wpis, żeby ściągnąć
  // rzecz z drugiego końca mapy.
  const { g, kupka } = zKupka('kupka-3');
  const daleko = g.items.find(i => i.x !== g.player.x || i.y !== g.player.y);
  assert.ok(daleko, 'brak rzeczy leżącej gdzie indziej - test nic by nie zmierzył');
  const przed = { x: daleko.x, y: daleko.y };
  assert.equal(g.act({ type: 'pickup', ids: [daleko.id] }), false, 'wzięło rzecz spoza kafla');
  assert.equal(g.player.inventory.length, 0);
  assert.deepEqual({ x: daleko.x, y: daleko.y }, przed, 'rzecz spoza kafla ruszyła się z miejsca');
});

test('odmowa nie kosztuje tury i niczego nie gubi', () => {
  const { g } = zKupka('kupka-4');
  const tura = g.turn;
  assert.equal(g.act({ type: 'pickup', ids: [] }), false);
  assert.equal(g.turn, tura, 'pusty wybór zabrał turę');
  assert.equal(g.stosPodNogami().length, 3, 'pusty wybór ruszył kupkę');
});

test('co się nie zmieściło, zostaje nazwane i leży dalej', () => {
  const { g, kupka } = zKupka('kupka-5');
  // Plecak zapchany wszystkim poza jednym polem: część wyboru musi zostać.
  g.player.plecak = { w: 1, h: 1 };
  const ids = kupka.map(i => i.id);
  assert.equal(g.act({ type: 'pickup', ids }), true);
  assert.equal(g.player.inventory.length, 1, 'do plecaka 1x1 weszło więcej niż jedno pole');
  assert.equal(g.stosPodNogami().length, 2, 'reszta miała zostać na podłodze');
  const log = g.messages.slice(-2).map(m => m.text).join(' | ');
  assert.match(log, /Nie zmieściło się/, `gracz nie dowiedział się, co zostało: ${log}`);
});

test('lista w złym kształcie nie wywraca gry', () => {
  // Przy stole ta lista przychodzi z sieci. Liczba zamiast tablicy nie może
  // zabić partii wszystkim przy stole.
  const { g } = zKupka('kupka-6');
  assert.equal(g.act({ type: 'pickup', ids: 7 }), true, 'zły kształt ma zadziałać jak brak listy');
  assert.equal(g.player.inventory.length, 1);
  assert.equal(g.status, 'playing');
});

test('KONTROLA PRZYRZĄDU: test rozpoznaje kupkę, której nie ma', () => {
  // Ten sam pomiar na kaflu z jedną rzeczą. Gdyby testy wyżej przechodziły
  // także tutaj, mierzyłyby coś innego niż myślę.
  const g = new Game('kontrola-kupka');
  g.player.inventory.length = 0;
  for (const it of g.items) { if (it.x === g.player.x && it.y === g.player.y) it.x += 3; }
  const jedna = g.items.find(i => i.kind !== 'amulet');
  jedna.x = g.player.x; jedna.y = g.player.y;
  assert.equal(g.stosPodNogami().length, 1);
  assert.equal(g.act({ type: 'pickup', ids: [jedna.id] }), true);
  assert.equal(g.stosPodNogami().length, 0);
});
