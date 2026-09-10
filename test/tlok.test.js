// Tłok przy schodach: dlaczego boty „stoją w miejscu".
//
// Zgłoszenie z rozgrywki: w pierwszym pokoju poziomu drugiego wszystkie boty
// stały nieruchomo, jakby się zablokowały. Blokady nie było. Grupa w kontakcie
// idzie TURĄ WSPÓLNĄ, więc jeden milczący człowiek wstrzymuje wszystkich wokół
// aż do terminu - a przez pierwsze 12 sekund wygląda to jak zawieszona gra.
//
// Zegar jest podstawiony, więc pomiar nie trwa tyle, ile mierzony czas.
// Ostatni test to KONTROLA PRZYRZĄDU: gdy człowiek deklaruje, spowolnienia
// nie ma, czyli pomiar potrafi wskazać obie strony.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { Stol, CZAS_NA_DEKLARACJE_MS } from '../src/stol.js';
import { Bot } from '../src/bot.js';

let zegar = 0;

/** Sześciu uczestników stłoczonych wokół jednego pola na poziomie 1. */
function tlok({ czlowiek }) {
  zegar = 0;
  const g = new Game('tlok-test');
  const stol = new Stol(g, { teraz: () => zegar });
  stol.miejsca.get(0).rodzaj = czlowiek ? 'czlowiek' : 'bot';
  stol.miejsca.get(0).bot = czlowiek ? null : new Bot();
  for (let i = 1; i < 6; i++) stol.dosiadz(`Bot ${i}`, { rodzaj: 'bot' });

  const cel = g.heroes[0];
  const L = g.levels.get(1).level;
  for (const h of g.heroes) {
    h.depth = 1;
    for (let r = 0; r <= 4; r++) {
      let stanal = false;
      for (let dy = -r; dy <= r && !stanal; dy++) for (let dx = -r; dx <= r && !stanal; dx++) {
        const x = cel.x + dx, y = cel.y + dy;
        if (!L.isWalkable(x, y)) continue;
        if (g.heroes.some(o => o !== h && o.depth === 1 && o.x === x && o.y === y)) continue;
        h.x = x; h.y = y; stanal = true;
      }
      if (stanal) break;
    }
    g.updateFOV(h);
  }
  return { g, stol };
}

/** Przepuszcza `sekundy` czasu stołu i zwraca liczbę działań każdego uczestnika. */
function przebieg(stol, sekundy, przedTikiem = null) {
  const dzialania = new Map();
  for (let i = 0; i < sekundy * 20; i++) {
    zegar += 50;
    if (przedTikiem) przedTikiem(stol, zegar);
    for (const w of stol.tick().wykonane) dzialania.set(w.hid, (dzialania.get(w.hid) ?? 0) + 1);
  }
  return dzialania;
}

test('milczący człowiek w grupie zatrzymuje wszystkich wokół siebie', () => {
  const sameBoty = przebieg(tlok({ czlowiek: false }).stol, 30);
  const zCzlowiekiem = przebieg(tlok({ czlowiek: true }).stol, 30);

  const najmniej = (m) => Math.min(...[...m.values()]);
  const botySame = Math.min(...[...sameBoty.entries()].map(([, n]) => n));
  const botyPrzyCzlowieku = Math.min(...[...zCzlowiekiem.entries()]
    .filter(([hid]) => hid !== 0).map(([, n]) => n));

  // Próg 15 z zapasem: w tłoku najwolniejszy bot i tak traci część zgłoszeń na
  // ruchy w pole zajęte przez sąsiada (odmowa nie kosztuje tury), więc liczba
  // jest wyraźnie niższa niż u bota mającego wolną drogę - zmierzone 20 wobec 75.
  assert.ok(botySame >= 15, `same boty powinny działać swobodnie, a mają ${botySame} działań`);
  assert.ok(botyPrzyCzlowieku * 4 < botySame,
    `milczący człowiek nie spowolnił grupy: ${botyPrzyCzlowieku} wobec ${botySame} działań`);
  assert.equal(najmniej(sameBoty) > 0, true);
});

test('po terminie stół rusza bez milczącego - milczenie nie zatrzymuje gry na stałe', () => {
  const { stol } = tlok({ czlowiek: true });
  const dzialania = przebieg(stol, Math.ceil(CZAS_NA_DEKLARACJE_MS / 1000) * 3);
  const boty = [...dzialania.entries()].filter(([hid]) => hid !== 0);
  assert.ok(boty.length >= 4, 'boty w grupie powinny w końcu wykonać ruch, a nie stać bez końca');
  for (const [hid, n] of boty) assert.ok(n >= 2, `uczestnik ${hid} nie ruszył się ani razu`);
});

test('stół mówi wprost, kto wstrzymuje turę', () => {
  const { stol } = tlok({ czlowiek: true });
  przebieg(stol, 1);

  const moje = stol.oczekiwanie(0);
  assert.equal(moje.wspolna, true, 'sześciu w jednym pokoju to tura wspólna');
  assert.equal(moje.jaMilcze, true, 'człowiek bez deklaracji ma być nazwany milczącym');
  assert.deepEqual(moje.milczacy, [], 'bot dławiony tempem NIE jest milczącym - to nie on każe czekać');
  assert.ok(moje.zaMs > 0 && moje.zaMs <= CZAS_NA_DEKLARACJE_MS, `termin poza zakresem: ${moje.zaMs}`);

  stol.zadeklaruj(0, { type: 'wait' });
  assert.equal(stol.oczekiwanie(0).jaMilcze, false, 'po zgłoszeniu gracz nie wstrzymuje już tury');
});

test('KONTROLA PRZYRZĄDU: gdy człowiek deklaruje, spowolnienia nie ma', () => {
  const { stol } = tlok({ czlowiek: true });
  // Ten sam pomiar, jedyna różnica to deklaracja co tik. Gdyby test mierzył
  // cokolwiek innego niż milczenie, wynik nie ruszyłby się z miejsca.
  const dzialania = przebieg(stol, 30, (s) => s.zadeklaruj(0, { type: 'wait' }));
  const boty = [...dzialania.entries()].filter(([hid]) => hid !== 0).map(([, n]) => n);
  assert.ok(Math.min(...boty) >= 15,
    `deklarujący człowiek nie powinien nikogo wstrzymywać, a najwolniejszy ma ${Math.min(...boty)} działań`);
});

// ---------- odpoczynek w towarzystwie (W-27) ----------

/**
 * Gra z dwoma poobijanymi uczestnikami, którzy stoją naprzeciw siebie.
 *
 * `blisko` decyduje, czy drugi jest widoczny. To jedyna różnica między
 * przypadkiem badanym a kontrolą - reszta stanu jest identyczna, więc każda
 * różnica w decyzji bierze się z obecności drugiego uczestnika, a nie
 * z przypadkowego położenia czy zdrowia.
 */
function dwochPoobijanych({ blisko }) {
  const g = new Game('odpoczynek');
  const a = g.heroes[0];
  const b = g.addHero('Drugi', 1);
  for (const h of [a, b]) {
    h.hp = Math.floor(h.maxHp * 0.4);       // poniżej progu odpoczynku (0.65)
    h.hunger = 1000;                        // głód nie może być powodem decyzji
  }
  const L = g.levels.get(1).level;
  if (blisko) {
    // Tuż obok, ale NIE w zwarciu - w zwarciu decyduje reguła pojedynku,
    // a badana jest reguła odpoczynku.
    for (let d = 3; d < 12; d++) {
      if (L.isWalkable(a.x + d, a.y)) { b.x = a.x + d; b.y = a.y; break; }
    }
  } else {
    b.x = a.x; b.y = a.y;                   // ustawiany niżej poza zasięg wzroku
    for (let d = 30; d < 90; d++) if (L.isWalkable(d, L.h - 3)) { b.x = d; b.y = L.h - 3; break; }
  }
  // Potwory precz - reguła odpoczynku pyta o nie osobno i zaciemniłyby pomiar.
  g.levels.get(1).monsters.length = 0;
  for (const h of [a, b]) g.updateFOV(h);
  return { g, a, b };
}

test('poobijany bot NIE odpoczywa, gdy widzi innego uczestnika', () => {
  const { g, a, b } = dwochPoobijanych({ blisko: true });
  assert.ok(g.contacts(a).includes(b), 'próba źle ustawiona - uczestnicy się nie widzą');
  g.active = a.hid;
  const akcja = new Bot().decide(g);
  assert.notEqual(akcja.type, 'wait',
    'bot stanął na odpoczynek naprzeciw innego uczestnika - tak powstaje pokój pełny nieruchomych botów');
});

test('KONTROLA PRZYRZĄDU: ten sam poobijany bot SAM odpoczywa', () => {
  // Gdyby ten test też był zielony, poprzedni nie mierzyłby obecności drugiego
  // uczestnika, tylko cokolwiek innego - na przykład to, że reguła odpoczynku
  // w ogóle przestała działać.
  const { g, a, b } = dwochPoobijanych({ blisko: false });
  assert.equal(g.contacts(a).includes(b), false, 'kontrola źle ustawiona - uczestnicy się widzą');
  g.active = a.hid;
  assert.equal(new Bot().decide(g).type, 'wait',
    'samotny poobijany bot powinien odpoczywać - inaczej zmiana zabiła regułę zamiast ją zawęzić');
});
