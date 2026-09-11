import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, MAX_DEPTH, BUDZENIE } from '../src/game.js';
import { makeAmulet } from '../src/items.js';
import { KINDS } from '../src/monsters.js';
import { STAIRS_DOWN, STAIRS_UP } from '../src/map.js';
import { serialize, loadFromString } from '../src/save.js';
import { t } from '../src/i18n.js';

// Powrót z Amuletem: loch się budzi (spec `.workspace/powrot-trudnosc-hud-acceptance-spec.md`, część A).

/** Gra z bohaterem na piętrze `depth`, z Amuletem pod nogami (bez smoka - to test budzenia, nie walki). */
function zAmuletemPodNogami(seed, depth) {
  const g = new Game(seed);
  for (let d = 2; d <= depth; d++) g.enterLevel(d, 'down');
  const a = makeAmulet();
  a.id = g.newId();
  a.x = g.player.x; a.y = g.player.y;
  g.items.push(a);
  return g;
}

/** Przestawia bohatera na dany kafel (bez tury), jak teleport. */
function postaw(g, p) { g.player.x = p.x; g.player.y = p.y; g.updateFOV(); }

test('podniesienie Amuletu budzi piętro: nowi mieszkańcy z głębszej puli, poza widokiem, nie na schodach', () => {
  for (const seed of ['budzi-0', 'budzi-1', 'budzi-2']) {
    const depth = 3;
    const g = zAmuletemPodNogami(seed, depth);
    const bylo = g.monsters.length;
    const idPrzed = g._idCounter;
    const widoczne = new Set(g.player.visible);
    const kafle = g.level.toJSON();
    const rzeczyPrzed = g.items.filter(i => i.kind !== 'amulet').map(i => `${i.id}@${i.x},${i.y}`).sort();
    const pamiecPrzed = Uint8Array.from(g.memoryOf(g.player));

    assert.ok(g.act({ type: 'pickup' }), 'podniesienie Amuletu powinno się udać');
    assert.equal(g.player.hasAmulet, true);
    assert.equal(g.here.obudzony, true, 'piętro powinno być oznaczone jako obudzone');

    const nowe = g.monsters.filter(m => m.id >= idPrzed);
    assert.equal(nowe.length, g.ilePotworow(depth), `${seed}: piętro ${depth} ma dostać ${g.ilePotworow(depth)} nowych`);
    assert.equal(g.monsters.length, bylo + nowe.length, 'nikt z dawnych mieszkańców nie zniknął');

    // pula głębsza o BUDZENIE.pula, nigdy poza ostatnie piętro wzorcowe
    const pula = new Set(KINDS.filter(k => depth + BUDZENIE.pula >= k.minD && depth + BUDZENIE.pula <= k.maxD).map(k => k.type));
    for (const m of nowe) {
      assert.ok(pula.has(m.type), `${seed}: ${m.type} nie należy do puli piętra ${depth + BUDZENIE.pula}`);
      // Nowi wyrastają poza polem widzenia i dalej niż promień widzenia + 2, więc
      // nawet po jednym kroku (tura po podniesieniu) nadal nie sposób ich widzieć.
      assert.ok(!widoczne.has(`${m.x},${m.y}`), `${seed}: ${m.type} wyrósł na oczach gracza`);
      assert.ok(!g.isVisible(m.x, m.y), `${seed}: ${m.type} widoczny zaraz po przebudzeniu`);
      const kafel = g.level.at(m.x, m.y);
      assert.ok(kafel !== STAIRS_DOWN && kafel !== STAIRS_UP, `${seed}: ${m.type} stoi na schodach`);
    }
    assert.ok(nowe.some(m => !m.asleep) || BUDZENIE.czuwa === 0, `${seed}: żaden z nowych nie czuwa`);

    // A-5: mapa, rzeczy i schody bez zmian - Amulet nic nie odsłania
    assert.deepEqual(g.level.toJSON(), kafle, 'kafle piętra się zmieniły');
    assert.deepEqual(g.items.map(i => `${i.id}@${i.x},${i.y}`).sort(), rzeczyPrzed, 'rzeczy na podłodze się zmieniły');
    assert.deepEqual(Uint8Array.from(g.memoryOf(g.player)), pamiecPrzed, 'pamięć terenu się zmieniła');

    // A-6: komunikat w dzienniku
    assert.ok(g.messages.some(m => m.text === t('loch.budzi', {}, g.jezyk(g.player))), `${seed}: brak komunikatu o budzeniu`);
  }
});

test('każde piętro w drodze na powierzchnię budzi się raz - ponowne wejście nic nie dosypuje', () => {
  const g = zAmuletemPodNogami('budzi-raz', 3);
  g.act({ type: 'pickup' });
  assert.equal(g.here.obudzony, true);
  assert.equal(g.levels.get(2).obudzony, false, 'piętro wyżej nie budzi się przed wejściem');

  // w górę na 2: budzi się
  postaw(g, g.level.upPos);
  const idPrzed2 = g._idCounter;
  assert.ok(g.act({ type: 'ascend' }));
  assert.equal(g.depth, 2);
  assert.equal(g.here.obudzony, true);
  const nowe2 = g.monsters.filter(m => m.id >= idPrzed2).length;
  assert.equal(nowe2, g.ilePotworow(2));
  assert.ok(g.messages.some(m => m.text === t('loch.budzi', {}, g.jezyk(g.player))));

  // z powrotem na 3 i znów na 2: nic nowego
  postaw(g, g.level.downPos);
  const idPrzed3 = g._idCounter;
  assert.ok(g.act({ type: 'descend' }));
  assert.equal(g.depth, 3);
  assert.equal(g._idCounter, idPrzed3, 'piętro 3 obudziło się drugi raz');
  postaw(g, g.level.upPos);
  assert.ok(g.act({ type: 'ascend' }));
  assert.equal(g.depth, 2);
  assert.equal(g._idCounter, idPrzed3, 'piętro 2 obudziło się drugi raz');
});

test('bez Amuletu nic się nie budzi: te same ruchy dają ten sam stan generatora', () => {
  // Kontrola: identyczny przebieg z Amuletem na podłodze, ale NIEpodniesionym.
  const a = new Game('budzi-kontrola');
  const b = new Game('budzi-kontrola');
  for (const g of [a, b]) for (let d = 2; d <= 3; d++) g.enterLevel(d, 'down');
  const am = makeAmulet(); am.id = b.newId(); am.x = b.player.x + 100; am.y = 0; // poza planszą, nie do podniesienia
  a.newId(); // wyrównanie licznika
  b.items.push(am);
  for (const g of [a, b]) { g.act({ type: 'wait' }); g.act({ type: 'wait' }); }
  assert.deepEqual(b.rng.getState(), a.rng.getState());
  assert.ok([...a.levels.values()].every(e => !e.obudzony));
  assert.ok([...b.levels.values()].every(e => !e.obudzony));
});

test('zapis pamięta, że piętro już się obudziło; zapis sprzed zmiany wczytuje się jako nieobudzony', () => {
  const g = zAmuletemPodNogami('budzi-zapis', 3);
  g.act({ type: 'pickup' });
  const r = loadFromString(serialize(g));
  assert.equal(r.game.levels.get(3).obudzony, true);
  assert.equal(r.game.levels.get(2).obudzony, false);
  // po wczytaniu ponowne wejście na 3 nie dosypuje
  const w = r.game;
  postaw(w, w.level.upPos);
  w.act({ type: 'ascend' });
  postaw(w, w.level.downPos);
  const id = w._idCounter;
  w.act({ type: 'descend' });
  assert.equal(w._idCounter, id);

  // zapis bez pola (sprzed tej zmiany)
  const dane = JSON.parse(serialize(g));
  for (const e of Object.values(dane.levels)) delete e.obudzony;
  const stary = loadFromString(JSON.stringify(dane));
  assert.equal(stary.game.levels.get(3).obudzony, false);
});

test('głębokość wzorcowa: przy ośmiu piętrach tożsamość, przy innej liczbie rozciąga drabinę na całą długość', () => {
  const g8 = new Game('wzorcowa', { maxDepth: MAX_DEPTH });
  for (let d = 1; d <= MAX_DEPTH; d++) assert.equal(g8.glebokoscWzorcowa(d), d);
  const g6 = new Game('wzorcowa', { maxDepth: 6 });
  assert.equal(g6.glebokoscWzorcowa(1), 1);
  assert.equal(g6.glebokoscWzorcowa(6), MAX_DEPTH);
  const g10 = new Game('wzorcowa', { maxDepth: 10 });
  assert.equal(g10.glebokoscWzorcowa(10), MAX_DEPTH);
  assert.equal(g10.glebokoscWzorcowa(1), 1);
  for (let d = 2; d <= 10; d++) assert.ok(g10.glebokoscWzorcowa(d) >= g10.glebokoscWzorcowa(d - 1), 'drabina ma być niemalejąca');
});
