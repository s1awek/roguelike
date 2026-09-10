// Urozmaicenie rozgrywki: zaludnienie poziomu, zwrot sił za zabicie, odnawianie
// lochu, koszt odwrotu i zmęczenie ucieczką.
//
// Zgłoszenie właściciela, z którego to wyrosło: przeszedł cały drugi poziom przy
// turze ponad 5000 i spotkał jednego goblina; zabijanie drobnicy nie dawało nic
// poza ryzykiem; uciekającego przeciwnika nie dało się zmusić do walki.
//
// Część testów to KONTROLA PRZYRZĄDU - przypadki znane-złe, na których widać,
// że test w ogóle potrafi zgłosić usterkę.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, PROG_ZMECZENIA, zwrotZaZabicie } from '../src/game.js';
import { widokDla } from '../src/widok.js';
import { Bot, decydujWPojedynku } from '../src/bot.js';

const ostatnie = (h, ile = 5) => h.messages.slice(-ile).map(m => m.text).join(' | ');

/**
 * Trzy pola podłogi w rzędzie, wolne od potworów i przedmiotów; zwracane są dwa
 * prawe. Trzecie, po lewej, jest polem ODWROTU - bez niego cofnięcie się kończy
 * się na ścianie, ruch nie dochodzi do skutku i test mierzy geometrię komnaty
 * zamiast reguły. Tak właśnie padły dwa pierwsze przebiegi tego pliku.
 */
function paraPol(game, depth = 1) {
  const { level, monsters, items } = game.levels.get(depth);
  const zajete = (px, py) => monsters.some(m => m.x === px && m.y === py)
    || items.some(i => i.x === px && i.y === py);
  for (let y = 1; y < level.h - 1; y++) {
    for (let x = 2; x < level.w - 2; x++) {
      const wolne = (px) => level.isWalkable(px, y) && !zajete(px, y);
      if (wolne(x - 1) && wolne(x) && wolne(x + 1)) return [{ x, y }, { x: x + 1, y }];
    }
  }
  throw new Error('nie znalazłem trzech pól podłogi w rzędzie');
}

/** Dwóch uczestników stojących obok siebie i widzących się wzajemnie. */
function dwoje(seed = 'starcie') {
  const game = new Game(seed);
  const b = game.addHero('Drugi', 1);
  const [pa, pb] = paraPol(game);
  const a = game.heroes[0];
  a.x = pa.x; a.y = pa.y;
  b.x = pb.x; b.y = pb.y;
  game.updateFOV(a); game.updateFOV(b);
  assert.equal(game.contacts(a).length, 1, 'uczestnicy się nie widzą - dalszy pomiar byłby bez sensu');
  return { game, a, b, pa, pb };
}

// ---------- K-1: zaludnienie proporcjonalne do powierzchni ----------

test('mapa domyślna zachowuje DOKŁADNIE stare liczby - równowaga się nie ruszyła', () => {
  const g = new Game('gestosc-domyslna');
  assert.equal(g.gestosc, 1, 'mnożnik na mapie wzorcowej musi być równy jeden');
  for (let d = 1; d <= 8; d++) {
    assert.equal(g.ilePotworow(d), 4 + d, `poziom ${d}: liczba potworów odjechała od strojonej`);
    assert.equal(g.ilePrzedmiotow(d), 3 + Math.floor(d / 2), `poziom ${d}: liczba przedmiotów odjechała`);
  }
});

test('mapa dwa i pół raza większa dostaje proporcjonalnie więcej mieszkańców', () => {
  const maly = new Game('gest-maly');
  const duzy = new Game('gest-duzy', { w: 120, h: 32 });
  const stosunek = (120 * 32) / (76 * 20);
  assert.ok(duzy.gestosc > 2.4 && duzy.gestosc < 2.6, `mnożnik ${duzy.gestosc}`);
  for (const d of [1, 3, 6]) {
    const oczekiwane = Math.round(maly.ilePotworow(d) * stosunek);
    assert.equal(duzy.ilePotworow(d), oczekiwane, `poziom ${d} na dużej mapie`);
  }
  // Gęstość na pole, czyli to, co gracz odczuwa jako „pusto".
  const gestoscMalej = maly.ilePotworow(2) / (76 * 20);
  const gestoscDuzej = duzy.ilePotworow(2) / (120 * 32);
  const roznica = Math.abs(gestoscDuzej - gestoscMalej) / gestoscMalej;
  assert.ok(roznica < 0.15, `gęstości rozjeżdżają się o ${(roznica * 100).toFixed(1)}%`);
});

test('zbudowany poziom na dużej mapie NIE jest pusty', () => {
  const g = new Game('duzy-poziom', { w: 120, h: 32 });
  const { monsters, items } = g.buildLevel(2);
  assert.ok(monsters.length >= 12, `tylko ${monsters.length} potworów na 3840 polach`);
  assert.ok(items.length >= 8, `tylko ${items.length} przedmiotów na 3840 polach`);
});

// ---------- K-3: zwrot sił za zabicie ----------

test('zabicie przeciwnika zwraca siły, i to widać w dzienniku', () => {
  const g = new Game('zwrot-1');
  const h = g.player;
  h.hp = 10;
  const m = g.levels.get(1).monsters[0];
  const oczekiwany = zwrotZaZabicie(m.maxHp);
  m.hp = 0;
  g.killMonster(m, h);
  assert.equal(h.hp, 10 + oczekiwany, 'zwrot inny niż podaje księga zasad');
  assert.match(ostatnie(h), /Bierzesz oddech po walce/);
});

test('najdrobniejszy przeciwnik też coś oddaje', () => {
  // Sens zgłoszenia: jeśli szczur nie daje nic, to jedyną rozsądną taktyką jest
  // omijanie go łukiem - a wtedy walka, sedno gry, jest ekonomicznie błędna.
  const g = new Game('zwrot-2');
  const najslabszy = Math.min(...g.levels.get(1).monsters.map(m => m.maxHp));
  assert.ok(zwrotZaZabicie(najslabszy) >= 2, `zwrot za najsłabszego to ${zwrotZaZabicie(najslabszy)}`);
});

test('KONTROLA PRZYRZĄDU: zwrot nie podnosi życia powyżej pełni', () => {
  const g = new Game('zwrot-3');
  const h = g.player;
  h.hp = h.maxHp;
  const m = g.levels.get(1).monsters[0];
  m.hp = 0;
  g.killMonster(m, h);
  assert.equal(h.hp, h.maxHp, 'zwrot przekroczył pełnię życia');
  assert.ok(!/Bierzesz oddech/.test(ostatnie(h)), 'gra obiecała zwrot, którego nie dała');

  const g2 = new Game('zwrot-4');
  g2.player.hp = g2.player.maxHp - 1;
  const m2 = g2.levels.get(1).monsters[0];
  m2.hp = 0;
  g2.killMonster(m2, g2.player);
  assert.equal(g2.player.hp, g2.player.maxHp, 'zwrot ma dociągnąć do pełni, a nie ją przeskoczyć');
});

// ---------- K-2: odnawianie lochu ----------

test('bez odnawiania ogołocony poziom zostaje martwy - tak ma być w partii jednoosobowej', () => {
  const g = new Game('odnowa-brak');
  const e = g.levels.get(1);
  e.monsters.length = 0; e.items.length = 0;
  for (let i = 0; i < 300; i++) g.act({ type: 'wait' });
  assert.equal(e.monsters.length, 0, 'partia jednoosobowa dosypała potworów - to przesuwa równowagę');
  assert.equal(e.items.length, 0);
});

test('z odnawianiem ogołocony poziom wraca do życia, ale nie na oczach gracza', () => {
  const g = new Game('odnowa-jest', { odnawianie: true });
  const e = g.levels.get(1);
  e.monsters.length = 0; e.items.length = 0;
  for (let i = 0; i < 600; i++) g.act({ type: 'wait' });
  assert.ok(e.monsters.length > 0, 'poziom nie odnowił się ani jednym potworem');
  assert.ok(e.monsters.length <= g.ilePotworow(1),
    `odnawianie przekroczyło zamierzone zaludnienie: ${e.monsters.length} > ${g.ilePotworow(1)}`);
  for (const m of e.monsters) {
    assert.equal(g.player.visible.has(`${m.x},${m.y}`), false,
      `potwór ${m.name} wyrósł w polu widzenia gracza`);
  }
});

// ---------- K-6: koszt odwrotu i zmęczenie ----------

test('odskok od przeciwnika, który zostaje, kończy się ciosem w plecy', () => {
  const { game, a, b } = dwoje('odwrot-1');
  const hpPrzed = a.hp;
  // A cofa się w lewo (od B), B stoi.
  game.resolveTurn(new Map([[a.hid, { type: 'move', dx: -1, dy: 0 }], [b.hid, { type: 'wait' }]]),
    [a, b]);
  assert.ok(a.hp < hpPrzed || /w odwrocie|nie dosięga/.test(ostatnie(a)),
    `odskok był darmowy: hp ${hpPrzed} -> ${a.hp}, dziennik: ${ostatnie(a)}`);
});

test('KONTROLA PRZYRZĄDU: obopólne rozejście jest darmowe', () => {
  const { game, a, b } = dwoje('odwrot-2');
  const hpA = a.hp, hpB = b.hp;
  game.resolveTurn(new Map([
    [a.hid, { type: 'move', dx: -1, dy: 0 }],
    [b.hid, { type: 'move', dx: 1, dy: 0 }],
  ]), [a, b]);
  assert.equal(a.hp, hpA, 'ukarany za rozejście, którego druga strona też chciała');
  assert.equal(b.hp, hpB, 'ukarany za rozejście, którego druga strona też chciała');
});

test('cofać się można ograniczoną liczbę razy, potem brakuje tchu', () => {
  const { game, a, b, pa, pb } = dwoje('zmeczenie-1');
  let stanieNaOddech = false;
  for (let i = 0; i < PROG_ZMECZENIA + 2; i++) {
    // Położenia wracają na start przed każdą turą, bo mierzymy LICZNIK zmęczenia,
    // a nie długość komnaty - w przeciwnym razie ucieczka rozbija się o ścianę
    // wcześniej, niż zabraknie tchu, i test mówi o mapie, nie o regule.
    a.x = pa.x; a.y = pa.y; b.x = pb.x; b.y = pb.y;
    game.updateFOV(a); game.updateFOV(b);
    const przed = { x: a.x, y: a.y };
    game.resolveTurn(new Map([
      [a.hid, { type: 'move', dx: -1, dy: 0 }],
      [b.hid, { type: 'wait' }],
    ]), [a, b]);
    if (/Brakuje Ci tchu/.test(ostatnie(a, 3))) {
      stanieNaOddech = true;
      assert.deepEqual({ x: a.x, y: a.y }, przed, 'przystanek na oddech, a postać się przesunęła');
      break;
    }
  }
  assert.ok(stanieNaOddech, `po ${PROG_ZMECZENIA + 2} odwrotach nadal można uciekać bez końca`);
});

test('zmęczenie schodzi, gdy uczestnik stanie zamiast się cofać', () => {
  const { game, a, b } = dwoje('zmeczenie-2');
  a.zmeczenie = 3;
  game.resolveTurn(new Map([[a.hid, { type: 'wait' }], [b.hid, { type: 'wait' }]]), [a, b]);
  assert.equal(a.zmeczenie, 2, 'postój nie przywraca tchu');
});

test('KONTROLA PRZYRZĄDU: w partii jednoosobowej zmęczenie nie istnieje', () => {
  // Nie ma z kim być w kontakcie, więc cofanie się przed potworem nic nie kosztuje -
  // inaczej ta zmiana przesunęłaby zmierzoną równowagę gry jednoosobowej.
  const g = new Game('zmeczenie-jeden');
  for (let i = 0; i < 40; i++) g.act({ type: 'move', dx: 1, dy: 0 });
  assert.equal(g.player.zmeczenie, 0, 'gra jednoosobowa naliczyła zmęczenie');
});

// ---------- K-4: co gracz widzi ----------

test('migawka niesie zaludnienie piętra i stan oddechu, ale nie położenia', () => {
  const g = new Game('migawka-pietro', { w: 120, h: 32 });
  const h = g.player;
  h.zmeczenie = 2;
  const w = widokDla(g, h);
  const zywe = g.levels.get(h.depth).monsters.filter(m => m.hp > 0).length;
  assert.equal(w.pietro.potwory, zywe, 'liczba wrogów na piętrze nie zgadza się ze stanem poziomu');
  assert.equal(w.pietro.smialkowie, 1);
  assert.equal(w.ja.zmeczenie, 2);
  assert.equal(w.ja.progZmeczenia, PROG_ZMECZENIA);
  // Uczciwość: liczba zbiorcza nie może przyjść razem z listą położeń.
  assert.equal(Object.keys(w.pietro).length, 2, 'w zaludnieniu piętra pojawiło się coś więcej niż liczby');
});

test('gracz automatyczny bez tchu staje i walczy, zamiast biernie oddawać ciosy', () => {
  const { game, a, b } = dwoje('bot-bez-tchu');
  const bot = new Bot();
  b.hp = Math.floor(b.maxHp * 0.2);          // słaby, więc normalnie by uciekał
  b.zmeczenie = 0;
  const ucieczka = decydujWPojedynku(game, b, bot);
  b.zmeczenie = PROG_ZMECZENIA;
  const walka = decydujWPojedynku(game, b, bot);
  const kuA = { dx: Math.sign(a.x - b.x), dy: Math.sign(a.y - b.y) };
  assert.equal(walka.type, 'move');
  assert.deepEqual({ dx: walka.dx, dy: walka.dy }, kuA, 'bez tchu bot nadal nie natarł');
  assert.notDeepEqual({ dx: ucieczka.dx, dy: ucieczka.dy }, kuA,
    'z pełnym oddechem słaby bot powinien się cofać - inaczej test nie mierzy różnicy');
});
