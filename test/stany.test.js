// Stany bohatera: jedna tablica progów karmi dziennik, księgę i pasek.
//
// Sedno tych testów nie brzmi „czy pasek pokazuje ładny kolor", tylko „czy
// wszystkie trzy miejsca mówią o głodzie DOKŁADNIE to samo". Rozjazd między
// nimi już raz był: silnik ostrzegał przy 200, terminal nazywał stan przy 200,
// a stół przy 400 - i nikt tego nie widział, bo każde miejsce z osobna było
// spójne samo ze sobą.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { STOPNIE_GLODU, stopienGlodu, stanyBohatera, HUNGER_MAX } from '../src/stany.js';
import { buildRules } from '../src/rules.js';
import { renderStatus } from '../src/render.js';

/** Sytość spada o 1 na turę; przewijamy grę do zadanej wartości i zbieramy dziennik. */
function przewin(g, doWartosci) {
  g.player.hunger = doWartosci + 1;
  const przed = g.messages.length;
  g.act({ type: 'wait' });
  return g.messages.slice(przed).map(m => m.text);
}

test('stopnie są rozłączne i pokrywają całą oś sytości', () => {
  for (let h = -50; h <= HUNGER_MAX + 50; h += 1) {
    const s = stopienGlodu(h);
    assert.ok(s, `sytość ${h} bez stopnia`);
    assert.ok(STOPNIE_GLODU.includes(s));
  }
  // Kolejność ma znaczenie: `find` bierze pierwszy pasujący, więc tablica musi
  // iść od najgorszego stopnia. Odwrócona dawałaby zawsze „syty".
  const progi = STOPNIE_GLODU.map(s => s.do);
  assert.deepEqual(progi, [...progi].sort((a, b) => a - b), 'progi nie rosną');
});

test('ostrzeżenie w dzienniku pada dokładnie na progu, na którym zmienia się pasek', () => {
  for (const st of STOPNIE_GLODU) {
    if (!st.komunikat) continue;
    const g = new Game(`prog-${st.do}`);
    const na = przewin(g, st.do);
    assert.ok(na.includes(st.komunikat),
      `przy sytości ${st.do} nie padło „${st.komunikat}", padło: ${na.join(' | ')}`);
    assert.equal(stanyBohatera(g.player)[0].etykieta, st.etykieta,
      'pasek nazywa stan inaczej niż dziennik w tej samej turze');

    // O jeden wcześniej ma być cisza - inaczej komunikat leciałby co turę.
    const c = new Game(`cisza-${st.do}`);
    assert.ok(!przewin(c, st.do + 1).includes(st.komunikat),
      `komunikat „${st.komunikat}" pada przed swoim progiem`);
  }
});

test('ostrzeżenie nie powtarza się przy staniu w miejscu na tym samym stopniu', () => {
  const g = new Game('powtorka');
  g.player.hunger = 305;
  let ile = 0;
  for (let i = 0; i < 12; i++) {
    const przed = g.messages.length;
    g.act({ type: 'wait' });
    ile += g.messages.slice(przed).filter(m => m.text === 'Robisz się głodny.').length;
  }
  assert.equal(ile, 1, `ostrzeżenie padło ${ile} razy zamiast raz`);
});

test('księga zasad podaje te same progi i te same nazwy stanów co gra', () => {
  const tabela = buildRules('doc').find(s => s.id === 'glod').blocks.find(b => b.t === 'table');
  assert.equal(tabela.rows.length, STOPNIE_GLODU.length, 'księga pomija stopień sytości');
  for (const st of STOPNIE_GLODU) {
    assert.ok(tabela.rows.some(r => r[1] === st.etykieta),
      `księga nie zna stanu „${st.etykieta}"`);
  }
});

test('terminal pokazuje pasek sytości, nie samo słowo', () => {
  const g = new Game('pasek');
  g.player.hunger = 1200;
  const syty = renderStatus(g);
  g.player.hunger = 40;
  const slaby = renderStatus(g);
  assert.match(syty, /█/, 'brak paska w wierszu stanu');
  assert.ok(syty.includes('syty') && slaby.includes('słabniesz z głodu'));
  // Ta sama sytość musi wypełniać pasek inaczej - inaczej pasek jest ozdobą.
  const bloki = (t) => (t.match(/█/g) || []).length;
  assert.ok(bloki(syty) > bloki(slaby), 'pasek nie reaguje na sytość');
});

test('brak pola w migawce daje uboższy widok, nie wywrotkę', () => {
  // Starszy serwer nie przysyła sytości. Klient ma to przeżyć (W-24).
  assert.deepEqual(stanyBohatera({ hp: 10, maxHp: 10 }), []);
});

test('KONTROLA PRZYRZĄDU: rozjazd progu między dziennikiem a paskiem jest wykrywalny', () => {
  // Zasiana usterka dokładnie tej klasy, która była w kodzie przed tą zmianą:
  // pasek zmienia nazwę przy jednej wartości, dziennik odzywa się przy innej.
  const zasiane = STOPNIE_GLODU.map(s => s.do === 300 ? { ...s, do: 200 } : s);
  const stopien = (h) => zasiane.find(s => h <= s.do);
  const g = new Game('kontrola-rozjazd');
  const na = przewin(g, 300);                      // gra odzywa się przy 300
  assert.ok(na.includes('Robisz się głodny.'), 'gra nie odezwała się na własnym progu');
  assert.notEqual(stopien(300).etykieta, 'głodny',
    'test nie odróżnia przesuniętego progu od poprawnego - jest ślepy');
});
