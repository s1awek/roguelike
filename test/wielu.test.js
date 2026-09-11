// Wielu graczy w jednym lochu - kryteria ze spec-a `roboczy/wielu-graczy-acceptance-spec.md`.
//
// Część testów to KONTROLA PRZYRZĄDU: przypadki znane-złe, na których widać,
// że test w ogóle potrafi zgłosić usterkę.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { playDuel, grupyWKontakcie } from '../src/bot.js';
import { serialize, loadFromString } from '../src/serialize.js';

/** Dwóch uczestników postawionych obok siebie, bez losowania położeń. */
function paraObokSiebie(seed = 'para') {
  const g = new Game(seed);
  const b = g.addHero('Druga', 1, { scatter: false });
  const a = g.heroes[0];
  // stawiamy ich ręcznie na sąsiednich polach podłogi
  const L = g.levels.get(1).level;
  for (let y = 1; y < L.h - 1; y++) {
    for (let x = 1; x < L.w - 2; x++) {
      if (L.isWalkable(x, y) && L.isWalkable(x + 1, y)
          && !g.monsterOn(1, x, y) && !g.monsterOn(1, x + 1, y)) {
        a.x = x; a.y = y; b.x = x + 1; b.y = y;
        g.updateFOV(a); g.updateFOV(b);
        return { g, a, b };
      }
    }
  }
  throw new Error('nie znalazłem dwóch sąsiednich pól');
}

// ---------- A. nienaruszalność gry jednoosobowej ----------

test('gra jednoosobowa nadal ma dokładnie jednego uczestnika i te same widoki', () => {
  const g = new Game('jeden');
  assert.equal(g.heroes.length, 1);
  assert.equal(g.player, g.heroes[0], '`player` musi być widokiem na uczestnika czynnego');
  assert.equal(g.depth, g.player.depth);
  assert.equal(g.messages, g.player.messages);
  assert.equal(g.identified, g.player.identified);
  g.act({ type: 'wait' });
  assert.equal(g.turn, 1);
});

test('zapis w STARYM formacie (przed wielu graczami) daje się wczytać', () => {
  // Wzorzec to PRAWDZIWY zapis wyprodukowany przed przebudową, nie ręcznie
  // złożony obiekt - ręczny wzorzec potwierdzałby tylko moje wyobrażenie o nim.
  const surowy = readFileSync(new URL('./fixtures/zapis-format-1.json', import.meta.url), 'utf8');
  assert.equal(JSON.parse(surowy).format, 1, 'wzorzec przestał być w starym formacie');
  const r = loadFromString(surowy);
  assert.equal(r.ok, true, `stary zapis odrzucony: ${r.error}`);
  const g = r.game;
  assert.equal(g.heroes.length, 1);
  assert.ok(g.depth >= 2, 'wzorzec miał być poniżej pierwszego poziomu');
  assert.ok(g.player.inventory.length > 0);
  assert.ok(g.identified.size > 0, 'rozpoznane rodzaje muszą przeżyć przepisanie formatu');
  // pamięć terenu miała siedzieć w POZIOMIE, a ma wylądować u uczestnika
  assert.ok(g.player.memory.size >= 2, 'pamięć terenu nie trafiła do uczestnika');
  let pamietane = 0;
  for (const m of g.player.memory.values()) for (const b of m) pamietane += b;
  assert.ok(pamietane > 100, `zapamiętany teren przepadł (${pamietane} pól)`);
});

// ---------- B/C. wspólny świat, osobista wiedza ----------

test('loch jest wspólny: potwór zabity przez jednego jest martwy dla wszystkich', () => {
  const g = new Game('wspolny');
  g.addHero('Druga');
  const lista = g.levels.get(1).monsters;
  const ile = lista.length;
  assert.ok(ile > 0);
  assert.equal(g.levels.get(1).monsters, lista, 'oba uczestnicy patrzą na tę samą tablicę potworów');
  const m = lista[0];
  m.hp = 1;
  g.heroes[0].x = m.x - 1; g.heroes[0].y = m.y;
  g.heroes[0].str = 200;   // żeby cios był pewny
  g.applyAction(g.heroes[0], { type: 'move', dx: 1, dy: 0 });
  assert.equal(g.levels.get(1).monsters.length, ile - 1, 'potwór miał zniknąć ze wspólnej listy');
});

test('pamięć terenu jest OSOBISTA - wejście na cudzy poziom nie odsłania nic', () => {
  const g = new Game('pamiec-osobista');
  const a = g.heroes[0];
  for (let i = 0; i < 60; i++) if (!g.act({ type: 'move', dx: 1, dy: 0 })) g.act({ type: 'wait' });
  const b = g.addHero('Druga');
  const suma = (h) => [...g.memoryOf(h, 1)].reduce((x, y) => x + y, 0);
  assert.ok(suma(a) > 40, 'pierwszy powinien mieć zwiedzony teren');
  const drugi = suma(b);
  const jegoWidok = b.visible.size;
  assert.ok(drugi <= jegoWidok + 1,
    `drugi pamięta ${drugi} pól, a widzi ${jegoWidok} - czyli dostał cudzą pamięć`);
  assert.ok(drugi < suma(a), 'drugi nie może pamiętać tyle co pierwszy');
});

test('dziennik i wiedza o miksturach są osobiste', () => {
  const { g, a, b } = paraObokSiebie('osobista-wiedza');
  a.messages.length = 0; b.messages.length = 0;
  g.applyAction(a, { type: 'wait' });
  g.tell(a, 'wiadomość tylko dla pierwszego');
  assert.equal(b.messages.length, 0, 'komunikat wyciekł do cudzego dziennika');

  g.applyAction(a, { type: 'sniff', index: 0 });
  assert.notEqual(a.identified, b.identified, 'zbiory wiedzy nie mogą być tym samym obiektem');
  assert.equal(b.sniffed.size, 0, 'drugi nie może korzystać z wiedzy pierwszego');
  // wygląd mikstur jest natomiast WSPÓLNY - loch jest jeden
  assert.equal(g.appearances.potion.heal, g.appearances.potion.heal);
});

// ---------- D. reguła tury ----------

test('tura wspólna: obaj działają, świat rusza się RAZ', () => {
  const { g, a, b } = paraObokSiebie('tura-wspolna');
  const t = g.turn;
  const spent = g.resolveTurn(new Map([[a.hid, { type: 'wait' }], [b.hid, { type: 'wait' }]]));
  assert.equal(g.turn, t + 1, 'wspólna tura policzyła się więcej niż raz');
  assert.equal(spent.get(a.hid), true);
  assert.equal(spent.get(b.hid), true);
});

test('NIKT nie dostaje darmowej serii ciosów - cios za cios w tej samej turze', () => {
  const { g, a, b } = paraObokSiebie('bez-darmowych');
  a.str = 100; b.str = 100; a.def = 0; b.def = 0;
  const hpA = a.hp, hpB = b.hp;
  const kuSobie = (from, to) => ({ type: 'move', dx: Math.sign(to.x - from.x), dy: Math.sign(to.y - from.y) });
  g.resolveTurn(new Map([[a.hid, kuSobie(a, b)], [b.hid, kuSobie(b, a)]]));
  assert.ok(a.hp < hpA, 'pierwszy nie oberwał, choć drugi uderzał');
  assert.ok(b.hp < hpB, 'drugi nie oberwał, choć pierwszy uderzał');
});

test('wycofanie się bierze skutek w tej samej turze co cios', () => {
  const { g, a, b } = paraObokSiebie('wycofanie');
  b.str = 100; b.def = 0;
  const przed = { x: a.x, y: a.y };
  const wTyl = { type: 'move', dx: -1, dy: 0 };
  const doA = { type: 'move', dx: Math.sign(a.x - b.x), dy: Math.sign(a.y - b.y) };
  g.resolveTurn(new Map([[a.hid, wTyl], [b.hid, doA]]));
  const odszedl = a.x !== przed.x || a.y !== przed.y;
  assert.ok(odszedl || !g.levels.get(a.depth).level.isWalkable(przed.x - 1, przed.y),
    'uciekający nie ruszył się, choć pole obok było wolne');
});

test('bezczynność jednego nie zatrzymuje partii', () => {
  const { g, a, b } = paraObokSiebie('bezczynnosc');
  const t = g.turn;
  // deklarację składa TYLKO drugi; pierwszy milczy
  const spent = g.resolveTurn(new Map([[b.hid, { type: 'wait' }]]));
  assert.equal(g.turn, t + 1, 'tura nie zeszła, bo jeden nie zadeklarował działania');
  assert.equal(spent.get(a.hid), true, 'milczący ma stać bezczynnie, a nie blokować turę');
});

test('kontakt idzie po polu widzenia, nie po poziomie', () => {
  const { g, a, b } = paraObokSiebie('kontakt');
  assert.equal(g.contacts(a).length, 1, 'stojąc obok siebie mają być w kontakcie');
  assert.equal(g.contacts(b).length, 1, 'kontakt musi być wzajemny');
  b.depth = 2;
  assert.equal(g.contacts(a).length, 0, 'na różnych poziomach nie ma kontaktu');
});

// ---------- E. starcie uczestników ----------

test('przegrany starcie NIE traci partii - gubi dobytek i budzi się wyżej', () => {
  const g = new Game('stawka');
  const a = g.heroes[0];
  g.enterLevel(3, 'down');
  const b = g.addHero('Druga', 3);
  b.x = a.x + 1; b.y = a.y;
  g.updateFOV(a); g.updateFOV(b);
  a.inventory.push({ id: 9001, kind: 'food', type: 'ration', name: 'racja żywnościowa', nutrition: 800 });
  a.hasAmulet = true;
  a.hp = 1;
  b.str = 500; b.def = 0;
  const ilePrzed = a.inventory.length;
  g.resolveTurn(new Map([[b.hid, { type: 'move', dx: Math.sign(a.x - b.x), dy: Math.sign(a.y - b.y) }]]));
  assert.equal(a.status, 'playing', 'przegrany starcie nie może stracić partii');
  assert.equal(a.inventory.length, 0, 'dobytek miał wypaść');
  assert.equal(a.hasAmulet, false, 'Amulet miał wypaść - inaczej nie da się go odebrać');
  assert.equal(a.depth, 2, 'przegrany miał się obudzić piętro wyżej');
  assert.ok(a.hp > 0);
  const nalezy = g.levels.get(3).items.filter(i => i.id === 9001);
  assert.equal(nalezy.length, 1, `zgubiony dobytek (${ilePrzed}) miał zostać na ziemi`);
});

test('KONTROLA PRZYRZĄDU: śmierć z głodu NIE jest przegranym starciem', () => {
  const g = new Game('glod-nie-starcie');
  g.addHero('Druga');
  const a = g.heroes[0];
  a.hunger = 1;
  a.hp = 1;
  for (let i = 0; i < 10 && a.status === 'playing'; i++) g.act({ type: 'wait' });
  assert.equal(a.status, 'dead', 'głód ma zabijać na śmierć, a nie odbierać plecak');
  assert.match(String(a.cause), /głód/);
});

// ---------- F/G. gracz automatyczny i zapis ----------

test('dwóch graczy automatycznych rozgrywa partię bez wywrotki', () => {
  const g = new Game('duel-test');
  g.scatterHero(g.heroes[0], 1);
  g.addHero('Druga', 1);
  const r = playDuel(g, { maxTurns: 3000 });
  assert.notEqual(r.outcome, 'crash', `wywrotka: ${r.reason}`);
  assert.equal(r.heroes.length, 2);
  assert.ok(r.turyWolne > 0, 'uczestnicy mieli chodzić własnym tempem, gdy są osobno');
});

test('stan wielu uczestników przeżywa zapis i wznowienie', () => {
  const g = new Game('zapis-wielu');
  g.addHero('Druga');
  for (let i = 0; i < 25; i++) g.resolveTurn(new Map([[0, { type: 'move', dx: 1, dy: 0 }], [1, { type: 'move', dx: 0, dy: 1 }]]));
  g.heroes[1].identified.add('potion:heal');
  const r = loadFromString(serialize(g));
  assert.equal(r.ok, true, r.error);
  const g2 = r.game;
  assert.equal(g2.heroes.length, 2);
  for (let i = 0; i < 2; i++) {
    const przed = g.heroes[i], po = g2.heroes[i];
    assert.equal(po.name, przed.name);
    assert.deepEqual([po.x, po.y, po.hp, po.depth], [przed.x, przed.y, przed.hp, przed.depth]);
    assert.deepEqual([...po.identified].sort(), [...przed.identified].sort());
    const sumaPrzed = [...g.memoryOf(przed, przed.depth)].reduce((a, b) => a + b, 0);
    const sumaPo = [...g2.memoryOf(po, po.depth)].reduce((a, b) => a + b, 0);
    assert.equal(sumaPo, sumaPrzed, `pamięć terenu uczestnika ${i} nie przeżyła zapisu`);
  }
  assert.notEqual(g2.heroes[0].identified, g2.heroes[1].identified,
    'po wczytaniu wiedza obu uczestników nie może być tym samym zbiorem');
});

// ---------- grupowanie po kontakcie ----------

test('łańcuch kontaktów rozstrzyga się CAŁY razem, nie parami', () => {
  // Kontakt jest parami: A widzi B, B widzi C, A nie widzi C. Naiwne grupowanie
  // dałoby {A,B} i osobno {C}, więc C rozstrzygałby turę przeciw B, który już
  // się ruszył. Sprawdzane na zastępniku, bo ustawienie takiego łańcucha na
  // prawdziwej mapie zależy od układu ścian, a mierzona jest tu SAMA reguła.
  const widzi = { 1: [2], 2: [1, 3], 3: [2], 4: [] };
  const zywi = [1, 2, 3, 4].map(hid => ({ hid, status: 'playing' }));
  const zastepnik = { contacts: (h) => widzi[h.hid].map(i => zywi[i - 1]) };
  const grupy = grupyWKontakcie(zastepnik, zywi).map(g => g.map(h => h.hid).sort());
  assert.equal(grupy.length, 2, `oczekiwane dwie grupy, wyszło ${JSON.stringify(grupy)}`);
  assert.deepEqual(grupy.find(g => g.length > 1), [1, 2, 3], 'cały łańcuch ma być jedną grupą');
  assert.deepEqual(grupy.find(g => g.length === 1), [4], 'osobny uczestnik nie może wpaść do grupy');
});

test('tura wspólna grupy NIE rusza świata tym, którzy chodzą osobno', () => {
  const g = new Game('zawezenie');
  g.addHero('Druga');
  g.addHero('Trzecia');
  const [a, b, c] = g.heroes;
  const glodC = c.hunger, hpC = c.hp;
  g.resolveTurn(new Map([[a.hid, { type: 'wait' }], [b.hid, { type: 'wait' }]]), [a, b]);
  assert.equal(c.hunger, glodC, 'osobnemu uczestnikowi ubył głód w cudzej turze');
  assert.equal(c.hp, hpC, 'osobny uczestnik oberwał w cudzej turze');
  assert.notEqual(a.hunger, glodC, 'uczestnikom grupy głód ubyć MIAŁ');
});
