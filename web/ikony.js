// Ikony panelu stanu rysowane kodem (SVG w napisie), bez plików graficznych.
// Jeden zestaw dla obu stron przeglądarkowych. Kreska idzie w `currentColor`,
// więc ikona dziedziczy kolor po sąsiednim napisie i w każdym tonie wygląda
// tak samo; rozmiar ustala CSS, nie atrybuty.

const SVG = (tresc) => '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor"'
  + ` stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${tresc}</svg>`;

export const IKONY = {
  serce: SVG('<path d="M8 13.6 3.3 8.9a2.9 2.9 0 0 1 4.1-4.1l.6.6.6-.6a2.9 2.9 0 0 1 4.1 4.1z"/>'),
  chleb: SVG('<path d="M2.5 8.2a5.5 4.2 0 0 1 11 0V13H2.5z"/><path d="M5.5 7.6v2M8 7v2M10.5 7.6v2"/>'),
  gwiazda: SVG('<path d="m8 1.9 1.9 3.9 4.2.6-3 3 .7 4.2L8 11.6l-3.8 2 .7-4.2-3-3 4.2-.6z"/>'),
  iskra: SVG('<path d="M8 2.2 9.5 6.5 13.8 8 9.5 9.5 8 13.8 6.5 9.5 2.2 8l4.3-1.5z"/>'),
  miecz: SVG('<path d="M13.2 2.8 6.3 9.7M11.4 2.4l2.2 2.2M4.6 8.2l3.2 3.2M5.7 11.1l-2.9 2.9M3.6 9.6l2.8 2.8"/>'),
  tarcza: SVG('<path d="M8 1.9l5.4 2v4.1c0 3.1-2.2 5.5-5.4 6.6-3.2-1.1-5.4-3.5-5.4-6.6V3.9z"/>'),
  schody: SVG('<path d="M2 14h3v-3h3V8h3V5h3V2"/>'),
  czaszka: SVG('<path d="M8 1.9a5 5 0 0 0-5 5c0 1.7.8 3.1 2 4v2.3h6V10.9c1.2-.9 2-2.3 2-4a5 5 0 0 0-5-5z"/>'
    + '<circle cx="6.1" cy="7.4" r="1" fill="currentColor" stroke="none"/><circle cx="9.9" cy="7.4" r="1" fill="currentColor" stroke="none"/>'
    + '<path d="M7 13.2v1M9 13.2v1"/>'),
  klepsydra: SVG('<path d="M4 2h8M4 14h8M5 2c0 3.4 3 4.4 3 6s-3 2.6-3 6M11 2c0 3.4-3 4.4-3 6s3 2.6 3 6"/>'),
  amulet: SVG('<circle cx="8" cy="9.5" r="3.3"/><path d="M8 1.6v2.4M4.3 6.4 2.9 5M11.7 6.4l1.4-1.4"/>'),
};

/** Ikona jako napis HTML do wstawienia w szablon; nieznana nazwa daje pusty napis, nie wyjątek. */
export function ikona(nazwa) {
  return IKONY[nazwa] ? `<i class="ikona">${IKONY[nazwa]}</i>` : '';
}

/** Wypełnia w drzewie każde `<i class="ikona" data-ikona="…">` - znaczniki w HTML nie niosą SVG. */
export function wstawIkony(root = document) {
  root.querySelectorAll('i.ikona[data-ikona]').forEach((el) => { el.innerHTML = IKONY[el.dataset.ikona] || ''; });
}
