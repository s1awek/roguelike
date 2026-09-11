// Obejrzenie rzeczy: wszystko, co gracz może o niej wiedzieć, zanim ją weźmie.
//
// Osobny moduł, bo łączy dwie rzeczy, które celowo o sobie nie wiedzą: skutek
// przedmiotu (`items.js`) i miejsce w plecaku (`plecak.js`). Gdyby ocena leżała
// w którymkolwiek z nich, powstałby cykl importów, a co gorsza - drugi zestaw
// reguł. Tutaj jest JEDNO źródło, z którego korzysta i terminal, i obie wersje
// przeglądarkowe.
//
// Granica uczciwości jest ta sama, co wszędzie indziej: oglądanie NIE rozpoznaje
// mikstury ani zwoju. O nieznanym rodzaju mówi wprost, że nie wiadomo, co robi -
// inaczej „obejrzyj" byłoby darmowym zwojem rozpoznania i wywracałoby całą
// decyzję o wypiciu nieznanej flaszki.

import { itemStats } from './items.js';
import { t, getLang } from './i18n.js';
import { poleRzeczy, wolnePola, pojemnosc, zmiesciSie, ile as sztuk } from './plecak.js';

/**
 * @param it rzecz oglądana (z podłogi albo z plecaka)
 * @param hero patrzący - jego zbroja, broń i plecak są punktem odniesienia
 * @param identified zbiór rozpoznanych rodzajów
 * @param etykietaDla funkcja dająca etykietę stosu (`stackLabel`) - rozstrzyga o łączeniu
 * @param lang język werdyktu
 */
export function obejrzyj(it, hero, identified, etykietaDla, lang = getLang()) {
  const st = itemStats(it, hero, identified, lang);
  const pola = poleRzeczy(it);
  const wPlecaku = hero.inventory.includes(it);
  const zmiesci = wPlecaku ? true : zmiesciSie(hero, it, etykietaDla);
  const o = {
    kind: it.kind,
    opis: st.opis,
    porownanie: st.porownanie,
    znak: st.znak,
    noszone: st.noszone,
    miejsce: st.miejsce,
    pola,
    sztuk: sztuk(it),
    wolne: wolnePola(hero),
    pojemnosc: pojemnosc(hero),
    wPlecaku,
    zmiesci,
    werdykt: null,
    ton: 'rowno',
  };

  if (!zmiesci) {
    o.werdykt = t('ocena.brakMiejsca', { pola, wolne: o.wolne }, lang);
    o.ton = 'minus';
    return o;
  }
  if (st.noszone) { o.werdykt = t('ocena.uzywasz', {}, lang); return o; }

  if (it.kind === 'weapon' || it.kind === 'armor' || it.kind === 'pack') {
    o.ton = st.znak || 'rowno';
    o.werdykt = t(st.znak === 'plus' ? 'ocena.lepsze'
      : st.znak === 'minus' ? 'ocena.gorsze' : 'ocena.rowne', {}, lang);
    return o;
  }
  if (it.kind === 'potion' || it.kind === 'scroll') {
    const znane = identified && identified.has(`${it.kind}:${it.type}`);
    o.werdykt = t(znane ? 'ocena.znane' : 'ocena.nieznane', {}, lang);
    return o;
  }
  if (it.kind === 'food') { o.werdykt = t('ocena.jedzenie', {}, lang); o.ton = 'plus'; return o; }
  if (it.kind === 'amulet') { o.werdykt = t('ocena.amulet', {}, lang); o.ton = 'plus'; return o; }
  return o;
}

/** Ocena złożona w linijki tekstu - do terminala i do podpowiedzi. */
export function opisWLinijkach(nazwa, o, lang = getLang()) {
  const l = [nazwa + (o.sztuk > 1 ? t('ocena.sztuk', { n: o.sztuk }, lang) : '')];
  if (o.opis) l.push(o.opis);
  if (o.porownanie) l.push(o.porownanie);
  l.push(t('ocena.zajmuje', { miejsce: o.miejsce, pola: o.pola }, lang)
    + (o.wPlecaku ? '' : t('ocena.wolnych', { wolne: o.wolne, poj: o.pojemnosc }, lang)));
  if (o.werdykt) l.push(o.werdykt);
  return l;
}
