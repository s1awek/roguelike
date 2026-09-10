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

import { itemStats, polaSlowo } from './items.js';
import { poleRzeczy, wolnePola, pojemnosc, zmiesciSie, ile as sztuk } from './plecak.js';

/**
 * @param it rzecz oglądana (z podłogi albo z plecaka)
 * @param hero patrzący - jego zbroja, broń i plecak są punktem odniesienia
 * @param identified zbiór rozpoznanych rodzajów
 * @param etykietaDla funkcja dająca etykietę widzianą przez gracza (dla stosów)
 */
export function obejrzyj(it, hero, identified, etykietaDla) {
  const st = itemStats(it, hero, identified);
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
    o.werdykt = `Nie ma na to miejsca: zajmuje ${pola} ${polaSlowo(pola)}, `
      + `a w plecaku wolnych zostało ${o.wolne}.`;
    o.ton = 'minus';
    return o;
  }
  if (st.noszone) { o.werdykt = 'Właśnie tego używasz.'; return o; }

  if (it.kind === 'weapon' || it.kind === 'armor' || it.kind === 'pack') {
    o.ton = st.znak || 'rowno';
    o.werdykt = st.znak === 'plus' ? 'Lepsze od tego, co masz - warto.'
      : st.znak === 'minus' ? 'Gorsze od tego, co masz - podnosisz tylko na zapas.'
      : 'Bez różnicy wobec tego, co masz.';
    return o;
  }
  if (it.kind === 'potion' || it.kind === 'scroll') {
    const znane = identified && identified.has(`${it.kind}:${it.type}`);
    o.werdykt = znane ? 'Wiadomo, co robi - bierzesz świadomie.'
      : 'Nie wiadomo, co robi. Rozstrzygnie zwój rozpoznania albo próba na własnej skórze.';
    return o;
  }
  if (it.kind === 'food') { o.werdykt = 'Zapas na później - głód nie odpuszcza.'; o.ton = 'plus'; return o; }
  if (it.kind === 'amulet') { o.werdykt = 'Po to tu zszedłeś.'; o.ton = 'plus'; return o; }
  return o;
}

/** Ocena złożona w linijki tekstu - do terminala i do podpowiedzi. */
export function opisWLinijkach(nazwa, o) {
  const l = [nazwa + (o.sztuk > 1 ? ` (${o.sztuk} szt.)` : '')];
  if (o.opis) l.push(o.opis);
  if (o.porownanie) l.push(o.porownanie);
  l.push(`zajmuje ${o.miejsce} = ${o.pola} ${polaSlowo(o.pola)}`
    + (o.wPlecaku ? '' : `, wolnych ${o.wolne} z ${o.pojemnosc}`));
  if (o.werdykt) l.push(o.werdykt);
  return l;
}
