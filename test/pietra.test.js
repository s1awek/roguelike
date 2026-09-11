// Ostatnie piętro to koniec lochu (W-29): nie ma z niego zejścia, a próba
// zejścia po zapisie sprzed tej zmiany też się nie udaje.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, MAX_DEPTH } from '../src/game.js';
import { STAIRS_DOWN, STAIRS_UP } from '../src/map.js';
import { serialize, loadFromString } from '../src/serialize.js';
import { base64ToBytes, bytesToBase64 } from '../src/bytes.js';

function naPietrze(seed, depth) {
  const g = new Game(seed);
  g.enterLevel(depth, 'down');
  return g;
}

test('ostatnie piętro nie ma schodów w dół, a zejście z niego jest niemożliwe', () => {
  for (const seed of ['dno-a', 'dno-b', 'dno-c', 'dno-d', 'dno-e']) {
    const g = naPietrze(seed, MAX_DEPTH);
    const L = g.level;
    let zejscia = 0;
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (L.at(x, y) === STAIRS_DOWN) zejscia++;
    assert.equal(zejscia, 0, `${seed}: na dnie są schody w dół`);
    assert.equal(L.at(L.upPos.x, L.upPos.y), STAIRS_UP, 'schody w górę muszą zostać');
    // stanięcie tam, gdzie zejście stałoby na innym piętrze, nic nie daje
    g.player.x = L.downPos.x; g.player.y = L.downPos.y;
    assert.equal(g.descend(), false);
    assert.equal(g.depth, MAX_DEPTH);
  }
});

test('KONTROLA PRZYRZĄDU: piętro przedostatnie ma dokładnie jedno zejście i da się nim zejść', () => {
  const g = naPietrze('dno-kontrola', MAX_DEPTH - 1);
  const L = g.level;
  let zejscia = 0;
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (L.at(x, y) === STAIRS_DOWN) zejscia++;
  assert.equal(zejscia, 1);
  g.player.x = L.downPos.x; g.player.y = L.downPos.y;
  assert.equal(g.descend(), true);
  assert.equal(g.depth, MAX_DEPTH);
});

test('zapis sprzed W-29 z prawdziwymi schodami na dnie: zejście nadal odmawia', () => {
  const g = naPietrze('dno-stary-zapis', MAX_DEPTH);
  const dane = JSON.parse(serialize(g));
  // Podstawiamy stary stan: kafel schodów w dół z powrotem na dnie.
  const e = dane.levels[String(MAX_DEPTH)];
  const kafle = base64ToBytes(e.level.tiles);
  kafle[e.level.downPos.y * e.level.w + e.level.downPos.x] = STAIRS_DOWN;
  e.level.tiles = bytesToBase64(kafle);
  const r = loadFromString(JSON.stringify(dane));
  assert.ok(r.ok, r.error);
  const g2 = r.game;
  g2.player.x = g2.level.downPos.x; g2.player.y = g2.level.downPos.y;
  assert.equal(g2.level.at(g2.player.x, g2.player.y), STAIRS_DOWN, 'podstawienie nie zadziałało');
  assert.equal(g2.descend(), false);
  assert.equal(g2.depth, MAX_DEPTH);
});
