// Tryb nieśmiertelności (parametr testowy przeglądarki): bohater nie ginie
// ani od ciosów, ani z głodu, a bez flagi gra toczy się dokładnie jak dotąd.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, HUNGER_START } from '../src/game.js';
import { fingerprint, serialize, loadFromString } from '../src/save.js';

test('nieśmiertelny: życie wraca do pełna, głód nie zabija, partia trwa', () => {
  const g = new Game('bog-1');
  g.player.niesmiertelny = true;
  g.player.hp = 1;
  g.player.hunger = 0;
  for (let i = 0; i < 60; i++) g.act({ type: 'wait' });
  assert.equal(g.status, 'playing');
  assert.equal(g.player.hp, g.player.maxHp);
  assert.ok(g.player.hunger >= HUNGER_START - 1, `sytość ${g.player.hunger}`);
});

test('bez flagi ta sama partia ginie z głodu, a odcisk gry nie zależy od pola', () => {
  const g = new Game('bog-1');
  g.player.hp = 1;
  g.player.hunger = 0;
  for (let i = 0; i < 60 && g.status === 'playing'; i++) g.act({ type: 'wait' });
  assert.equal(g.status, 'dead');
  const a = new Game('bog-2'), b = new Game('bog-2');
  b.player.niesmiertelny = false;
  for (let i = 0; i < 50; i++) { a.act({ type: 'wait' }); b.act({ type: 'wait' }); }
  assert.equal(fingerprint(a), fingerprint(b));
});

test('flaga jedzie w zapisie i wraca po wczytaniu', () => {
  const g = new Game('bog-3');
  g.player.niesmiertelny = true;
  const r = loadFromString(serialize(g));
  assert.ok(r.ok);
  assert.equal(r.game.player.niesmiertelny, true);
});
