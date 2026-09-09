// Zapis i wznowienie gry.
//
// Kryterium 5 spec-a mówi, że stan po wznowieniu ma być NIEODRÓŻNIALNY od stanu
// sprzed zapisu. "Nieodróżnialny" jest sprawdzalne tylko wtedy, gdy istnieje
// jednoznaczny odcisk stanu - stąd fingerprint(). Porównywanie okiem nie liczy się
// jako dowód, bo różnica bywa w dalszym ciągu losowania, którego okiem nie widać.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { Game } from './game.js';

/** Klucze sortowane rekurencyjnie - bez tego odcisk zależałby od kolejności pól. */
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = stable(value[k]);
    return out;
  }
  return value;
}

export function serialize(game) { return JSON.stringify(stable(game.toJSON())); }

/** Jednoznaczny odcisk pełnego stanu gry, łącznie ze stanem generatora losowego. */
export function fingerprint(game) {
  return createHash('sha256').update(serialize(game)).digest('hex').slice(0, 32);
}

export function saveToFile(game, path) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serialize(game), 'utf8');
  return path;
}

/**
 * Wczytuje grę. Plik uszkodzony albo obcy jest ODRZUCANY z czytelnym komunikatem,
 * nigdy nie wywraca gry (spec §7) - dlatego wszystko leci przez jeden try.
 */
export function loadFromFile(path) {
  if (!existsSync(path)) return { ok: false, error: 'Nie ma takiego zapisu.' };
  let raw;
  try { raw = readFileSync(path, 'utf8'); }
  catch (e) { return { ok: false, error: `Nie da się odczytać pliku: ${e.message}` }; }
  return loadFromString(raw);
}

export function loadFromString(raw) {
  let data;
  try { data = JSON.parse(raw); }
  catch { return { ok: false, error: 'Zapis jest uszkodzony (nie jest poprawnym JSON-em).' }; }
  try {
    const game = Game.fromJSON(data);
    return { ok: true, game };
  } catch (e) {
    return { ok: false, error: `Zapis odrzucony: ${e.message}` };
  }
}
