// Przyczyna końca partii w języku gracza.
//
// W stanie gry przyczyna jest POLSKIM napisem ('rany', 'głód', 'zabity przez:
// szczur') i taka zostaje: stoi w zapisach sprzed wprowadzenia języków, a gracz
// automatyczny i seria pomiarowa zliczają po niej wyniki. Tłumaczenie odbywa się
// dopiero przy pokazaniu (D-050).

import { t, getLang } from './i18n.js';
import { KINDS, BOSS, monsterName } from './monsters.js';
import { a } from './lang/odmiana.js';

const ZNANE = {
  'rany': 'przyczyna.rany',
  'głód': 'przyczyna.glod',
  'zatrucie': 'przyczyna.zatrucie',
  'wyniesiono Amulet Otchłani': 'przyczyna.wygrana',
};
const PREFIKS_ZABITY = 'zabity przez: ';

/** Napis identyfikujący śmierć z ręki potwora albo uczestnika - do zapisu w stanie. */
export function zabityPrzez(nazwaPolska) { return `${PREFIKS_ZABITY}${nazwaPolska}`; }

/** Nazwa sprawcy w danym języku: potwór z przedimkiem, uczestnik po imieniu. */
function sprawca(nazwa, lang) {
  if (lang === 'pl') return nazwa;
  if (nazwa === BOSS.name) return `the ${monsterName(BOSS, lang)}`;
  const k = KINDS.find(x => x.name === nazwa);
  return k ? a(monsterName(k, lang)) : nazwa;
}

export function opisPrzyczyny(cause, lang = getLang()) {
  if (cause == null) return cause;
  if (lang === 'pl') return cause;
  if (ZNANE[cause]) return t(ZNANE[cause], {}, lang);
  if (String(cause).startsWith(PREFIKS_ZABITY)) {
    return t('przyczyna.zabity', { kto: sprawca(cause.slice(PREFIKS_ZABITY.length), lang) }, lang);
  }
  return cause;
}
