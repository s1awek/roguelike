import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { serialize, fingerprint, loadFromString, saveToFile, loadFromFile } from '../src/save.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RUCHY = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1]];
function graj(g, n) {
  for (let i = 0; i < n; i++) {
    const [dx, dy] = RUCHY[i % RUCHY.length];
    if (!g.act({ type: 'move', dx, dy })) g.act({ type: 'wait' });
  }
  return g;
}

test('powtarzalność: to samo ziarno i te same ruchy dają ten sam stan (50 ziaren)', () => {
  for (let i = 0; i < 50; i++) {
    const a = graj(new Game(`powt-${i}`), 300);
    const b = graj(new Game(`powt-${i}`), 300);
    assert.equal(fingerprint(a), fingerprint(b), `ziarno powt-${i}: rozjazd stanu`);
  }
});

test('różne ziarna dają różne rozgrywki', () => {
  const odciski = new Set();
  for (let i = 0; i < 20; i++) odciski.add(fingerprint(graj(new Game(`rozne-${i}`), 200)));
  assert.equal(odciski.size, 20);
});

test('wznowienie jest nieodróżnialne od stanu sprzed zapisu', () => {
  for (let i = 0; i < 10; i++) {
    const g = graj(new Game(`zapis-${i}`), 250);
    const raw = serialize(g);
    const r = loadFromString(raw);
    assert.ok(r.ok, r.error);
    assert.equal(fingerprint(r.game), fingerprint(g), 'inny odcisk po wznowieniu');
    assert.equal(serialize(r.game), raw, 'ponowny zapis daje inną treść');
  }
});

test('dalszy ciąg gry po wznowieniu biegnie tak samo jak bez zapisu', () => {
  for (let i = 0; i < 10; i++) {
    const g1 = graj(new Game(`ciag-${i}`), 200);
    const g2 = loadFromString(serialize(g1)).game;
    graj(g1, 200); graj(g2, 200);
    assert.equal(fingerprint(g1), fingerprint(g2), `ziarno ciag-${i}: rozjazd po wznowieniu`);
  }
});

test('zapamiętana mapa i ekwipunek przeżywają zapis', () => {
  const g = graj(new Game('pamiec'), 400);
  const przed = [...g.memoryOf(g.player)].reduce((a, b) => a + b, 0);
  const g2 = loadFromString(serialize(g)).game;
  const po = [...g2.memoryOf(g2.player)].reduce((a, b) => a + b, 0);
  assert.equal(po, przed);
  assert.deepEqual(g2.player.inventory.map(i => i.type), g.player.inventory.map(i => i.type));
});

test('zapis uszkodzony i obcy są odrzucane, a nie wywracają gry', () => {
  for (const zly of ['', '{', 'null', '[]', '{"format":99}', '{"format":1}', '{"format":1,"levels":null}']) {
    const r = loadFromString(zly);
    assert.equal(r.ok, false, `przyjęto zły zapis: ${zly}`);
    assert.ok(typeof r.error === 'string' && r.error.length > 0, 'brak czytelnego komunikatu');
  }
});

test('zapis na dysk i odczyt z dysku', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rogue-'));
  const path = join(dir, 'zapis.json');
  const g = graj(new Game('dysk'), 120);
  saveToFile(g, path);
  const r = loadFromFile(path);
  assert.ok(r.ok, r.error);
  assert.equal(fingerprint(r.game), fingerprint(g));
  assert.equal(loadFromFile(join(dir, 'nie-ma.json')).ok, false);
  writeFileSync(path, 'to nie jest json');
  assert.equal(loadFromFile(path).ok, false);
});

test('KONTROLA PRZYRZĄDU: odcisk wykrywa różnicę ukrytą w stanie generatora', () => {
  // Dwie gry o identycznym WIDOCZNYM stanie, różniące się tylko dalszym ciągiem
  // losowania. Gdyby odcisk tego nie łapał, kryterium "nieodróżnialny" byłoby puste.
  const g = graj(new Game('kontrola-odcisk'), 100);
  const kopia = loadFromString(serialize(g)).game;
  assert.equal(fingerprint(kopia), fingerprint(g));
  kopia.rng.int(1000); // jedno pobranie z generatora, świat bez zmian
  assert.equal(kopia.player.hp, g.player.hp);
  assert.equal(kopia.turn, g.turn);
  assert.notEqual(fingerprint(kopia), fingerprint(g), 'odcisk nie widzi zmiany stanu generatora');
});
