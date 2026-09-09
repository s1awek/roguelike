import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RNG, hashSeed } from '../src/rng.js';

test('to samo ziarno daje ten sam ciąg', () => {
  const a = new RNG('ziarno'), b = new RNG('ziarno');
  const x = Array.from({ length: 200 }, () => a.int(10000));
  const y = Array.from({ length: 200 }, () => b.int(10000));
  assert.deepEqual(x, y);
});

test('różne ziarna dają różne ciągi', () => {
  const a = Array.from({ length: 50 }, (_, i) => new RNG(`z${i}`).int(1e9));
  assert.equal(new Set(a).size, 50, 'ziarna dały powtórzenia');
});

test('ziarno liczbowe i tekstowe działają tak samo stabilnie', () => {
  assert.equal(new RNG(42).int(1e6), new RNG(42).int(1e6));
  assert.equal(hashSeed('abc'), hashSeed('abc'));
});

test('stan generatora da się zapisać i odtworzyć', () => {
  const a = new RNG('stan');
  for (let i = 0; i < 37; i++) a.int(100);
  const b = RNG.fromState(a.getState());
  assert.deepEqual(
    Array.from({ length: 50 }, () => a.int(1e6)),
    Array.from({ length: 50 }, () => b.int(1e6)));
});

test('rozkład int(n) jest równomierny w granicach szumu', () => {
  const r = new RNG('rozklad');
  const N = 120000, K = 12;
  const buckets = new Array(K).fill(0);
  for (let i = 0; i < N; i++) buckets[r.int(K)]++;
  const expected = N / K;
  const sd = Math.sqrt(N * (1 / K) * (1 - 1 / K));
  for (const b of buckets) {
    assert.ok(Math.abs(b - expected) < 5 * sd, `kubełek ${b} odstaje od ${expected} o ponad 5 odchyleń`);
  }
});

test('KONTROLA PRZYRZĄDU: zepsuty generator zostaje wykryty', () => {
  // Generator zwracający stałą przechodzi test powtarzalności, ale MUSI oblać
  // test rozkładu. Gdyby oblewał tylko powtarzalność, test rozkładu byłby ozdobą.
  const stuck = { int: () => 3 };
  const K = 12, N = 12000;
  const buckets = new Array(K).fill(0);
  for (let i = 0; i < N; i++) buckets[stuck.int(K)]++;
  const expected = N / K;
  const sd = Math.sqrt(N * (1 / K) * (1 - 1 / K));
  const wykryty = buckets.some(b => Math.abs(b - expected) >= 5 * sd);
  assert.ok(wykryty, 'test rozkładu przepuścił generator zwracający stałą');
});
