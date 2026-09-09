// Deterministyczny generator pseudolosowy (xorshift128).
//
// Powód istnienia zamiast Math.random: kryterium 1 spec-a wymaga, żeby to samo
// ziarno dawało tę samą rozgrywkę. Math.random nie da się zasiać ani zapisać.
// Stan jest serializowalny, bo zapis gry musi odtworzyć także DALSZY CIĄG losowania
// (kryterium 5), nie tylko widoczny stan świata.

const U32 = 0x100000000;

function splitmix32(a) {
  return function () {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

/** FNV-1a: ziarno tekstowe -> liczba. Pozwala na ziarna typu "gracz-1". */
export function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const s = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class RNG {
  constructor(seed = 0) {
    this.seed = seed;
    const sm = splitmix32(hashSeed(seed));
    this.s = [sm(), sm(), sm(), sm()];
    // odrzucenie kilku pierwszych wartości - rozgrzewa stan przy ziarnach bliskich zeru
    for (let i = 0; i < 12; i++) this.next();
  }

  /** Kolejna liczba 32-bitowa bez znaku. */
  next() {
    let [a, b, c, d] = this.s;
    const t = (b << 9) >>> 0;
    c = (c ^ a) >>> 0;
    d = (d ^ b) >>> 0;
    b = (b ^ c) >>> 0;
    a = (a ^ d) >>> 0;
    c = (c ^ t) >>> 0;
    d = (((d << 11) | (d >>> 21)) >>> 0);
    this.s = [a, b, c, d];
    return (((a + d) >>> 0) + 0) >>> 0;
  }

  /** Liczba z przedziału [0,1). */
  float() { return this.next() / U32; }

  /** Liczba całkowita z [0, n). Bez modulo-bias przy rozsądnych n. */
  int(n) {
    if (n <= 0) return 0;
    return Math.floor(this.float() * n);
  }

  /** Liczba całkowita z [min, max] włącznie. */
  range(min, max) {
    if (max < min) [min, max] = [max, min];
    return min + this.int(max - min + 1);
  }

  /** Zdarzenie o prawdopodobieństwie p. */
  chance(p) { return this.float() < p; }

  /** Losowy element tablicy. */
  pick(arr) { return arr[this.int(arr.length)]; }

  /** Losowy element z wagami: [[element, waga], ...]. */
  weighted(pairs) {
    let total = 0;
    for (const [, w] of pairs) total += w;
    let r = this.float() * total;
    for (const [item, w] of pairs) {
      r -= w;
      if (r < 0) return item;
    }
    return pairs[pairs.length - 1][0];
  }

  /** Tasowanie w miejscu (Fisher-Yates). */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Suma k rzutów kością o d ścianach plus modyfikator - zapis "2d6+1". */
  dice(k, d, mod = 0) {
    let sum = mod;
    for (let i = 0; i < k; i++) sum += 1 + this.int(d);
    return sum;
  }

  getState() { return { seed: this.seed, s: [...this.s] }; }

  setState(st) {
    this.seed = st.seed;
    this.s = [...st.s];
    return this;
  }

  static fromState(st) {
    const r = new RNG(0);
    return r.setState(st);
  }
}
