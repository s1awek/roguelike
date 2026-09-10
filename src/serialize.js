// Serializacja stanu gry - część WOLNA od środowiska.
//
// Ten plik nie importuje niczego z `node:`, bo ta sama gra chodzi w terminalu
// i w przeglądarce. Wszystko, co dotyka dysku albo kryptografii Node'a, siedzi
// w `save.js` i tam zostaje.

import { Game } from './game.js';

/** Klucze sortowane rekurencyjnie - bez tego odcisk zależałby od kolejności pól. */
export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = stable(value[k]);
    return out;
  }
  return value;
}

export function serialize(game) { return JSON.stringify(stable(game.toJSON())); }

/**
 * Wczytuje grę z tekstu. Zapis uszkodzony albo obcy jest ODRZUCANY z czytelnym
 * komunikatem, nigdy nie wywraca gry (spec §7) - dlatego wszystko leci przez try.
 */
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
