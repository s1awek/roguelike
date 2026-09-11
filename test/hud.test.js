// Panel stanu w przeglądarce: ikony rysowane kodem, postęp doświadczenia,
// pasek sytości z ikoną i podpisem. Sam układ (zawijanie, szerokości)
// sprawdza skrypt przeglądarkowy w katalogu roboczym, nie ten plik.
import test from 'node:test';
import assert from 'node:assert/strict';
import { IKONY, ikona } from '../web/ikony.js';
import { postepDosw, stanyHtml } from '../web/opis.js';
import { xpForLevel } from '../src/game.js';
import { t, getLang } from '../src/i18n.js';

test('ikony: każda jest SVG w currentColor, nieznana nazwa daje pusty napis', () => {
  const nazwy = Object.keys(IKONY);
  assert.ok(nazwy.length >= 9, `za mało ikon: ${nazwy.join(', ')}`);
  for (const n of nazwy) {
    assert.match(IKONY[n], /^<svg [^>]*viewBox="0 0 16 16"/, n);
    assert.match(IKONY[n], /stroke="currentColor"/, n);
    assert.match(IKONY[n], /aria-hidden="true"/, n);
    assert.ok(IKONY[n].endsWith('</svg>'), n);
  }
  for (const wymagana of ['serce', 'chleb', 'gwiazda', 'iskra', 'miecz', 'tarcza', 'schody', 'czaszka', 'klepsydra']) {
    assert.ok(IKONY[wymagana], `brak ikony ${wymagana}`);
  }
  assert.equal(ikona('serce'), `<i class="ikona">${IKONY.serce}</i>`);
  assert.equal(ikona('nie-ma-takiej'), '');
});

test('postęp doświadczenia liczy się od progu bieżącego poziomu, nie od zera', () => {
  // Świeży bohater: 0 z 10 do drugiego poziomu.
  assert.deepEqual(postepDosw({ level: 1, xp: 0 }), { xp: 0, prog: xpForLevel(2), frakcja: 0 });
  // Tuż po awansie na 2. poziom pasek jest pusty, a nie prawie pełny.
  const p2 = postepDosw({ level: 2, xp: xpForLevel(2) });
  assert.equal(p2.frakcja, 0);
  assert.equal(p2.prog, xpForLevel(3));
  // W połowie drogi między progami.
  const srodek = (xpForLevel(2) + xpForLevel(3)) / 2;
  assert.ok(Math.abs(postepDosw({ level: 2, xp: srodek }).frakcja - 0.5) < 1e-9);
  // Nigdy poza [0, 1], nawet przy niespójnych danych.
  assert.equal(postepDosw({ level: 2, xp: 0 }).frakcja, 0);
  assert.equal(postepDosw({ level: 2, xp: 10_000 }).frakcja, 1);
});

test('pasek sytości niesie ikonę, słowo stanu i podpis w języku czytelnika', () => {
  const html = stanyHtml({ hunger: 320 });
  assert.match(html, /<svg /);
  assert.match(html, /class="poz stan /);
  assert.ok(html.includes(`<em>${t('stan.glod.nazwa', {}, getLang())}</em>`), html);
  assert.ok(!html.includes('class="lbl"'), 'stary podpis wielkimi literami ma zniknąć');
});
