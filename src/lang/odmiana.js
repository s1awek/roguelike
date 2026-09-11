// Drobne reguły gramatyczne obu języków. Osobny plik, bo potrzebują ich
// i słowniki, i `src/items.js` - a słowniki nie mogą importować tablic gry,
// inaczej powstałby cykl importów.

/** Odmiana słowa „pole" - napis z błędem gramatycznym czyta się jak usterka. */
export function polaSlowo(n) {
  const a = Math.abs(n), d = a % 10, s = a % 100;
  if (a === 1) return 'pole';
  if (d >= 2 && d <= 4 && !(s >= 12 && s <= 14)) return 'pola';
  return 'pól';
}

export function slotsWord(n) { return Math.abs(n) === 1 ? 'slot' : 'slots'; }

export const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

/**
 * Przedimek nieokreślony przed nazwą rzeczy. Wystarczy reguła po pierwszej
 * literze, bo nazwy są nasze i żadna nie zaczyna się od niemego „h" ani od
 * „u" czytanego jak „ju". Amulet jest jeden na cały loch, więc dostaje „the".
 */
export function a(name) {
  const s = String(name);
  if (/^Amulet of/.test(s)) return `the ${s}`;
  return /^[aeiou]/i.test(s) ? `an ${s}` : `a ${s}`;
}

/** Przedimek określony - też z wyjątkiem dla nazw własnych (wielka litera). */
export function the(name) {
  const s = String(name);
  return /^[A-Z]/.test(s) ? (/^Amulet of/.test(s) ? `the ${s}` : s) : `the ${s}`;
}
