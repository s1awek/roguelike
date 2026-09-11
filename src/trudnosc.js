/**
 * Stopnie trudności (D-055). Jedna tablica, z której czyta silnik, księga
 * zasad i interfejsy - liczby w księdze nie są przepisywane ręcznie (D-021).
 *
 * `normalny` to gra wzorcowa: te liczby dają dokładnie partię sprzed
 * wprowadzenia stopni (mnożniki 1 nie ruszają ani strumienia losowego, ani
 * zaokrągleń), więc równowaga zmierzona na tysiącu partii zostaje w mocy.
 *
 *  - `pietra`  - liczba pięter; przeciwnik ostateczny i Amulet zawsze na dnie.
 *  - `potwory` - mnożnik życia i siły każdego potwora (także ostatecznego).
 *  - `glod`    - mnożnik sytości startowej i pożywności jedzenia; większy
 *                znaczy wolniejszy głód.
 *
 * Nazwy stopni są polskimi identyfikatorami jak wszystko w stanie gry (D-051);
 * brzmienie w języku gracza daje słownik (`trudnosc.<stopien>`).
 */
export const TRUDNOSCI = {
  latwy:    { nazwa: 'łatwy',    pietra: 6,  potwory: 0.8, glod: 1.25 },
  normalny: { nazwa: 'normalny', pietra: 8,  potwory: 1,   glod: 1 },
  trudny:   { nazwa: 'trudny',   pietra: 10, potwory: 1.1, glod: 0.9 },
};

export const DOMYSLNA_TRUDNOSC = 'normalny';

/** Nazwy, pod którymi stopień wolno podać z zewnątrz (adres, flaga). */
const ALIASY = {
  easy: 'latwy', normal: 'normalny', hard: 'trudny',
  latwy: 'latwy', normalny: 'normalny', trudny: 'trudny',
};

/** Stopień z nazwy angielskiej albo polskiej; `null`, gdy nieznana. */
export function ustalTrudnosc(x) {
  return ALIASY[String(x ?? '').trim().toLowerCase()] ?? null;
}

export function znanaTrudnosc(x) { return Object.hasOwn(TRUDNOSCI, x); }

/**
 * Wzmacnia (albo osłabia) świeżo stworzonego potwora. Życie i siła, nic więcej:
 * obrona i doświadczenie zostają, żeby tabela w księdze dalej mówiła prawdę
 * o tym, ile za kogo się dostaje. Mnożnik 1 nie dotyka niczego.
 */
export function wzmocnij(m, mnoznik) {
  if (mnoznik === 1) return m;
  m.maxHp = Math.max(1, Math.round(m.maxHp * mnoznik));
  m.hp = m.maxHp;
  m.str = Math.max(1, Math.round(m.str * mnoznik));
  return m;
}
