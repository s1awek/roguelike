// Klient partii wieloosobowej.
//
// Różnica wobec gry jednoosobowej (`web/main.js`) jest jedna: silnika tu nie
// ma. Zamiast niego stoi ATRAPA (`web/cien.js`) karmiona migawkami z serwera,
// a naciśnięcie klawisza nie zmienia stanu, tylko ZGŁASZA zamiar. Skutek
// przychodzi z powrotem strumieniem - własny ruch wygląda więc tak samo jak
// cudzy, i to jest zamierzone: gdy dwoje graczy się widzi, ich tura rozstrzyga
// się jednocześnie, więc nikt nie może zobaczyć skutku swojego ruchu, zanim
// drugi zadeklaruje własny.

import { itemLabel, itemStats, stackLabel } from '../src/items.js';
import { t, getLang } from '../src/i18n.js';
import { opisPrzyczyny } from '../src/przyczyny.js';
import { ustalJezyk, przelacznik } from './jezyk.js';
import { poloz, pojemnosc, zajetePola, poleRzeczy, wolnePola } from '../src/plecak.js';
import { obejrzyj } from '../src/ocena.js';
import { siatkaHtml, podepnijSiatke, trwaCiagniecie } from './plecak-ui.js';
import { statsHtml, obejrzyjHtml, stanyHtml, stosHtml, dziennikHtml, postepDosw } from './opis.js';
import { wstawIkony } from './ikony.js';
import { buildRules } from '../src/rules.js';
import { Renderer } from './draw.js';
import { View } from './view.js';
import { Cien } from './cien.js';
import { DIR, SHIFTED_BY_CODE } from './klawisze.js';
import { podpisz } from './autor.js';

const $ = (id) => document.getElementById(id);
const canvas = $('map');
const overlay = $('overlay');
const panel = $('panel');
const logEl = $('log');
const renderer = new Renderer(canvas);
const view = new View();
const cien = new Cien();
ustalJezyk();
wstawIkony(document.getElementById('hud'));
// Księga w języku czytającego, osobno dla każdego języka (patrz `web/main.js`).
const ksiegi = {};
const rules = () => (ksiegi[getLang()] ??= buildRules('web'));

let ja = null;              // {hid, token, name}
let strumien = null;
let mode = 'lobby';         // 'lobby' | 'map' | 'inventory' | 'drop' | 'sniff' | 'stos' | 'obejrzyj' | 'help' | 'over'
let ruleSection = 0;
let zgloszone = null;       // ostatnie zgłoszone działanie, dopóki nie zeszła tura
let turaZgloszenia = -1;
let notice = '';
let noticeUntil = 0;
let wymiar = '';

/**
 * Odmowa ze stołu w języku gracza. Nowszy stół przysyła `kod` i tłumaczy go
 * klient; starszy przysyła gotowe zdanie, które pokazujemy takie, jakie jest
 * (spec C-3: co najwyżej część tekstów w języku stołu, bez wywrotki).
 */
const odmowa = (b, zapas) => (b && b.kod ? t(b.kod, b.p || {}) : (b && (b.powod || b.blad)) || zapas);

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function say(text, ms = 2600) {
  notice = text;
  noticeUntil = performance.now() + ms;
  const el = $('notice');
  el.textContent = text;
  el.hidden = false;
}

/** Gasi notkę natychmiast, nie czekając na jej termin. */
function schowajNotke() {
  notice = '';
  noticeUntil = 0;
  $('notice').hidden = true;
}

// ---------- rozmowa z serwerem ----------

async function post(sciezka, body) {
  const r = await fetch(sciezka, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { code: r.status, body: await r.json().catch(() => ({})) };
}

/**
 * Dosiadanie jest JEDNORAZOWE - drugie kliknięcie nie może prosić o nowe miejsce.
 *
 * Bez tej zapory każde kliknięcie w „Wejdź" brało osobne miejsce przy stole,
 * a `otworzStrumien` zamykał przy tym strumień poprzedniego. Zmierzone: cztery
 * kliknięcia to cztery miejsca, z których żyje ostatnie. Właściciel przy
 * pierwszym wejściu na stronę zajął tak osiem z dwunastu miejsc i zapełnił stół
 * sam sobie. Samo szybkie działanie przycisku tego nie tłumaczy (lobby znika
 * po 66 ms), więc nie zgaduję, co go skłoniło do klikania - zamykam skutek.
 */
let dosiadanie = false;

async function dosiadz(name) {
  if (dosiadanie || ja) return;
  dosiadanie = true;
  const przycisk = $('wejdz');
  przycisk.disabled = true;
  przycisk.textContent = t('web.stol.dosiadam');
  try {
    const { code, body } = await post('/api/dosiadz', { name, lang: getLang() });
    if (code !== 200) { say(t('web.stol.nieDosiadl', { powod: odmowa(body, code) })); return; }
    ja = body;
    sessionStorage.setItem('roguelike:miejsce', JSON.stringify(ja));
    // Ekran wejścia znika, gdy miejsce JEST PRZYZNANE, a nie gdy przyjdzie
    // pierwsza migawka. Wiązanie tych dwóch rzeczy dawało ślepy zaułek: gdyby
    // cokolwiek stanęło na drodze migawce, gracz zostawał z przyciskiem
    // „Dosiadam..." bez końca i bez żadnej wskazówki, a miejsce przy stole
    // miał już zajęte. Czekanie na stół jest osobnym stanem i ma własny napis.
    doMapy();
    otworzStrumien();
  } finally {
    // Przycisk wraca do stanu użytecznego ZAWSZE, także po udanym wejściu.
    // Napis „Dosiadam..." zostawiony na stałe był jedyną rzeczą, jaką gracz
    // widział, gdy coś poszło nie tak - a wyglądał jak zawieszenie.
    dosiadanie = false;
    przycisk.disabled = false;
    przycisk.textContent = t('web.stol.wejdz');
  }
}

let pierwszyWidok = false;

/** Przejście z ekranu wejścia do lochu. */
function doMapy() {
  mode = 'map';
  $('lobby').hidden = true;
  say(t('web.stol.czekamNaWidok'), 4000);
}

function otworzStrumien() {
  if (strumien) strumien.close();
  strumien = new EventSource(`/api/strumien?hid=${ja.hid}&token=${encodeURIComponent(ja.token)}`);
  strumien.onmessage = (e) => {
    cien.wchlon(JSON.parse(e.data));
    // Warstwa animacji dostaje atrapę tak samo jak silnik w grze jednoosobowej,
    // więc migotanie po ciosie, obłoczki po zabitych potworach i liczby
    // obrażeń działają bez ani jednej osobnej linii kodu.
    view.sync(cien);
    // Rozmiar kafla i płótna zależy od WYMIARÓW POZIOMU, a te przychodzą
    // dopiero z pierwszą migawką - i zmieniają się przy zejściu na poziom
    // o innym rozmiarze. Bez tego wywołania rysownik liczy na domyślnych
    // wartościach, a szerokość płótna zostaje nieokreślona.
    if (cien.poziom.w && (wymiar !== `${cien.poziom.w}x${cien.poziom.h}`)) {
      wymiar = `${cien.poziom.w}x${cien.poziom.h}`;
      renderer.resize(cien);
    }
    // Zapasowo, gdyby migawka wyprzedziła przejście do mapy.
    if (mode === 'lobby') { doMapy(); renderer.resize(cien); }
    // Widok lochu przyszedł, więc zapowiedź czekania nie ma już czego zapowiadać.
    if (!pierwszyWidok) { pierwszyWidok = true; schowajNotke(); }
    // Tura zeszła, więc zgłoszenie zostało rozstrzygnięte.
    if (cien.turn !== turaZgloszenia) zgloszone = null;
    if (cien.ja.status !== 'playing' && mode !== 'over') koniec();
    sprawdzPrzegrana();
    // Otwarty plecak żyje razem z migawką - inaczej po podniesieniu rzeczy
    // gracz patrzyłby na siatkę sprzed zmiany. W trakcie chwytu odświeżenie
    // czeka, bo przerysowanie wyrwałoby rzecz z ręki.
    // Odświeżenie dotyczy WSZYSTKICH ekranów plecaka, nie samego spisu: wynik
    // powąchania przychodzi dopiero z rozstrzygnięciem tury, więc ekran wąchania
    // zamrożony na starej migawce nigdy by go nie pokazał.
    if (['inventory', 'drop', 'sniff'].includes(mode) && !trwaCiagniecie()) otworzPlecak(mode);
    // Kupka pod nogami też żyje: ktoś inny mógł z niej wziąć rzecz, gdy ja
    // jeszcze zaznaczam. Zaznaczenie przeżywa odświeżenie, bo trzyma się
    // identyfikatorów, a nie miejsc na liście.
    if (mode === 'stos') odswiezStos();
    odswiezHud();
  };
  strumien.onerror = async () => {
    // Zerwanie połączenia i NIEISTNIEJĄCE miejsce wyglądają w `EventSource`
    // tak samo, a różnią się wszystkim: pierwsze mija samo, drugiego nie
    // naprawi żadna liczba ponowień. Po restarcie serwera znak z poprzedniego
    // stołu jest bezwartościowy, więc trzeba to sprawdzić i wrócić do lobby -
    // inaczej gracz ogląda „próbuję dalej" bez końca, a przycisk wejścia jest
    // zablokowany, bo miejsce formalnie ma.
    if (ja && !(await miejsceIstnieje(ja))) return doLobby(t('web.stol.podniesiony'));
    say(t('web.stol.zerwane'), 4000);
  };
}

/** Czy zapamiętane miejsce nadal istnieje po stronie stołu. */
async function miejsceIstnieje(m) {
  try {
    const r = await fetch(`/api/moje?hid=${m.hid}&token=${encodeURIComponent(m.token)}`);
    if (r.status !== 200) return false;
    // Miejsce po zmarłym bohaterze ISTNIEJE, ale wracać na nie nie ma po co:
    // przychodzi z niego wyłącznie ekran końca, a odświeżenie strony wraca
    // na to samo. Traktujemy je jak nieistniejące.
    const b = await r.json().catch(() => ({}));
    return b.status ? b.status === 'playing' : true;
  } catch { return true; }   // brak sieci to nie dowód, że miejsca nie ma
}

/** Powrót do ekranu wejścia z czystym stanem. */
function doLobby(powod) {
  if (strumien) { strumien.close(); strumien = null; }
  ja = null;
  sessionStorage.removeItem('roguelike:miejsce');
  mode = 'lobby';
  $('lobby').hidden = false;
  const przycisk = $('wejdz');
  przycisk.disabled = false;
  przycisk.textContent = t('web.stol.wejdz');
  if (powod) say(powod, 8000);
}

function zglos(action) {
  if (!ja || mode !== 'map' || !cien.ja || cien.ja.status !== 'playing') return;
  zgloszone = action;
  turaZgloszenia = cien.turn;
  post('/api/dzialanie', { hid: ja.hid, token: ja.token, action }).then(({ code, body }) => {
    if (code !== 200 || body.ok === false) { zgloszone = null; say(odmowa(body, t('web.stol.odmowa'))); }
  });
}

// ---------- klawiatura ----------

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (mode === 'lobby') return;
  let k = e.key;
  if (e.shiftKey && SHIFTED_BY_CODE[e.code]) k = SHIFTED_BY_CODE[e.code];
  if (DIR[k] || ['.', ',', '5', 'g', '>', '<', 'i', 'd', 'w', '?', 'm', 'Escape', ' '].includes(k)) e.preventDefault();

  if (mode === 'over') {
    // Przeładowanie strony wracało na zużyte miejsce. Nowe miejsce bierze się
    // z ekranu wejścia, więc idziemy tam wprost - bez przeładowania.
    if (k === 'Enter' || k === ' ') { zamknij(); doLobby(); }
    return;
  }
  if (mode === 'help') {
    if (k === 'Escape' || k === '?' || k === 'q') { zamknij(); return; }
    if (k === 'n' || k === ' ' || k === 'ArrowRight' || k === 'ArrowDown') { pokazZasady(ruleSection + 1); return; }
    if (k === 'p' || k === 'ArrowLeft' || k === 'ArrowUp') { pokazZasady(ruleSection - 1); return; }
    const n = Number(k);
    if (Number.isInteger(n) && n >= 1 && n <= rules().length) pokazZasady(n - 1);
    return;
  }
  // Ekran przegranego starcia gaśnie dowolnym klawiszem - ale dopiero
  // klawiszem, żeby nie zniknął sam, zanim gracz zdąży przeczytać.
  if (mode === 'przegrana') { zamknij(); return; }

  if (mode === 'obejrzyj') {
    if (k === ',' || k === 'g') { zamknij(); podnies(); return; }
    zamknij();
    return;
  }

  // Wybór z kupki. Zaznaczanie nie zamyka okna; podnosi dopiero Enter.
  if (mode === 'stos') {
    if (k === 'Escape' || k === 'q') { zamknij(); return; }
    if (k === 'Enter') { potwierdzStos(); return; }
    if (k === '*') { zaznaczWszystko(); return; }
    const idx = k.length === 1 ? k.charCodeAt(0) - 97 : -1;
    if (idx >= 0 && idx < stos.length) przelaczWybor(idx);
    return;
  }

  if (mode === 'inventory' || mode === 'drop' || mode === 'sniff') {
    if (k === 'Escape' || k === 'i' || k === 'q') { zamknij(); return; }
    const idx = k.length === 1 ? k.charCodeAt(0) - 97 : -1;
    if (idx >= 0 && idx < cien.ja.inventory.length) uzyj(idx);
    return;
  }
  if (DIR[k]) { const [dx, dy] = DIR[k]; zglos({ type: 'move', dx, dy }); return; }
  switch (k) {
    case '.': case '5': zglos({ type: 'wait' }); break;
    case ',': case 'g': podnies(); break;
    case '>': zglos({ type: 'descend' }); break;
    case '<': zglos({ type: 'ascend' }); break;
    case 'i': otworzPlecak('inventory'); break;
    case 'd': otworzPlecak('drop'); break;
    case 'w': otworzPlecak('sniff'); break;
    case 'x': pokazObejrzenie(); break;
    case '?': pokazZasady(ruleSection); break;
    case 'm': renderer.minimap = !renderer.minimap; say(t(renderer.minimap ? 'web.planWl' : 'web.planWyl')); break;
    default: break;
  }
});

// ---------- nakładki ----------

function zamknij() { mode = 'map'; overlay.hidden = true; }

// Kliknięcie w tło poza oknem zamyka je jak Esc. Ekran wejścia i ekran końca
// nie są oknami nad planszą - tych kliknięcie nie rusza.
overlay.addEventListener('click', (e) => {
  if (e.target !== overlay || mode === 'over' || mode === 'lobby') return;
  zamknij();
});

/**
 * Użycie rzeczy przy stole. Panel zostaje otwarty - patrz ta sama reguła
 * w wersji jednoosobowej. `zglos` deklaruje tylko z mapy, więc zamykamy panel
 * na czas zgłoszenia i otwieramy z powrotem.
 */
function uzyj(idx) {
  const which = mode;
  const typ = mode === 'drop' ? 'drop' : mode === 'sniff' ? 'sniff' : 'use';
  const nadpisuje = zgloszone && cien.turn === turaZgloszenia;
  zamknij();
  zglos({ type: typ, index: idx });
  if (nadpisuje) say(t('web.stol.zamiastDzialania'));
  if (cien.ja && cien.ja.status === 'playing') otworzPlecak(which);
}

/**
 * Klucz łączenia w stos - ten sam, którym łączy serwer, niezależny od języka.
 * Do porównań, nigdy do pokazania graczowi.
 */
const klStosu = (x) => stackLabel(x, cien.appearances, cien.identified, cien.sniffed);

/**
 * Obejrzenie rzeczy pod nogami. Liczone U SIEBIE, z migawki - i wolno tak
 * dlatego, że oglądanie nie zmienia niczego w świecie, a wszystkie dane, na
 * których się opiera, są już w migawce. Ta sama funkcja `obejrzyj` odpowiada
 * w terminalu, więc werdykt nie może się rozjechać między wersjami.
 */
function pokazObejrzenie() {
  const p = cien.ja;
  const it = (cien.items || []).find(i => i.x === p.x && i.y === p.y);
  mode = 'obejrzyj';
  const etykieta = (x) => itemLabel(x, cien.appearances, cien.identified, cien.sniffed);
  const naSiatce = !!(p.plecak && p.plecak.w);
  const o = it && naSiatce ? obejrzyj(it, p, cien.identified, klStosu) : null;
  // Rzecz pod nogami JEST, tylko starszy stół nie przysyła wymiarów plecaka -
  // wtedy pokazujemy tyle, ile wiemy, zamiast twierdzić, że nic tu nie leży.
  const tresc = it && !o
    ? `<h2>${escapeHtml(etykieta(it))}</h2>`
      + `<p>${statsHtml(itemStats(it, p, cien.identified)) || `<span class="muted">${t('web.stol.bezOpisu')}</span>`}</p>`
      + `<p class="muted">${t('web.stol.staryStol')}</p>`
    : obejrzyjHtml(it ? etykieta(it) : '', o);
  panel.innerHTML = tresc
    + `<p class="foot">${it ? t('web.podnosiKbd') : ''}${t('web.escWraca')}</p>`;
  overlay.hidden = false;
}

// ---------- przegrane starcie ----------

let ostatniaPrzegrana = null;
let pierwszaMigawka = true;

/**
 * Przegrana potyczka z innym uczestnikiem to najdroższa rzecz, jaka może się
 * przy stole wydarzyć: cały dobytek zostaje na podłodze, a bohater budzi się
 * piętro wyżej z ćwiartką życia. Do tej pory mówiły o tym trzy linijki
 * dziennika, które za chwilę znikały - właściciel zgłosił to jako „glitch,
 * przeniosło mnie i wyczyściło plecak". Ekran zamyka się dopiero na klawisz,
 * bo to jest wiadomość, której nie wolno przegapić.
 */
function sprawdzPrzegrana() {
  const p = cien.ja;
  const tura = p.przegranaTura ?? null;
  // Pierwsza migawka po dosiądnięciu ustawia tylko punkt odniesienia: stara
  // przegrana nie ma się pokazywać komuś, kto właśnie wrócił do gry. Punkt
  // odniesienia bierze się z PIERWSZEJ migawki, a nie z pierwszej migawki
  // niosącej przegraną - inaczej pierwsza w życiu przegrana ustawia punkt
  // odniesienia zamiast się pokazać, czyli ekran nie zapala się nigdy.
  if (pierwszaMigawka) { pierwszaMigawka = false; ostatniaPrzegrana = tura; return; }
  if (tura === null || tura === ostatniaPrzegrana) return;
  ostatniaPrzegrana = tura;
  const d = p.przegrana || {};
  mode = 'przegrana';
  panel.innerHTML = `<h2 class="zle">${t('web.stol.pg.tytul')}</h2>
    <p>${t('web.stol.pg.polozyl', { kto: escapeHtml(d.kto || t('web.stol.pg.ktos')) })}</p>
    <ul class="karta">
      <li>${t('web.stol.pg.dobytek', { ile: d.ile ?? 0 })}</li>
      <li>${t('web.stol.pg.ucieczka', { z: d.zPietra ?? '?', na: d.naPietro ?? '?' })}</li>
      <li>${t('web.stol.pg.cwierc')}</li>
    </ul>
    <p class="muted">${t('web.stol.pg.niekoniec')}</p>
    <p class="foot">${t('web.stol.pg.stopka')}</p>`;
  overlay.hidden = false;
}

// ---------- kupka pod nogami ----------

let stos = [];
let wybrane = new Set();

/**
 * Podniesienie przy stole. Wybór robi się U SIEBIE, z migawki - ale samo
 * podniesienie idzie deklaracją, jak każde działanie w świecie. Migawka może
 * być o turę stara, więc serwer i tak sprawdza, co naprawdę leży pod nogami:
 * bierze przecięcie listy z kaflem, a nie to, co przysłał klient.
 */
function podnies() {
  const p = cien.ja;
  const pod = (cien.items || []).filter(i => i.x === p.x && i.y === p.y);
  if (pod.length <= 1) { zglos({ type: 'pickup' }); return; }
  stos = pod;
  wybrane = new Set(pod.map(i => i.id));
  pokazStos();
}

/** Kupka po nowej migawce: te same rzeczy, jeżeli nadal leżą. */
function odswiezStos() {
  const p = cien.ja;
  if (!p) return;
  stos = (cien.items || []).filter(i => i.x === p.x && i.y === p.y);
  if (!stos.length) { zamknij(); say(t('web.stol.nicNieLezy')); return; }
  const sa = new Set(stos.map(i => i.id));
  wybrane = new Set([...wybrane].filter(id => sa.has(id)));
  pokazStos();
}

function przelaczWybor(i) {
  const it = stos[i];
  if (!it) return;
  if (wybrane.has(it.id)) wybrane.delete(it.id); else wybrane.add(it.id);
  pokazStos();
}

function zaznaczWszystko() {
  wybrane = wybrane.size === stos.length ? new Set() : new Set(stos.map(i => i.id));
  pokazStos();
}

function potwierdzStos() {
  const ids = stos.filter(i => wybrane.has(i.id)).map(i => i.id);
  zamknij();
  if (ids.length) zglos({ type: 'pickup', ids });
}

function pokazStos() {
  mode = 'stos';
  const p = cien.ja;
  const etykieta = (it) => itemLabel(it, cien.appearances, cien.identified, cien.sniffed);
  const naSiatce = !!(p.plecak && p.plecak.w);
  const lista = stos.map((it) => {
    const o = naSiatce ? obejrzyj(it, p, cien.identified, klStosu) : null;
    return {
      nazwa: etykieta(it),
      opis: itemStats(it, p, cien.identified).opis,
      pola: naSiatce ? `${poleRzeczy(it)} ${t('pola', { n: poleRzeczy(it) })}` : '',
      wybrane: wybrane.has(it.id),
      werdykt: o ? o.werdykt : '',
      ton: o ? o.ton : '',
    };
  });
  const zajmie = naSiatce
    ? stos.filter(i => wybrane.has(i.id)).reduce((a, i) => a + poleRzeczy(i), 0) : 0;
  // Starszy stół nie przysyła wymiarów plecaka. Wtedy bilans pól nie ma z czego
  // powstać, więc pokazujemy sam wybór - uboższy widok, nie wywrotka (W-24).
  panel.innerHTML = stosHtml(lista, { zajmie, wolne: naSiatce ? wolnePola(p) : zajmie });
  panel.querySelectorAll('li.wybor').forEach(li => {
    const it = stos[Number(li.dataset.i)];
    const c = li.querySelector('canvas.ico');
    if (c && it) renderer.drawItemShape(c.getContext('2d'), it, 22, 22, 40, cien, view);
    li.addEventListener('click', () => przelaczWybor(Number(li.dataset.i)));
  });
  overlay.hidden = false;
}

const INV_TITLE = { drop: 'term.coWyrzucic', sniff: 'term.coPowachac', inventory: 'term.ekwipunek' };
const INV_HINT = { drop: 'web.inv.drop', sniff: 'web.inv.sniffKrotko', inventory: 'web.inv.useKrotko' };

/**
 * Przekładanie w plecaku przy stole.
 *
 * To jedyne działanie, które klient wykonuje NA WŁASNEJ KOPII, zanim przyjdzie
 * potwierdzenie - i wolno na to tylko dlatego, że układ plecaka nie jest
 * częścią świata: nie kosztuje tury, nie widzi go nikt inny i nie da się nim
 * niczego zdobyć. Gdyby serwer odmówił, najbliższa migawka nadpisze układ
 * swoją wersją, bo obie strony liczą to tą samą funkcją `mozna()`.
 */
function przelozUSiebie(index, x, y, obrot) {
  const it = cien.ja.inventory[index];
  if (!it || !(cien.ja.plecak && cien.ja.plecak.w)) return;
  const stare = { px: it.px, py: it.py, obrot: it.obrot };
  if (!poloz(cien.ja, it, x, y, obrot)) return;
  post('/api/dzialanie', { hid: ja.hid, token: ja.token, action: { type: 'przeloz', index, x, y, obrot } })
    .then(({ code, body }) => {
      if (code === 200 && body.ok !== false) return;
      Object.assign(it, stare);           // serwer wie lepiej
      say(odmowa(body, t('web.stol.nieprzelozone')));
      if (mode === 'inventory') otworzPlecak('inventory');
    });
}

function otworzPlecak(which) {
  mode = which;
  const p = cien.ja;
  const etykieta = (it) => itemLabel(it, cien.appearances, cien.identified, cien.sniffed);
  const rows = p.inventory.map((it, i) => {
    const noszone = it === p.weapon || it === p.armor
      || (p.weapon && it.id === p.weapon.id) || (p.armor && it.id === p.armor.id);
    const ile = (it.ile || 1) > 1 ? ` <span class="worn">x${it.ile}</span>` : '';
    return `<li class="item" data-i="${i}"><span class="key">${String.fromCharCode(97 + i)}</span>`
      + `<canvas class="ico" width="44" height="44"></canvas>`
      + `<span class="nm">${escapeHtml(etykieta(it))}${ile}${noszone ? ` <em class="muted">${t('web.noszone')}</em>` : ''}`
      + `${statsHtml(itemStats(it, p, cien.identified))}</span></li>`;
  }).join('');
  // Migawka ze STARSZEGO stołu nie zna plecaka na siatce - wtedy pokazujemy
  // sam spis, zamiast wywracać się na polu, którego serwer jeszcze nie wysyła.
  // Klient przeżywa serwer w wersji sprzed zmiany; to nie jest luksus, tylko
  // warunek tego, żeby wgranie nowego pliku nie kładło komuś trwającej partii.
  const naSiatce = !!(p.plecak && p.plecak.w);
  const licznik = naSiatce
    ? `${zajetePola(p)}/${pojemnosc(p)} ${t('pola', { n: pojemnosc(p) })}`
    : t('web.nRzeczy', { n: p.inventory.length });
  panel.innerHTML = `
    <h2>${t(INV_TITLE[which])} <span class="muted">${licznik}</span></h2>
    <div class="ekwipunek">${which === 'inventory' && naSiatce ? siatkaHtml(p, etykieta, { kosz: true }) : ''}
      <ul>${rows || `<li class="muted">${t('web.pusto')}</li>`}</ul></div>
    ${dziennikHtml(cien.messages)}
    <p class="foot">${t('web.inv.stopka', { co: t(INV_HINT[which]) })}${which === 'inventory'
      ? t('web.inv.dWyrzuca') : ''}${t('web.escWraca')}</p>`;
  panel.querySelectorAll('li.item').forEach(li => {
    const it = p.inventory[Number(li.dataset.i)];
    const c = li.querySelector('canvas.ico');
    if (c && it) renderer.drawItemShape(c.getContext('2d'), it, 22, 22, 40, cien, view);
    li.addEventListener('click', () => uzyj(Number(li.dataset.i)));
  });
  podepnijSiatke(panel, p, {
    przeloz: (i, x, y, obrot) => {
      if (i >= 0) przelozUSiebie(i, x, y, obrot);
      otworzPlecak(which);
    },
    uzyj: (i) => uzyj(i),
    // Wyrzucenie idzie normalną drogą: deklaracja do stołu i czekanie na turę.
    // Przekładanie wyżej wolno robić u siebie, wyrzucania NIE - rzecz ląduje
    // na podłodze, więc widzą ją inni.
    // Panel zostaje otwarty, bo wyrzucanie rzadko dotyczy jednej rzeczy.
    //
    // Ale przy stole wyrzucenie to DZIAŁANIE, a na turę przypada jedno: druga
    // rzecz przeciągnięta na kosz przed rozstrzygnięciem tury zastępuje
    // pierwszą deklarację, zamiast dołożyć się do niej. Gracz musi o tym
    // wiedzieć, inaczej wygląda to jak zgubienie rzeczy przez grę.
    wyrzuc: (i) => {
      const nadpisuje = zgloszone && cien.turn === turaZgloszenia;
      zamknij();                       // `zglos` deklaruje tylko z mapy
      zglos({ type: 'drop', index: i });
      say(t(nadpisuje ? 'web.stol.zamiastRzeczy' : 'web.stol.wyrzucenieZgloszone'));
      otworzPlecak(which);
    },
    rysuj: (c, it) => renderer.drawItemShape(c.getContext('2d'), it,
      c.width / 2, c.height / 2, Math.min(c.width, c.height) - 8, cien, view),
  });
  overlay.hidden = false;
}

function pokazZasady(index) {
  mode = 'help';
  const RULES = rules();
  ruleSection = ((index % RULES.length) + RULES.length) % RULES.length;
  const sec = RULES[ruleSection];
  const nav = RULES.map((r, i) =>
    `<button class="tab${i === ruleSection ? ' on' : ''}" data-i="${i}">${escapeHtml(r.title)}</button>`).join('');
  const body = sec.blocks.map(b => {
    if (b.t === 'p') return `<p class="muted">${escapeHtml(b.text)}</p>`;
    if (b.t === 'list') return `<ul class="rules">${b.items.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`;
    if (b.t === 'table') {
      return `<table class="rules"><thead><tr>${b.head.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`
        + `<tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    return '';
  }).join('');
  panel.innerHTML = `<div class="tabs">${nav}</div><h2>${escapeHtml(sec.title)}</h2>${body}`
    + `<p class="foot">${t('web.ksiegaStopkaStol')}</p>`;
  panel.querySelectorAll('button.tab').forEach(btn =>
    btn.addEventListener('click', () => pokazZasady(Number(btn.dataset.i))));
  overlay.hidden = false;
}

function koniec() {
  mode = 'over';
  const p = cien.ja;
  // Miejsce jest zużyte. Zapomnienie go TUTAJ, a nie dopiero przy wejściu na
  // nowe, zamyka pułapkę zgłoszoną 10.09: odświeżenie strony wracało na to
  // samo martwe miejsce, więc ekran wejścia migał przez ułamek sekundy
  // i natychmiast ustępował ekranowi końca - bez żadnej drogi dalej.
  sessionStorage.removeItem('roguelike:miejsce');
  const wygral = p.status === 'won';
  panel.innerHTML = `<h2>${t(wygral ? 'web.stol.wyszedles' : 'web.stol.koniec')}</h2>`
    + `<p class="muted">${escapeHtml(opisPrzyczyny(p.cause || (wygral ? 'wyniesiono Amulet Otchłani' : 'rany')))}</p>`
    + `<p class="muted">${t('web.stol.staty', { level: p.level, xp: p.xp, depth: p.depth, turn: cien.turn })}</p>`
    + `<p class="foot">${t('web.stol.koniecStopka')}</p>`;
  overlay.hidden = false;
}

// ---------- panel stanu ----------

function odswiezHud() {
  const p = cien.ja;
  if (!p) return;
  const frac = p.hp / p.maxHp;
  $('hpfill').style.width = `${Math.max(0, frac) * 100}%`;
  $('hpfill').style.background = frac > 0.5 ? 'var(--green)' : frac > 0.25 ? 'var(--gold)' : 'var(--red)';
  $('hptext').textContent = `${p.hp}/${p.maxHp}`;
  $('plevel').textContent = p.level;
  const dosw = postepDosw(p);
  $('pxp').textContent = dosw.xp;
  $('pxpprog').textContent = dosw.prog;
  $('xpfill').style.width = `${dosw.frakcja * 100}%`;
  $('patk').textContent = p.atak;
  $('pdef').textContent = p.obrona;
  $('pdepth').textContent = `${p.depth}/${p.maxDepth}`;
  $('pturn').textContent = cien.turn;
  $('pwrogi').textContent = cien.pietro.potwory;
  $('pwrogi').closest('.poz').classList.toggle('sa', cien.pietro.potwory > 0);
  $('stany').innerHTML = stanyHtml(p);
  $('amulet').hidden = !p.hasAmulet;

  // Oddech. Gracz musi widzieć, że cofanie się ma koniec, ZANIM zabraknie mu
  // tchu - inaczej odmowa ruchu wygląda jak zablokowana klawiatura, czyli
  // dokładnie ta wada, na którą właściciel zwrócił uwagę przy turze wspólnej.
  const zm = p.zmeczenie || 0, prog = p.progZmeczenia || 6;
  const bezTchu = zm >= prog;
  const oddech = $('oddech');
  oddech.hidden = zm < Math.ceil(prog / 2);
  oddech.textContent = bezTchu ? t('web.stol.bezTchu') : t('web.stol.oddech', { n: prog - zm });
  oddech.className = bezTchu ? 'tag bad' : 'tag warn';
  oddech.title = bezTchu ? t('web.stol.bezTchuTytul') : t('web.stol.oddechTytul', { n: prog - zm });

  // Znacznik tury wspólnej. Gracz musi WIEDZIEĆ, że jego ruch czeka na kogoś -
  // inaczej nieruchomy ekran po naciśnięciu klawisza wygląda jak zawieszona gra.
  const wKontakcie = cien.kontakt.length > 0;
  const kto = cien.kontakt.map(k => k.name).join(', ');
  const znacznik = $('kontakt');
  znacznik.hidden = !wKontakcie;
  if (wKontakcie) {
    znacznik.textContent = t(zgloszone ? 'web.stol.czekaszNa' : 'web.stol.widzisz', { kto });
    znacznik.className = zgloszone ? 'tag gold' : 'tag';
  }

  // Pasek pod planszą: nazywa stan, podaje powód i mówi, co gracz ma zrobić.
  //
  // Najważniejsze jest rozróżnienie, KTO wstrzymuje turę. Poprzednia wersja
  // mówiła „plansza czeka na drugą stronę" także wtedy, gdy drugą stroną był
  // czytający - a wtedy wszyscy wokół stoją nieruchomo i wygląda to jak gra,
  // która się zawiesiła. Pole `tura` przychodzi ze stołu; przy starszym
  // serwerze go nie ma i pasek zachowuje się jak dotąd (uboższy, nie zepsuty).
  const pasek = $('turowy');
  // Pasek NIE znika z układu, tylko gaśnie: `hidden` zabierałby jego wysokość,
  // a wtedy każde wejście w kontakt i wyjście z niego podskakiwałoby całym
  // ekranem. Miejsce jest zarezerwowane na stałe, zmienia się tylko treść.
  pasek.classList.toggle('pusty', !wKontakcie);
  if (wKontakcie) {
    const tu = cien.tura || null;
    const toJa = tu ? tu.wspolna && tu.jaMilcze : !zgloszone;
    terminTury = tu && tu.zaMs !== null && toJa ? Date.now() + tu.zaMs : null;
    const czekamNa = tu && tu.milczacy.length ? tu.milczacy.join(', ') : kto;
    // Tytuł paska ma w HTML-u własny klucz tłumaczenia (stan spoczynkowy), więc
    // nadpisując treść, nadpisujemy też klucz - inaczej zmiana języka wróciłaby
    // do napisu spoczynkowego w środku tury wspólnej.
    const tytul = (k) => { $('turowy-tytul').dataset.t = k; $('turowy-tytul').textContent = t(k); };
    if (!toJa && (zgloszone || (tu && tu.milczacy.length))) {
      pasek.className = 'czeka';
      tytul('web.stol.czekamNaRuch');
      $('turowy-powod').textContent = t('web.stol.czekamPowod', { kto: czekamNa });
    } else if (toJa) {
      pasek.className = 'ty';
      tytul('web.stol.twojRuch');
      $('turowy-powod').textContent = t('web.stol.twojPowod', { kto });
    } else {
      pasek.className = '';
      tytul('web.stol.trybTurowy');
      $('turowy-powod').textContent = t('web.stol.turowyPowod', { kto });
    }
    odliczTure();
  } else {
    terminTury = null;
  }
  const msgs = cien.messages.slice(-3);
  logEl.innerHTML = msgs.map(m => `<li>${escapeHtml(m.text)}</li>`).join('');
}

/**
 * Sekundy do chwili, w której stół ruszy bez milczącego.
 *
 * Migawki przychodzą przy zmianie stanu, a odliczanie musi iść samo - inaczej
 * liczba stoi i znowu wygląda to jak zawieszenie. Osobne pole `#turowy-zegar`,
 * żeby nie przepisywać całego zdania co sekundę.
 */
let terminTury = null;

function odliczTure() {
  const el = $('turowy-zegar');
  if (!el) return;
  if (terminTury === null) { el.hidden = true; return; }
  const zostalo = Math.max(0, Math.ceil((terminTury - Date.now()) / 1000));
  el.hidden = false;
  el.textContent = zostalo > 0 ? t('web.stol.ruszyZa', { s: zostalo }) : t('web.stol.rusza');
}
setInterval(odliczTure, 500);

// ---------- przy stole ----------

async function odswiezStol() {
  try {
    const r = await fetch('/api/stol');
    const d = await r.json();
    stolInfo = { trudnosc: d.trudnosc, pietra: d.pietra };
    pokazTrudnosc();
    $('stol').innerHTML = d.uczestnicy.map(u => {
      const kl = u.status !== 'playing' ? 'poza' : u.rodzaj === 'bot' ? 'bot' : 'czlowiek';
      const mnie = ja && u.hid === ja.hid ? ' ja' : '';
      return `<span class="gracz ${kl}${mnie}" title="${t(u.rodzaj === 'bot' ? 'web.stol.bot' : 'web.stol.czlowiek')}">`
        + `${escapeHtml(u.name)} <em>${t('web.stol.pietro', { d: u.depth })}</em></span>`;
    }).join('');
  } catch { /* serwer zaraz wróci */ }
}
/**
 * Stopień trudności stołu: znacznik w panelu i zdanie w poczekalni. Starszy
 * serwer nie przysyła pola - wtedy nic nie pokazujemy, zamiast pokazywać
 * „undefined".
 */
let stolInfo = null;
function pokazTrudnosc() {
  if (!stolInfo || !stolInfo.trudnosc) return;
  const nazwa = t(`trudnosc.${stolInfo.trudnosc}`);
  const tag = $('trudnosc');
  tag.hidden = false;
  tag.textContent = nazwa;
  tag.title = t('web.hud.trudnoscTytul', { pietra: stolInfo.pietra });
  $('stol-info').textContent = t('web.stol.trudnosc', { nazwa, pietra: stolInfo.pietra });
}
window.addEventListener('resize', () => { if (cien.poziom) renderer.resize(cien); });
// Płótno idzie za rozmiarem SWOJEGO miejsca, nie tylko za rozmiarem okna.
// Pasek trybu turowego albo dłuższy dziennik podnoszą stopkę, a wtedy plansza
// robi się niższa bez zmiany okna - płótno zostawało za duże i dolny pas mapy
// znikał pod stopką, przycięty przez `overflow: hidden`.
if (window.ResizeObserver) {
  new ResizeObserver(() => { if (cien.poziom || cien.level) renderer.resize(cien); })
    .observe(document.getElementById('stage'));
}

setInterval(odswiezStol, 2500);
odswiezStol();

// ---------- pętla klatek ----------

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (notice && now > noticeUntil) { notice = ''; $('notice').hidden = true; }
  view.step(dt);
  if (cien.ja && cien.kafle && cien.poziom.w > 0) {
    renderer.draw(cien, view, dt);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- wejście do partii ----------

$('wejdz').addEventListener('click', () => {
  const n = $('imie').value.trim();
  if (!n) { $('imie').focus(); return; }
  dosiadz(n);
});
$('imie').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('wejdz').click(); });

const zapamietane = sessionStorage.getItem('roguelike:miejsce');
if (zapamietane) {
  // Odświeżenie strony nie ma znaczyć nowej postaci - miejsce przy stole jest
  // to samo, dopóki trwa sesja przeglądarki. Ale znak przeżywa też restart
  // serwera, po którym nie znaczy już nic, więc pytamy stół, zanim na nim
  // cokolwiek zbudujemy.
  try {
    const m = JSON.parse(zapamietane);
    if (await miejsceIstnieje(m)) { ja = m; otworzStrumien(); }
    else doLobby(t('web.stol.nieIstnieje'));
  } catch { doLobby(); }
}

/**
 * Uchwyt diagnostyczny w konsoli - ten sam zwyczaj co w grze jednoosobowej.
 * Niesie WYŁĄCZNIE to, co i tak przyszło w migawce, więc nie da się nim
 * podejrzeć niczego, czego serwer nie przysłał.
 */
// Powierzchnia diagnostyczna. `odswiezHud` jest tu, żeby dało się sprawdzić
// panel stanu na PODSTAWIONYM stanie - inaczej pasek tury wspólnej da się
// zobaczyć tylko wtedy, gdy bot sam wejdzie w pole widzenia, czyli nigdy na
// żądanie. Podstawiane są DANE WEJŚCIOWE o kształcie migawki z serwera; kod
// rysujący jest ten sam, którym gra rysuje naprawdę.
window.roguelike = {
  get cien() { return cien; },
  get ja() { return ja; },
  get mode() { return mode; },
  get zgloszone() { return zgloszone; },
  // Rysowanie wystawione po to, żeby dało się ZMIERZYĆ położenie rzeczy na
  // ekranie - na przykład czy pasek trybu turowego nie zasłania bohatera.
  // Oba obiekty tylko do odczytu: to warstwa widoku, nie źródło stanu.
  get view() { return view; },
  get renderer() { return renderer; },
  zglos,
  odswiezHud,
  // Ekran przegranego starcia da się zobaczyć tylko wtedy, gdy ktoś naprawdę
  // przegra potyczkę - czyli nigdy na żądanie. Wystawiony, żeby dało się go
  // zmierzyć na PODSTAWIONEJ migawce, tym samym kodem, którym rysuje go gra.
  sprawdzPrzegrana,
  // Ekran końca przy stole - z tego samego powodu: na żądanie da się go
  // zobaczyć tylko na podstawionej migawce.
  koniec,
};


/**
 * Strona zgłasza własne awarie do stołu.
 *
 * Reguła z tego stanowiska: człowiek nie ma być przekaźnikiem między konsolą
 * przeglądarki a tym, kto naprawia. Bez tego kanału o wyjątku dowiadujemy się
 * wyłącznie wtedy, gdy gracz akurat patrzy w konsolę i chce przepisać treść -
 * a przy grze wystawionej publicznie to znaczy: nigdy.
 *
 * Zgłoszenia są DŁAWIONE. Jedna powtarzalna usterka w pętli rysowania potrafi
 * wyprodukować kilkadziesiąt wyjątków na sekundę i zalać log tak, że nie widać
 * w nim nic innego - czyli zabić dozór własnym sukcesem.
 */
const skargi = new Set();
let skargiWyslane = 0;
function poskarz(tekst) {
  const podpis = String(tekst).slice(0, 120);
  if (skargi.has(podpis) || skargiWyslane >= 20) return;
  skargi.add(podpis);
  skargiWyslane++;
  const gdzie = ja ? `miejsce ${ja.hid}` : 'przed wejściem';
  fetch('/api/skarga', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tekst: `${gdzie} | ${tekst}` }),
  }).catch(() => { /* skarga na brak sieci nie ma jak dojść */ });
}
window.addEventListener('error', (e) => {
  poskarz(`${e.message} @ ${e.filename ? e.filename.split('/').pop() : '?'}:${e.lineno}`);
});
window.addEventListener('unhandledrejection', (e) => {
  poskarz(`odrzucona obietnica: ${e.reason && e.reason.message ? e.reason.message : e.reason}`);
});

podpisz(document.getElementById('podpis'));

/**
 * Zmiana języka przy stole. Stół dostaje ją osobno, bo to on składa zdania
 * dziennika - każde w języku odbiorcy w chwili doręczenia. Język jednego
 * gracza nie rusza niczego u pozostałych (spec C-2). Starszy stół nie zna tego
 * adresu i odpowiada 404: wtedy zmienia się tylko to, co rysuje klient.
 */
function poZmianieJezyka(lang) {
  if (ja) post('/api/jezyk', { hid: ja.hid, token: ja.token, lang }).catch(() => {});
  podpisz(document.getElementById('podpis'));
  odswiezStol();
  if (!cien.ja) return;
  odswiezHud();
  if (mode === 'help') pokazZasady(ruleSection);
  else if (mode === 'over') koniec();
  else if (mode === 'obejrzyj') pokazObejrzenie();
  else if (mode === 'stos') pokazStos();
  else if (['inventory', 'drop', 'sniff'].includes(mode)) otworzPlecak(mode);
}
przelacznik(document.getElementById('jezyk'), poZmianieJezyka);
przelacznik(document.getElementById('jezyk-lobby'), poZmianieJezyka);
