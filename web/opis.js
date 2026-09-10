import { polaSlowo } from '../src/items.js';

// Wspólny kawałek widoku dla obu wersji przeglądarkowych: skutek przedmiotu
// i różnica wobec noszonego, w jednym kształcie. Treść liczb pochodzi
// z `src/items.js` (itemStats) - tutaj jest wyłącznie oprawa.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Znacznik ze skutkiem przedmiotu; pusty napis, gdy nie ma czego pokazać. */
export function statsHtml(st) {
  if (!st || !st.opis) return '';
  const roznica = st.porownanie
    ? ` <em class="cmp ${st.znak}">${esc(st.porownanie)}</em>`
    : '';
  return `<span class="st">${esc(st.opis)}${roznica}</span>`;
}

/**
 * Karta obejrzanej rzeczy. Treść w całości pochodzi z `src/ocena.js`, więc
 * przeglądarka i terminal odpowiadają na pytanie „brać czy nie brać" tymi
 * samymi zdaniami - tutaj jest wyłącznie oprawa.
 */
export function obejrzyjHtml(nazwa, o) {
  if (!o) return '<p class="muted">Nie ma tu nic do obejrzenia.</p>';
  const w = [];
  if (o.opis) w.push(`<li><span class="etyk">skutek</span> ${esc(o.opis)}</li>`);
  if (o.porownanie) {
    w.push(`<li><span class="etyk">wobec noszonego</span> <em class="cmp ${o.znak}">${esc(o.porownanie)}</em></li>`);
  }
  w.push(`<li><span class="etyk">miejsce</span> ${esc(o.miejsce)} = ${o.pola} ${polaSlowo(o.pola)}`
    + (o.wPlecaku ? '' : `, wolnych ${o.wolne} z ${o.pojemnosc}`) + '</li>');
  if (o.sztuk > 1) w.push(`<li><span class="etyk">sztuk</span> ${o.sztuk}</li>`);
  return `<h2>${esc(nazwa)}</h2><ul class="karta">${w.join('')}</ul>`
    + (o.werdykt ? `<p class="werdykt ${o.ton}">${esc(o.werdykt)}</p>` : '');
}
