// Podpis pod grą - JEDNO miejsce na dane autora i odsyłacze.
//
// Stopka pokazuje wyłącznie to, co jest tu wypełnione: puste pole znaczy brak
// odsyłacza, nie pusty odsyłacz. Dzięki temu strona nigdy nie wychodzi
// z zaślepką w treści, a dopisanie adresu jest zmianą jednej linii.

export const AUTOR = {
  imie: 'Sławek',
  rok: 2026,
  portfolio: '',   // adres wizytówki autora
  repo: '',        // adres repozytorium z kodem
};

/** Wstawia stopkę do wskazanego elementu. Nic nie robi, gdy nie ma czego wstawić. */
export function podpisz(el) {
  if (!el) return;
  const czesci = [`${AUTOR.imie}, ${AUTOR.rok}`];
  if (AUTOR.portfolio) czesci.push(`<a href="${AUTOR.portfolio}" rel="author">o autorze</a>`);
  if (AUTOR.repo) czesci.push(`<a href="${AUTOR.repo}" rel="noreferrer">kod źródłowy</a>`);
  el.innerHTML = czesci.join(' <span class="sep">·</span> ');
  el.hidden = false;
}
