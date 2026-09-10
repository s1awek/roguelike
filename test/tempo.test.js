// Tempo świata przy stole: ile razy potwory ruszają się na jedną turę gracza.
//
// Zgłoszenie właściciela: „teoretycznie gramy w trybie turowym, ale w czasie
// rzeczywistym atakują nas różne stworzonka typu nietoperze czy szczury".
// Przyczyną nie był zegar, tylko liczenie: świat odpowiadał na KAŻDE działanie
// KAŻDEGO bohatera na piętrze, więc przy czterech botach potwór obok człowieka
// dostawał kilka ruchów na jego jeden.
//
// Testy mierzą liczbę ruchów potwora, a nie obecność reguły w kodzie. Kontrola
// przyrządu: to samo mierzone w grze jednoosobowej ma dać zachowanie DAWNE -
// inaczej naprawa po cichu zmieniłaby wystrojoną równowagę.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, FOV_RADIUS } from '../src/game.js';

/** Poziom 1 gry, jego potwory i pierwszy wolny kafel spełniający warunek. */
function polePrzy(g, hero, odleglosc) {
  const L = g.levels.get(1).level;
  for (let y = 0; y < L.h; y++) {
    for (let x = 0; x < L.w; x++) {
      if (!L.isWalkable(x, y)) continue;
      const d = Math.max(Math.abs(x - hero.x), Math.abs(y - hero.y));
      if (d === odleglosc && !g.monsterAt(x, y) && !g.heroAt(x, y, 1)) return { x, y };
    }
  }
  return null;
}

/** Jeden obudzony potwór postawiony dokładnie tam, gdzie trzeba. */
function postawPotwora(g, x, y) {
  const entry = g.levels.get(1);
  const m = entry.monsters.find(z => z.hp > 0) || entry.monsters[0];
  m.x = x; m.y = y; m.asleep = false; m.hp = m.maxHp;
  m.erratic = false;                       // ruch chaotyczny zaszumiłby pomiar
  for (const inny of entry.monsters) if (inny !== m) inny.hp = 0;
  return m;
}

function dzialaj(g, hero, akcja = { type: 'wait' }) {
  const prev = g.active;
  g.active = g.heroes.indexOf(hero);
  const spent = g.act(akcja);
  g.active = prev;
  return spent;
}

test('gra jednoosobowa: potwór odpowiada na KAŻDĄ turę gracza (zachowanie dawne)', () => {
  const g = new Game('tempo-jeden', { name: 'Ty', w: 60, h: 20 });
  const p = g.player;
  const gdzie = polePrzy(g, p, FOV_RADIUS + 5);   // daleko, poza polem widzenia
  assert.ok(gdzie, 'nie znalazłem pola do postawienia potwora');
  const m = postawPotwora(g, gdzie.x, gdzie.y);
  const start = { x: m.x, y: m.y };

  for (let i = 0; i < 6; i++) dzialaj(g, p);
  assert.notDeepEqual({ x: m.x, y: m.y }, start,
    'potwór spoza pola widzenia przestał podchodzić - to zmiana równowagi gry jednoosobowej, nie naprawa stołu');
});

test('stół: potwór stojący przy jednym bohaterze NIE rusza się w turach drugiego', () => {
  const g = new Game('tempo-dwoje', { name: 'A', w: 60, h: 20 });
  const a = g.player;
  const b = g.addHero('B', 1);
  // B daleko od A - poza kontaktem, więc gra we własnym tempie
  const daleko = polePrzy(g, a, FOV_RADIUS + 12) || polePrzy(g, a, FOV_RADIUS + 8);
  assert.ok(daleko, 'brak pola dla drugiego bohatera');
  b.x = daleko.x; b.y = daleko.y;
  g.updateFOV(a); g.updateFOV(b);

  const przyA = polePrzy(g, a, 2);
  assert.ok(przyA, 'brak pola tuż przy A');
  const m = postawPotwora(g, przyA.x, przyA.y);
  const start = { x: m.x, y: m.y };
  const hpA = a.hp;

  for (let i = 0; i < 8; i++) dzialaj(g, b);      // OSIEM tur drugiego bohatera
  assert.deepEqual({ x: m.x, y: m.y }, start,
    'potwór przy A ruszał się w turach B - świat chodzi szybciej niż gracz');
  assert.equal(a.hp, hpA, 'A oberwał w turze, w której nie brał udziału');

  dzialaj(g, a);                                   // teraz tura A
  assert.notDeepEqual({ x: m.x, y: m.y }, start,
    'potwór nie ruszył się nawet w turze bohatera, przy którym stoi - zawężenie jest za ostre');
});

test('stół: potwór przy WŁASNYM bohaterze bije normalnie, tura po turze', () => {
  const g = new Game('tempo-bicie', { name: 'A', w: 60, h: 20 });
  const a = g.player;
  const b = g.addHero('B', 1);
  const daleko = polePrzy(g, a, FOV_RADIUS + 12) || polePrzy(g, a, FOV_RADIUS + 8);
  b.x = daleko.x; b.y = daleko.y;
  g.updateFOV(a); g.updateFOV(b);

  const obok = polePrzy(g, a, 1);
  assert.ok(obok, 'brak pola sąsiadującego z A');
  postawPotwora(g, obok.x, obok.y);
  const hp0 = a.hp;
  for (let i = 0; i < 5; i++) dzialaj(g, a);
  assert.ok(a.hp < hp0, 'potwór stojący obok nie zaatakował przez pięć tur - naprawa zabiła walkę');
});

test('KONTROLA PRZYRZĄDU: pomiar wykrywa świat chodzący szybciej niż gracz', () => {
  // Ta sama sytuacja co wyżej, ale świat ruszany jawnie, z pominięciem
  // zawężenia - czyli dokładnie tak, jak działał przed naprawą. Gdyby test
  // tego nie odróżniał, nie mierzyłby niczego.
  const g = new Game('tempo-kontrola', { name: 'A', w: 60, h: 20 });
  const a = g.player;
  const b = g.addHero('B', 1);
  const daleko = polePrzy(g, a, FOV_RADIUS + 12) || polePrzy(g, a, FOV_RADIUS + 8);
  b.x = daleko.x; b.y = daleko.y;
  g.updateFOV(a); g.updateFOV(b);
  const przyA = polePrzy(g, a, 2);
  const m = postawPotwora(g, przyA.x, przyA.y);
  const start = { x: m.x, y: m.y };

  for (let i = 0; i < 8; i++) g.monstersActOn(1, [a]);   // stare zachowanie
  assert.notDeepEqual({ x: m.x, y: m.y }, start,
    'pomiar nie odróżnia świata ruszanego bez zawężenia - jest ślepy');
});
