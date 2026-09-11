import { t } from '../src/i18n.js';
import { stanyBohatera } from '../src/stany.js';

// Wspólny kawałek widoku dla obu wersji przeglądarkowych: skutek przedmiotu
// i różnica wobec noszonego, w jednym kształcie. Treść liczb pochodzi
// z `src/items.js` (itemStats) - tutaj jest wyłącznie oprawa.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Znacznik ze skutkiem przedmiotu; pusty napis, gdy nie ma czego pokazać. */
export function statsHtml(st) {
  if (!st || !st.opis) return '';
  const roznica = st.porownanie
    ? ` <em class="cmp ${st.znak}">${esc(st.porownanie)}</em>`
    : '';
  return `<span class="st">${esc(st.opis)}${roznica}</span>`;
}

/**
 * Karta obejrzanej rzeczy. Treść w całości pochodzi z `src/ocena.js`, więc
 * przeglądarka i terminal odpowiadają na pytanie „brać czy nie brać" tymi
 * samymi zdaniami - tutaj jest wyłącznie oprawa.
 */
export function obejrzyjHtml(nazwa, o) {
  if (!o) return `<p class="muted">${t('term.nicDoObejrzenia')}</p>`;
  const w = [];
  if (o.opis) w.push(`<li><span class="etyk">${t('web.karta.skutek')}</span> ${esc(o.opis)}</li>`);
  if (o.porownanie) {
    w.push(`<li><span class="etyk">${t('web.karta.wobec')}</span> <em class="cmp ${o.znak}">${esc(o.porownanie)}</em></li>`);
  }
  w.push(`<li><span class="etyk">${t('web.karta.miejsce')}</span> ${esc(o.miejsce)} = ${o.pola} ${t('pola', { n: o.pola })}`
    + (o.wPlecaku ? '' : t('web.karta.wolnych', { wolne: o.wolne, poj: o.pojemnosc })) + '</li>');
  if (o.sztuk > 1) w.push(`<li><span class="etyk">${t('web.karta.sztuk')}</span> ${o.sztuk}</li>`);
  return `<h2>${esc(nazwa)}</h2><ul class="karta">${w.join('')}</ul>`
    + (o.werdykt ? `<p class="werdykt ${o.ton}">${esc(o.werdykt)}</p>` : '');
}

/**
 * Paski stanów bohatera obok paska życia. Rysowane z rejestru `src/stany.js`,
 * więc dołożenie tam nowego stanu (zimno, przeziębienie, zdrowie osobno od
 * energii) pokazuje go w obu wersjach przeglądarkowych bez zmiany tego pliku.
 *
 * Słowo stoi OBOK paska, nie zamiast niego. Sam napis „syty" łatwo przeoczyć
 * i można umrzeć nie wiedząc dlaczego - dokładnie to zgłosił właściciel. Pasek
 * pokazuje, jak daleko do kłopotu, słowo mówi, jak się ten kłopot nazywa,
 * a kolor działa kątem oka, zanim gracz zdąży cokolwiek przeczytać.
 */
export function stanyHtml(hero) {
  return stanyBohatera(hero).map(s => `
    <div class="stan ${s.ton}" data-id="${s.id}"
         title="${esc(t('web.stanTytul', s))}">
      <span class="lbl">${esc(s.nazwa)}</span>
      <div class="bar"><i style="width:${(s.frakcja * 100).toFixed(1)}%"></i></div>
      <span class="num">${esc(s.etykieta)}</span>
    </div>`).join('');
}

/**
 * Wybór z kupki leżącej pod nogami.
 *
 * Zgłoszenie właściciela: „jeżeli kilka rzeczy leży na jednym kwadracie, to
 * powinno się otworzyć menu, w którym pokażemy, co chcemy podnieść - i nie tak,
 * że raz klikamy i okienko znika, tylko zaznaczamy i zatwierdzamy". Stąd dwa
 * kroki: zaznaczanie nie zamyka okna, dopiero Enter podnosi.
 *
 * `lista` to pozycje `{ nazwa, opis, pola, wybrane, werdykt, ton }`, a `bilans`
 * mówi, ile pól zajmie wybór i ile jest wolnych - bo najczęstszy zawód przy
 * podnoszeniu z kupki brzmi „zaznaczyłem pięć, weszły dwie".
 */
export function stosHtml(lista, bilans) {
  const rows = lista.map((w, i) => `
    <li class="item wybor${w.wybrane ? ' on' : ''}" data-i="${i}">
      <span class="ptak">${w.wybrane ? '✔' : ''}</span>
      <span class="key">${String.fromCharCode(97 + i)}</span>
      <canvas class="ico" width="44" height="44"></canvas>
      <span class="nm">${esc(w.nazwa)} <span class="worn">${esc(w.pola)}</span>
        ${w.opis ? `<span class="st">${esc(w.opis)}</span>` : ''}
        ${w.werdykt ? `<em class="cmp ${w.ton || ''}">${esc(w.werdykt)}</em>` : ''}</span>
    </li>`).join('');
  const zle = bilans.zajmie > bilans.wolne;
  return `<h2>${t('web.podNogami')} <span class="muted">${t('web.nRzeczy', { n: lista.length })}</span></h2>
    <ul class="stos">${rows}</ul>
    <p class="bilans ${zle ? 'minus' : 'rowno'}">${t('web.bilans', { ...bilans, zaDuzo: zle })}</p>
    <p class="foot">${t('web.stosStopka')}</p>`;
}

/**
 * Ostatnie linijki dziennika DO WNĘTRZA panelu.
 *
 * Ekran plecaka zasłania dziennik na dole strony, więc skutek działania
 * podjętego w plecaku - wynik powąchania, komunikat o wyrzuceniu, odmowa -
 * lądował za panelem i był widoczny dopiero po jego zamknięciu. Zgłoszenie
 * właściciela: „wiadomość pojawia się w tle i dopiero po zamknięciu okna
 * inwentarza widać, jaki był wynik operacji". Skutek ma być widoczny tam,
 * gdzie stoi wzrok w chwili działania.
 */
export function dziennikHtml(messages, ile = 3) {
  const ostatnie = (messages || []).slice(-ile);
  if (!ostatnie.length) return '';
  const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<ul class="dziennik-panel">${ostatnie.map(m => `<li>${esc(m.text)}</li>`).join('')}</ul>`;
}

