// Języki gry (D-050). Angielski jest domyślny, polski do wyboru.
//
// Zasada, która trzyma to w ryzach: tłumaczenie odbywa się NA KRAWĘDZI.
// Silnik, zapis gry i identyfikatory wewnętrzne (nazwy w tablicach, wygląd
// mikstur, przyczyna śmierci) zostają takie, jakie były - zmienia się wyłącznie
// to, jak gra je NAZYWA w chwili pokazania graczowi. Dzięki temu zapis zrobiony
// w jednym języku wczytuje się w drugim, a rozgrywka nie może zależeć od języka,
// bo języka nie ma w żadnym miejscu, które ją liczy.
//
// Moduł bez `node:` - ładuje go i terminal, i przeglądarka.

import { PL } from './lang/pl.js';
import { EN, NAZWY_EN } from './lang/en.js';

export const LANGS = ['en', 'pl'];
export const DOMYSLNY = 'en';

export const SLOWNIKI = { en: EN, pl: PL };

let biezacy = DOMYSLNY;

/** Ustawia język bieżący. Nieznany kod zostawia język bez zmiany. */
export function setLang(lang) {
  if (LANGS.includes(lang)) biezacy = lang;
  return biezacy;
}
export function getLang() { return biezacy; }
export function znanyJezyk(lang) { return LANGS.includes(lang) ? lang : null; }

/**
 * Tłumaczenie klucza. Parametry będące funkcjami są wywoływane z kodem języka -
 * tak przekazuje się nazwy, które same zależą od języka (potwór, rzecz).
 *
 * Brakujący klucz wraca jako SAM KLUCZ, a nie jako tekst z drugiego języka.
 * Cicha podmiana na polski schowałaby brak przed graczem i przed testem.
 */
export function t(klucz, p = {}, lang = biezacy) {
  const slownik = SLOWNIKI[lang] || SLOWNIKI[DOMYSLNY];
  const v = slownik[klucz];
  if (v === undefined) return klucz;
  if (typeof v !== 'function') return v;
  const rozwiniete = {};
  for (const k of Object.keys(p)) rozwiniete[k] = typeof p[k] === 'function' ? p[k](lang) : p[k];
  return v(rozwiniete);
}

/**
 * Nazwa rodzaju w danym języku. Po polsku jest nią pole `name` z tablicy gry
 * (to ono stoi w zapisach), po angielsku wpis w słowniku nazw.
 */
export function nazwaRodzaju(klucz, polska, lang = biezacy) {
  if (lang === 'pl') return polska;
  return NAZWY_EN[klucz] ?? polska;
}
