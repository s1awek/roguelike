// Zapis i wznowienie gry - warstwa plikowa (tylko Node).
//
// Kryterium 5 spec-a mówi, że stan po wznowieniu ma być NIEODRÓŻNIALNY od stanu
// sprzed zapisu. "Nieodróżnialny" jest sprawdzalne tylko wtedy, gdy istnieje
// jednoznaczny odcisk stanu - stąd fingerprint(). Porównywanie okiem nie liczy się
// jako dowód, bo różnica bywa w dalszym ciągu losowania, którego okiem nie widać.
//
// Czysta serializacja mieszka w `serialize.js`, żeby dała się użyć w przeglądarce.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { serialize, loadFromString } from './serialize.js';
import { t } from './i18n.js';

export { stable, serialize, loadFromString } from './serialize.js';

/** Jednoznaczny odcisk pełnego stanu gry, łącznie ze stanem generatora losowego. */
export function fingerprint(game) {
  return createHash('sha256').update(serialize(game)).digest('hex').slice(0, 32);
}

export function saveToFile(game, path) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serialize(game), 'utf8');
  return path;
}

export function loadFromFile(path) {
  if (!existsSync(path)) return { ok: false, error: t('zapis.brak') };
  let raw;
  try { raw = readFileSync(path, 'utf8'); }
  catch (e) { return { ok: false, error: t('zapis.nieOdczyt', { powod: e.message }) }; }
  return loadFromString(raw);
}
