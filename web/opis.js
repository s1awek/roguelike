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
