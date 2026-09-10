// Klient partii wieloosobowej.
//
// Różnica wobec gry jednoosobowej (`web/main.js`) jest jedna: silnika tu nie
// ma. Zamiast niego stoi ATRAPA (`web/cien.js`) karmiona migawkami z serwera,
// a naciśnięcie klawisza nie zmienia stanu, tylko ZGŁASZA zamiar. Skutek
// przychodzi z powrotem strumieniem - własny ruch wygląda więc tak samo jak
// cudzy, i to jest zamierzone: gdy dwoje graczy się widzi, ich tura rozstrzyga
// się jednocześnie, więc nikt nie może zobaczyć skutku swojego ruchu, zanim
// drugi zadeklaruje własny.

import { itemLabel } from '../src/items.js';
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
    return r.status === 200;
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

  if (mode === 'over') { if (k === 'Enter' || k === ' ') location.reload(); return; }
  if (mode === 'help') {
    if (k === 'Escape' || k === '?' || k === 'q') { zamknij(); return; }
    if (k === 'n' || k === ' ' || k === 'ArrowRight' || k === 'ArrowDown') { pokazZasady(ruleSection + 1); return; }
    if (k === 'p' || k === 'ArrowLeft' || k === 'ArrowUp') { pokazZasady(ruleSection - 1); return; }
    const n = Number(k);
    if (Number.isInteger(n) && n >= 1 && n <= RULES.length) pokazZasady(n - 1);
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

const INV_TITLE = { drop: 'Co wyrzucić?', sniff: 'Co powąchać?', inventory: 'Ekwipunek' };
const INV_HINT = { drop: 'wyrzuca', sniff: 'wącha', inventory: 'używa' };

function otworzPlecak(which) {
  mode = which;
  const p = cien.ja;
  const rows = p.inventory.map((it, i) => {
    const nazwa = itemLabel(it, cien.appearances, cien.identified, cien.sniffed);
    const noszone = it === p.weapon || it === p.armor
      || (p.weapon && it.id === p.weapon.id) || (p.armor && it.id === p.armor.id);
    return `<li class="item" data-i="${i}"><span class="key">${String.fromCharCode(97 + i)}</span>`
      + `<canvas class="ico" width="44" height="44"></canvas>`
      + `<span class="nm">${escapeHtml(nazwa)}${noszone ? ' <em class="muted">(noszone)</em>' : ''}</span></li>`;
  }).join('');
  panel.innerHTML = `
    <h2>${INV_TITLE[which]} <span class="muted">${p.inventory.length}/16</span></h2>
    <ul>${rows || '<li class="muted">(pusto)</li>'}</ul>
    <p class="foot">Litera albo kliknięcie ${INV_HINT[which]}. <kbd>Esc</kbd> wraca.</p>`;
  panel.querySelectorAll('li.item').forEach(li => {
    const it = p.inventory[Number(li.dataset.i)];
    const c = li.querySelector('canvas.ico');
    if (c && it) renderer.drawItemShape(c.getContext('2d'), it, 22, 22, 40, cien, view);
    li.addEventListener('click', () => uzyj(Number(li.dataset.i)));
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
  const wygral = p.status === 'won';
  panel.innerHTML = `<h2>${wygral ? 'Wyszedłeś z lochu' : 'Koniec'}</h2>`
    + `<p class="muted">${escapeHtml(p.cause || (wygral ? 'z Amuletem' : 'rany'))}</p>`
    + `<p class="muted">Poziom ${p.level}, doświadczenie ${p.xp}, głębokość ${p.depth}, tura ${cien.turn}.</p>`
    + `<p class="foot">Odśwież stronę albo wciśnij <kbd>Enter</kbd>, żeby dosiąść na nowo.</p>`;
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
  const [word, cls] = hungerTag(p.hunger);
  $('hunger').textContent = word;
  $('hunger').className = cls;
  $('amulet').hidden = !p.hasAmulet;

  // Znacznik tury wspólnej. Gracz musi WIEDZIEĆ, że jego ruch czeka na kogoś -
  // inaczej nieruchomy ekran po naciśnięciu klawisza wygląda jak zawieszona gra.
  const wKontakcie = cien.kontakt.length > 0;
  const t = $('kontakt');
  t.hidden = !wKontakcie;
  if (wKontakcie) {
    t.textContent = zgloszone
      ? `tura wspólna: czekasz na ${cien.kontakt.map(k => k.name).join(', ')}`
      : `widzisz: ${cien.kontakt.map(k => k.name).join(', ')}`;
    t.className = zgloszone ? 'tag gold' : 'tag';
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
window.roguelike = {
  get cien() { return cien; },
  get ja() { return ja; },
  get mode() { return mode; },
  get zgloszone() { return zgloszone; },
  zglos,
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
