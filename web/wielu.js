// Klient partii wieloosobowej.
//
// Różnica wobec gry jednoosobowej (`web/main.js`) jest jedna: silnika tu nie
// ma. Zamiast niego stoi ATRAPA (`web/cien.js`) karmiona migawkami z serwera,
// a naciśnięcie klawisza nie zmienia stanu, tylko ZGŁASZA zamiar. Skutek
// przychodzi z powrotem strumieniem - własny ruch wygląda więc tak samo jak
// cudzy, i to jest zamierzone: gdy dwoje graczy się widzi, ich tura rozstrzyga
// się jednocześnie, więc nikt nie może zobaczyć skutku swojego ruchu, zanim
// drugi zadeklaruje własny.

import { itemLabel, itemStats, polaSlowo } from '../src/items.js';
import { poloz, pojemnosc, zajetePola } from '../src/plecak.js';
import { obejrzyj } from '../src/ocena.js';
import { siatkaHtml, podepnijSiatke, trwaCiagniecie } from './plecak-ui.js';
import { statsHtml, obejrzyjHtml } from './opis.js';
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
const RULES = buildRules('web');

let ja = null;              // {hid, token, name}
let strumien = null;
let mode = 'lobby';         // 'lobby' | 'map' | 'inventory' | 'drop' | 'sniff' | 'help' | 'over'
let ruleSection = 0;
let zgloszone = null;       // ostatnie zgłoszone działanie, dopóki nie zeszła tura
let turaZgloszenia = -1;
let notice = '';
let noticeUntil = 0;
let wymiar = '';

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
  const napis = przycisk.textContent;
  przycisk.disabled = true;
  przycisk.textContent = 'Dosiadam...';
  try {
    const { code, body } = await post('/api/dosiadz', { name });
    if (code !== 200) { say(`Nie udało się dosiąść: ${body.blad || code}`); return; }
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
    przycisk.textContent = napis;
  }
}

let pierwszyWidok = false;

/** Przejście z ekranu wejścia do lochu. */
function doMapy() {
  mode = 'map';
  $('lobby').hidden = true;
  say('Miejsce zajęte, czekam na pierwszy widok lochu...', 4000);
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
    // Otwarty plecak żyje razem z migawką - inaczej po podniesieniu rzeczy
    // gracz patrzyłby na siatkę sprzed zmiany. W trakcie chwytu odświeżenie
    // czeka, bo przerysowanie wyrwałoby rzecz z ręki.
    if (mode === 'inventory' && !trwaCiagniecie()) otworzPlecak('inventory');
    odswiezHud();
  };
  strumien.onerror = async () => {
    // Zerwanie połączenia i NIEISTNIEJĄCE miejsce wyglądają w `EventSource`
    // tak samo, a różnią się wszystkim: pierwsze mija samo, drugiego nie
    // naprawi żadna liczba ponowień. Po restarcie serwera znak z poprzedniego
    // stołu jest bezwartościowy, więc trzeba to sprawdzić i wrócić do lobby -
    // inaczej gracz ogląda „próbuję dalej" bez końca, a przycisk wejścia jest
    // zablokowany, bo miejsce formalnie ma.
    if (ja && !(await miejsceIstnieje(ja))) return doLobby(
      'Stół został podniesiony od nowa - Twoja poprzednia partia przepadła. Wejdź jeszcze raz.');
    say('Zerwane połączenie ze stołem, próbuję dalej...', 4000);
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
  przycisk.textContent = 'Wejdź do lochu';
  if (powod) say(powod, 8000);
}

function zglos(action) {
  if (!ja || mode !== 'map' || !cien.ja || cien.ja.status !== 'playing') return;
  zgloszone = action;
  turaZgloszenia = cien.turn;
  post('/api/dzialanie', { hid: ja.hid, token: ja.token, action }).then(({ code, body }) => {
    if (code !== 200 || body.ok === false) { zgloszone = null; say(body.powod || body.blad || 'odmowa'); }
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
    if (Number.isInteger(n) && n >= 1 && n <= RULES.length) pokazZasady(n - 1);
    return;
  }
  if (mode === 'obejrzyj') {
    if (k === ',' || k === 'g') { zamknij(); zglos({ type: 'pickup' }); return; }
    zamknij();
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
    case ',': case 'g': zglos({ type: 'pickup' }); break;
    case '>': zglos({ type: 'descend' }); break;
    case '<': zglos({ type: 'ascend' }); break;
    case 'i': otworzPlecak('inventory'); break;
    case 'd': otworzPlecak('drop'); break;
    case 'w': otworzPlecak('sniff'); break;
    case 'x': pokazObejrzenie(); break;
    case '?': pokazZasady(ruleSection); break;
    case 'm': renderer.minimap = !renderer.minimap; say(renderer.minimap ? 'Plan włączony.' : 'Plan wyłączony.'); break;
    default: break;
  }
});

// ---------- nakładki ----------

function zamknij() { mode = 'map'; overlay.hidden = true; }

function uzyj(idx) {
  const typ = mode === 'drop' ? 'drop' : mode === 'sniff' ? 'sniff' : 'use';
  zamknij();
  zglos({ type: typ, index: idx });
}

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
  const o = it && naSiatce ? obejrzyj(it, p, cien.identified, etykieta) : null;
  // Rzecz pod nogami JEST, tylko starszy stół nie przysyła wymiarów plecaka -
  // wtedy pokazujemy tyle, ile wiemy, zamiast twierdzić, że nic tu nie leży.
  const tresc = it && !o
    ? `<h2>${escapeHtml(etykieta(it))}</h2>`
      + `<p>${statsHtml(itemStats(it, p, cien.identified)) || '<span class="muted">bez opisu</span>'}</p>`
      + '<p class="muted">Miejsce w plecaku policzy dopiero nowsza wersja stołu.</p>'
    : obejrzyjHtml(it ? etykieta(it) : '', o);
  panel.innerHTML = tresc
    + `<p class="foot">${it ? '<kbd>,</kbd> podnosi. ' : ''}<kbd>Esc</kbd> wraca.</p>`;
  overlay.hidden = false;
}

const INV_TITLE = { drop: 'Co wyrzucić?', sniff: 'Co powąchać?', inventory: 'Ekwipunek' };
const INV_HINT = { drop: 'wyrzuca', sniff: 'wącha', inventory: 'używa' };

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
      say(body.powod || body.blad || 'nie udało się przełożyć');
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
      + `<span class="nm">${escapeHtml(etykieta(it))}${ile}${noszone ? ' <em class="muted">(noszone)</em>' : ''}`
      + `${statsHtml(itemStats(it, p, cien.identified))}</span></li>`;
  }).join('');
  // Migawka ze STARSZEGO stołu nie zna plecaka na siatce - wtedy pokazujemy
  // sam spis, zamiast wywracać się na polu, którego serwer jeszcze nie wysyła.
  // Klient przeżywa serwer w wersji sprzed zmiany; to nie jest luksus, tylko
  // warunek tego, żeby wgranie nowego pliku nie kładło komuś trwającej partii.
  const naSiatce = !!(p.plecak && p.plecak.w);
  const licznik = naSiatce
    ? `${zajetePola(p)}/${pojemnosc(p)} ${polaSlowo(pojemnosc(p))}`
    : `${p.inventory.length} rzeczy`;
  panel.innerHTML = `
    <h2>${INV_TITLE[which]} <span class="muted">${licznik}</span></h2>
    <div class="ekwipunek">${which === 'inventory' && naSiatce ? siatkaHtml(p, etykieta) : ''}
      <ul>${rows || '<li class="muted">(pusto)</li>'}</ul></div>
    <p class="foot">Litera albo kliknięcie ${INV_HINT[which]}. ${which === 'inventory'
      ? '<kbd>d</kbd> otwiera to samo do wyrzucania. ' : ''}<kbd>Esc</kbd> wraca.</p>`;
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
    rysuj: (c, it) => renderer.drawItemShape(c.getContext('2d'), it,
      c.width / 2, c.height / 2, Math.min(c.width, c.height) - 8, cien, view),
  });
  overlay.hidden = false;
}

function pokazZasady(index) {
  mode = 'help';
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
    + `<p class="foot"><kbd>n</kbd> dalej &nbsp;<kbd>p</kbd> wstecz &nbsp;<kbd>Esc</kbd> wraca</p>`;
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
  panel.innerHTML = `<h2>${wygral ? 'Wyszedłeś z lochu' : 'Koniec'}</h2>`
    + `<p class="muted">${escapeHtml(p.cause || (wygral ? 'z Amuletem' : 'rany'))}</p>`
    + `<p class="muted">Poziom ${p.level}, doświadczenie ${p.xp}, głębokość ${p.depth}, tura ${cien.turn}.</p>`
    + `<p class="foot">Wciśnij <kbd>Enter</kbd>, żeby wrócić do wejścia i dosiąść jako ktoś nowy.</p>`;
  overlay.hidden = false;
}

// ---------- panel stanu ----------

const HUNGER = [[0, 'głoduje', 'tag red'], [150, 'słabnie', 'tag red'], [400, 'głodny', 'tag gold'], [Infinity, 'syty', 'tag']];
function hungerTag(v) { const r = HUNGER.find(x => v <= x[0]); return [r[1], r[2]]; }

function odswiezHud() {
  const p = cien.ja;
  if (!p) return;
  const frac = p.hp / p.maxHp;
  $('hpfill').style.width = `${Math.max(0, frac) * 100}%`;
  $('hpfill').style.background = frac > 0.5 ? 'var(--green)' : frac > 0.25 ? 'var(--gold)' : 'var(--red)';
  $('hptext').textContent = `${p.hp}/${p.maxHp}`;
  $('plevel').textContent = p.level;
  $('pxp').textContent = p.xp;
  $('patk').textContent = p.atak;
  $('pdef').textContent = p.obrona;
  $('pdepth').textContent = `${p.depth}/${p.maxDepth}`;
  $('pturn').textContent = cien.turn;
  $('pwrogi').textContent = cien.pietro.potwory;
  const [word, cls] = hungerTag(p.hunger);
  $('hunger').textContent = word;
  $('hunger').className = cls;
  $('amulet').hidden = !p.hasAmulet;

  // Oddech. Gracz musi widzieć, że cofanie się ma koniec, ZANIM zabraknie mu
  // tchu - inaczej odmowa ruchu wygląda jak zablokowana klawiatura, czyli
  // dokładnie ta wada, na którą właściciel zwrócił uwagę przy turze wspólnej.
  const zm = p.zmeczenie || 0, prog = p.progZmeczenia || 6;
  const bezTchu = zm >= prog;
  const oddech = $('oddech');
  oddech.hidden = zm < Math.ceil(prog / 2);
  oddech.textContent = bezTchu ? 'bez tchu' : `oddech ${prog - zm}`;
  oddech.className = bezTchu ? 'tag bad' : 'tag warn';
  oddech.title = bezTchu
    ? 'Cofasz się zbyt długo - najbliższa próba odwrotu skończy się przystankiem na oddech.'
    : `Możesz się jeszcze cofnąć ${prog - zm} razy, potem musisz zaczerpnąć powietrza.`;

  // Znacznik tury wspólnej. Gracz musi WIEDZIEĆ, że jego ruch czeka na kogoś -
  // inaczej nieruchomy ekran po naciśnięciu klawisza wygląda jak zawieszona gra.
  const wKontakcie = cien.kontakt.length > 0;
  const kto = cien.kontakt.map(k => k.name).join(', ');
  const t = $('kontakt');
  t.hidden = !wKontakcie;
  if (wKontakcie) {
    t.textContent = zgloszone ? `tura wspólna: czekasz na ${kto}` : `widzisz: ${kto}`;
    t.className = zgloszone ? 'tag gold' : 'tag';
  }

  // Pasek na planszy: nazywa stan, podaje powód i mówi, co gracz ma zrobić.
  const pasek = $('turowy');
  pasek.hidden = !wKontakcie;
  if (wKontakcie) {
    pasek.className = zgloszone ? 'czeka' : '';
    $('turowy-tytul').textContent = zgloszone ? 'CZEKAM NA RUCH' : 'TRYB TUROWY';
    $('turowy-powod').textContent = zgloszone
      ? `Ruch zgłoszony. Czekam na ${kto} - obie strony działają w tej samej turze, więc nikt nie dostaje darmowego ciosu.`
      : `${kto} w zasięgu wzroku. Wasze ruchy rozstrzygają się jednocześnie, więc plansza czeka na drugą stronę. To nie zawieszenie gry.`;
  }
  const msgs = cien.messages.slice(-3);
  logEl.innerHTML = msgs.map(m => `<li>${escapeHtml(m.text)}</li>`).join('');
}

// ---------- przy stole ----------

async function odswiezStol() {
  try {
    const r = await fetch('/api/stol');
    const d = await r.json();
    $('stol').innerHTML = d.uczestnicy.map(u => {
      const kl = u.status !== 'playing' ? 'poza' : u.rodzaj === 'bot' ? 'bot' : 'czlowiek';
      const mnie = ja && u.hid === ja.hid ? ' ja' : '';
      return `<span class="gracz ${kl}${mnie}" title="${u.rodzaj === 'bot' ? 'gracz automatyczny' : 'człowiek'}">`
        + `${escapeHtml(u.name)} <em>p${u.depth}</em></span>`;
    }).join('');
  } catch { /* serwer zaraz wróci */ }
}
window.addEventListener('resize', () => { if (cien.poziom) renderer.resize(cien); });

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
    else doLobby('Poprzedni stół już nie istnieje - wejdź jeszcze raz.');
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
  zglos,
  odswiezHud,
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
