// Przegrane starcie z innym uczestnikiem: co gubi bohater i czy da się to
// w ogóle zauważyć.
//
// Mechanika jest stara (kryterium 21), nowy jest wyłącznie ŚLAD, po którym
// interfejs pozna, że to się właśnie stało. Powód jest ze zgłoszenia: gracz
// zobaczył pusty plecak i inne piętro, a jedyną informacją o przyczynie były
// trzy znikające linijki dziennika.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { widokDla } from '../src/widok.js';
import { dolozDoPlecaka } from '../src/plecak.js';
import { FOODS } from '../src/items.js';

/** Dwaj uczestnicy na jednym piętrze; pierwszy z nich zaraz przegra. */
function dwaj(seed, depth = 2) {
  const g = new Game(seed);
  const a = g.heroes[0];
  g.placeHero(a, depth, 'down');
  const b = g.addHero('Zwycięzca', depth);
  // Bohaterowie zaczynają z pustym plecakiem, a przegrana ma czego pozbawiać.
  let nr = 9000;
  for (const f of FOODS.slice(0, 2)) {
    dolozDoPlecaka(a, { id: nr++, kind: 'food', type: f.type, name: f.name }, (x) => x.name);
  }
  return { g, a, b };
}

test('przegrana zostawia ślad, po którym interfejs pozna, co się stało', () => {
  const { g, a, b } = dwaj('przegrana-1');
  const ile = a.inventory.length;
  assert.ok(ile > 0, 'bohater bez dobytku nic by nie zgubił - test nic nie zmierzy');
  a.hp = 0;
  a.lastHitBy = b;
  g.worldTurn([a]);

  assert.equal(a.status, 'playing', 'przegrana z uczestnikiem nie kończy partii');
  assert.equal(a.depth, 1, 'przegrany miał uciec piętro wyżej');
  assert.equal(a.inventory.length, 0);
  assert.equal(a.przegranaTura, g.turn);
  assert.deepEqual(a.przegrana, { kto: b.name, ile, zPietra: 2, naPietro: 1 });
});

test('ślad jedzie w migawce, więc klient nie musi czytać dziennika', () => {
  const { g, a, b } = dwaj('przegrana-2');
  a.hp = 0; a.lastHitBy = b;
  g.worldTurn([a]);
  const w = widokDla(g, a);
  assert.equal(w.ja.przegranaTura, a.przegranaTura);
  assert.equal(w.ja.przegrana.kto, b.name);
});

test('KONTROLA PRZYRZĄDU: śmierć od potwora NIE jest przegranym starciem', () => {
  // Gdyby ślad zapalał się przy każdej utracie życia, ekran „przegrałeś
  // starcie" wyskakiwałby po zwykłej śmierci - czyli mierzyłby coś innego.
  const { g, a } = dwaj('przegrana-kontrola');
  a.hp = 0;
  a.lastHitBy = { name: 'kobold' };      // potwór, nie uczestnik
  g.worldTurn([a]);
  assert.equal(a.status, 'dead');
  assert.equal(a.przegrana, undefined, 'zwykła śmierć zapaliła ślad przegranego starcia');
  assert.equal(widokDla(g, a).ja.przegrana, null);
});
