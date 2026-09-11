// Język interfejsu w przeglądarce (D-051).
//
// Kolejność pierwszeństwa: adres (`?lang=pl`, do podlinkowania z portfolio),
// potem wybór zapamiętany w tej przeglądarce, na końcu angielski. Zmiana języka
// NIE dotyka stanu gry - przełącza wyłącznie to, jak gra jest opisywana. Wpisy
// dziennika sprzed zmiany zostają w starym języku, bo dziennik trzyma gotowe
// zdania, a nie klucze.

import { setLang, getLang, znanyJezyk, LANGS, DOMYSLNY, t } from '../src/i18n.js';

const KLUCZ = 'roguelike:lang';
const przelaczniki = [];

function zapamietany() {
  try { return localStorage.getItem(KLUCZ); } catch { return null; }
}
function zapamietaj(l) {
  try { localStorage.setItem(KLUCZ, l); } catch { /* bez pamięci wybór trwa do odświeżenia */ }
}

/** Ustala język na starcie strony. Wołać PRZED pierwszym narysowaniem czegokolwiek. */
export function ustalJezyk() {
  const zAdresu = znanyJezyk(new URLSearchParams(location.search).get('lang'));
  const l = zAdresu || znanyJezyk(zapamietany()) || DOMYSLNY;
  // Wejście z adresem to też wybór - ma przeżyć przejście na drugą stronę gry.
  if (zAdresu) zapamietaj(zAdresu);
  setLang(l);
  document.documentElement.lang = l;
  przetlumaczStrone();
  return l;
}

/**
 * Stałe napisy strony. Atrybut mówi, co tłumaczyć: `data-t` treść jako tekst,
 * `data-t-html` treść ze znacznikami (tylko dla tekstów z naszego słownika),
 * `data-t-title` i `data-t-placeholder` odpowiednie atrybuty.
 */
export function przetlumaczStrone(root = document) {
  root.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  root.querySelectorAll('[data-t-html]').forEach(el => { el.innerHTML = t(el.dataset.tHtml); });
  root.querySelectorAll('[data-t-title]').forEach(el => { el.title = t(el.dataset.tTitle); });
  root.querySelectorAll('[data-t-placeholder]').forEach(el => { el.placeholder = t(el.dataset.tPlaceholder); });
}

function rysuj(el) {
  const biezacy = getLang();
  el.innerHTML = LANGS.map(l => `<button type="button" data-lang="${l}" class="${l === biezacy ? 'on' : ''}"`
    + ` aria-pressed="${l === biezacy}" lang="${l}">${l.toUpperCase()}</button>`).join('');
  el.title = t('web.jezyk');
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', t('web.jezyk'));
}

/** Zmiana języka bez przeładowania strony. */
export function zmienJezyk(l) {
  if (!znanyJezyk(l) || l === getLang()) return false;
  setLang(l);
  zapamietaj(l);
  document.documentElement.lang = l;
  // Adres z `?lang=` wygrywa z pamięcią, więc po zmianie trzeba go poprawić -
  // inaczej odświeżenie strony cofałoby wybór, który gracz właśnie zrobił.
  const u = new URL(location.href);
  if (u.searchParams.has('lang')) { u.searchParams.set('lang', l); history.replaceState(history.state, '', u); }
  przetlumaczStrone();
  przelaczniki.forEach(rysuj);
  return true;
}

/**
 * Przełącznik EN | PL. `poZmianie` przerysowuje to, co strona zbudowała sama
 * (panel stanu, otwarta nakładka) - stałe napisy tłumaczy już `zmienJezyk`.
 */
export function przelacznik(el, poZmianie) {
  if (!el) return;
  przelaczniki.push(el);
  rysuj(el);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-lang]');
    if (!b) return;
    // Przycisk z fokusem przejmowałby Enter i spację, którymi gra się steruje.
    b.blur();
    if (zmienJezyk(b.dataset.lang)) poZmianie?.(getLang());
  });
}
