// Przestrzeń w plecaku.
//
// Miejsce przestało być liczbą sztuk, a stało się polem: rzeczy mają kształt
// i trzeba je ułożyć. Ten moduł zna WYŁĄCZNIE geometrię i stosy - nie wie nic
// o turach, potworach ani o tym, kto patrzy. Dzięki temu daje się sprawdzić bez
// uruchamiania gry, a wersja graficzna i terminalowa działają na jednej regule
// (interfejsy różnią się tym, KTO układa, a nie tym, CO się mieści).

import { ksztaltBazowy } from './items.js';

/** Wymiary startowego plecaka. Głębiej da się znaleźć większy. */
export const PLECAK_START = { w: 5, h: 4 };

/** Ile sztuk wchodzi na jedno pole. Rzeczy nieujęte tu nie łączą się nigdy. */
export const LIMIT_STOSU = { potion: 4, scroll: 4, food: 2 };

export { ksztaltBazowy };

/** Wymiary po uwzględnieniu obrotu o ćwierć obrotu. */
export function wymiary(it) {
  const [w, h] = ksztaltBazowy(it);
  return it.obrot ? { w: h, h: w } : { w, h };
}

/** Ile pól zajmuje rzecz. Stos zajmuje tyle samo co sztuka - o to w nim chodzi. */
export function poleRzeczy(it) { const { w, h } = wymiary(it); return w * h; }

export function pojemnosc(hero) { return hero.plecak.w * hero.plecak.h; }
export function zajetePola(hero) {
  return hero.inventory.reduce((s, i) => s + poleRzeczy(i), 0);
}
export function wolnePola(hero) { return pojemnosc(hero) - zajetePola(hero); }

/**
 * Zajętość pól: tablica id rzeczy albo null. `pomijaj` pozwala policzyć siatkę
 * tak, jakby danej rzeczy w plecaku nie było - to jest przypadek przekładania.
 */
export function siatka(hero, pomijaj = null) {
  const { w, h } = hero.plecak;
  const pola = new Array(w * h).fill(null);
  for (const it of hero.inventory) {
    if (it === pomijaj || !Number.isInteger(it.px)) continue;
    const r = wymiary(it);
    for (let dy = 0; dy < r.h; dy++) {
      for (let dx = 0; dx < r.w; dx++) {
        const x = it.px + dx, y = it.py + dy;
        if (x >= 0 && x < w && y >= 0 && y < h) pola[y * w + x] = it.id;
      }
    }
  }
  return pola;
}

/** Czy rzecz zmieści się rogiem w (x, y) przy danym obrocie. */
export function mozna(hero, it, x, y, obrot = it.obrot || 0, pomijaj = it) {
  const [bw, bh] = ksztaltBazowy(it);
  const w = obrot ? bh : bw, h = obrot ? bw : bh;
  const P = hero.plecak;
  if (x < 0 || y < 0 || x + w > P.w || y + h > P.h) return false;
  const pola = siatka(hero, pomijaj);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (pola[(y + dy) * P.w + (x + dx)] !== null) return false;
    }
  }
  return true;
}

/** Kładzie rzecz w podanym miejscu. Zwraca false, gdy się nie mieści. */
export function poloz(hero, it, x, y, obrot = 0) {
  if (!mozna(hero, it, x, y, obrot)) return false;
  it.px = x; it.py = y; it.obrot = obrot ? 1 : 0;
  return true;
}

/**
 * Pierwsze wolne miejsce, czytając od lewego górnego rogu. Obrót brany pod uwagę
 * dopiero wtedy, gdy bez obrotu nie ma miejsca - dzięki temu automat układa
 * rzeczy tak, jak człowiek by je położył, a nie na przekór.
 */
export function znajdzMiejsce(hero, it, pomijaj = it) {
  const [bw, bh] = ksztaltBazowy(it);
  const obroty = bw === bh ? [0] : [0, 1];
  for (const obrot of obroty) {
    const w = obrot ? bh : bw, h = obrot ? bw : bh;
    for (let y = 0; y + h <= hero.plecak.h; y++) {
      for (let x = 0; x + w <= hero.plecak.w; x++) {
        if (mozna(hero, it, x, y, obrot, pomijaj)) return { x, y, obrot };
      }
    }
  }
  return null;
}

/**
 * Przekłada CAŁĄ zawartość od nowa, od największych rzeczy. Potrzebne po
 * powiększeniu plecaka i przy wczytywaniu starego zapisu, w którym rzeczy nie
 * mają jeszcze położeń. Przy niepowodzeniu przywraca stan sprzed próby, bo
 * połowicznie przepakowany plecak byłby gorszy niż nieprzepakowany.
 */
export function przepakuj(hero) {
  const kopia = hero.inventory.map(i => ({ px: i.px, py: i.py, obrot: i.obrot }));
  const kolejnosc = [...hero.inventory].sort((a, b) => {
    const ra = wymiary(a), rb = wymiary(b);
    return (rb.w * rb.h) - (ra.w * ra.h) || Math.max(rb.w, rb.h) - Math.max(ra.w, ra.h);
  });
  for (const it of hero.inventory) { it.px = undefined; it.py = undefined; }
  for (const it of kolejnosc) {
    const m = znajdzMiejsce(hero, it);
    if (!m) {
      hero.inventory.forEach((i, k) => { i.px = kopia[k].px; i.py = kopia[k].py; i.obrot = kopia[k].obrot; });
      return false;
    }
    it.px = m.x; it.py = m.y; it.obrot = m.obrot;
  }
  return true;
}

/**
 * Klucz stosu: rzeczy łączą się TYLKO wtedy, gdy gracz ich nie rozróżnia.
 * Dlatego kluczem jest etykieta widziana przez gracza, a nie rodzaj - dwie
 * mikstury o różnym wyglądzie nie mogą wpaść na jedno pole, bo samo połączenie
 * zdradzałoby, że są tym samym. Rzeczy spoza `LIMIT_STOSU` nie łączą się nigdy.
 */
export function kluczStosu(it, etykieta) {
  if (!LIMIT_STOSU[it.kind]) return null;
  return `${it.kind}|${etykieta}`;
}

/** Ile sztuk niesie wpis (stos albo pojedyncza rzecz). */
export const ile = (it) => it.ile || 1;

/**
 * Czy rzecz w ogóle da się wziąć - do stosu albo na wolne pole. Nie zmienia
 * niczego, więc wolno tego używać do decyzji (gracz automatyczny) i do podpowiedzi
 * w interfejsie. Odpowiada na to samo pytanie co `dolozDoPlecaka`, żeby decyzja
 * i skutek nie mogły się rozjechać.
 */
export function zmiesciSie(hero, it, etykietaDla) {
  const klucz = kluczStosu(it, etykietaDla(it));
  if (klucz) {
    const limit = LIMIT_STOSU[it.kind];
    if (hero.inventory.some(w => kluczStosu(w, etykietaDla(w)) === klucz && ile(w) < limit)) return true;
  }
  return !!znajdzMiejsce(hero, it, null);
}

/**
 * Próba dołożenia rzeczy do plecaka: najpierw do istniejących stosów, potem na
 * wolne pole. Zwraca, ile sztuk udało się zabrać - reszta zostaje u wołającego.
 * Nic nie znika: to jest jedyne wejście dla podnoszenia, więc odpowiedzialność
 * za „nie zgubić" siedzi w jednym miejscu.
 */
export function dolozDoPlecaka(hero, it, etykietaDla) {
  const klucz = kluczStosu(it, etykietaDla(it));
  let zostalo = ile(it);
  let wziete = 0;

  if (klucz) {
    const limit = LIMIT_STOSU[it.kind];
    for (const w of hero.inventory) {
      if (zostalo <= 0) break;
      if (kluczStosu(w, etykietaDla(w)) !== klucz) continue;
      const miejsce = limit - ile(w);
      if (miejsce <= 0) continue;
      const bierze = Math.min(miejsce, zostalo);
      w.ile = ile(w) + bierze;
      zostalo -= bierze; wziete += bierze;
    }
  }

  while (zostalo > 0) {
    const m = znajdzMiejsce(hero, it, null);
    if (!m) break;
    const limit = klucz ? LIMIT_STOSU[it.kind] : 1;
    const bierze = Math.min(limit, zostalo);
    const nowy = { ...it, px: m.x, py: m.y, obrot: m.obrot, ile: bierze };
    delete nowy.x; delete nowy.y;
    if (bierze === 1) delete nowy.ile;
    hero.inventory.push(nowy);
    zostalo -= bierze; wziete += bierze;
  }
  return wziete;
}
