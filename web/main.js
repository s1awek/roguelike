// Spinacz wersji graficznej: wejście, pętla klatek, HUD, zapis.
//
// Ten plik NIE zawiera ani jednej reguły gry. Wszystkie decyzje podejmuje ten sam
// `Game`, który chodzi w terminalu - tutaj są wyłącznie klawisze, piksele i
// `localStorage`. Gdyby kiedyś okazało się, że wersja graficzna zachowuje się
// inaczej niż terminalowa, winy trzeba szukać w tym pliku, nie w silniku.

import { Game } from '../src/game.js';
import { TRUDNOSCI, DOMYSLNA_TRUDNOSC, ustalTrudnosc } from '../src/trudnosc.js';
import { serialize, loadFromString } from '../src/serialize.js';
import { itemLabel, itemStats } from '../src/items.js';
import { t, getLang } from '../src/i18n.js';
import { opisPrzyczyny } from '../src/przyczyny.js';
import { ustalJezyk, przelacznik } from './jezyk.js';
import { pojemnosc, zajetePola, poleRzeczy, wolnePola } from '../src/plecak.js';
import { siatkaHtml, podepnijSiatke } from './plecak-ui.js';
import { statsHtml, obejrzyjHtml, stanyHtml, stosHtml, dziennikHtml, postepDosw } from './opis.js';
import { wstawIkony } from './ikony.js';
import { buildRules } from '../src/rules.js';
import { findPath } from '../src/path.js';
import { WALL } from '../src/map.js';
import { Renderer } from './draw.js';
import { View } from './view.js';
import { podpisz } from './autor.js';
import { DIR, SHIFTED_BY_CODE } from './klawisze.js';

const SAVE_KEY = 'roguelike:save';   // zapis ręczny, robiony klawiszem S
const AUTO_KEY = 'roguelike:auto';   // autozapis, nadpisywany po każdej turze
const STEP_MS = 108;             // tempo marszu po kliknięciu
const WALK_LIMIT = 400;          // twardy sufit, żeby marsz nie mógł trwać w nieskończoność
const AUTO_MS = 450;             // nie częściej niż tyle - serializacja to kilkadziesiąt kB

const canvas = document.getElementById('map');
const overlay = document.getElementById('overlay');
const panel = document.getElementById('panel');
const logEl = document.getElementById('log');

const renderer = new Renderer(canvas);
const view = new View();

const params = new URLSearchParams(location.search);
let mode = 'map';                // 'map' | 'inventory' | 'drop' | 'sniff' | 'stos' | 'obejrzyj' | 'help' | 'over'
// Księga budowana w języku czytającego i trzymana osobno dla każdego języka -
// zbudowana raz przy starcie zostawałaby w języku, w którym strona wstała.
const ksiegi = {};
const rules = () => (ksiegi[getLang()] ??= buildRules('web'));
let ruleSection = 0;
let walk = null;
let notice = '';
let noticeUntil = 0;

ustalJezyk();
wstawIkony(document.getElementById('hud'));

// Odświeżenie karty nie może kosztować rozgrywki. Stan wraca z autozapisu, chyba
// że w adresie stoi jawne ziarno - wtedy gracz prosi o KONKRETNĄ grę i to on ma
// rację, nie zapisany stan.
let game = null;
const seedParam = params.get('seed');
// Stopień trudności: z adresu (`?difficulty=easy|normal|hard`), a bez niego
// ostatni wybrany; bez obu - normalny (D-055). Zapamiętany wybór to wygoda
// na następną partię, nie stan gry - stan gry niesie stopień w zapisie.
const TRUDNOSC_KEY = 'roguelike:trudnosc';
const trudnoscParam = ustalTrudnosc(params.get('difficulty'));
let trudnosc = trudnoscParam ?? ustalTrudnosc(storageGet(TRUDNOSC_KEY)) ?? DOMYSLNA_TRUDNOSC;
const raw = storageGet(AUTO_KEY);
if (raw) {
  const r = loadFromString(raw);
  if (!r.ok) storageRemove(AUTO_KEY);          // zapis obcy albo uszkodzony nie blokuje startu
  // Adres z ziarnem prosi o KONKRETNĄ grę. Autozapis tego samego ziarna to ta
  // sama rozgrywka, więc wraca; autozapis innej gry zostaje pominięty i za
  // chwilę nadpisany - takie jest znaczenie jawnego ziarna w adresie.
  // Adres ze stopniem działa tak samo: autozapis na innym stopniu jest inną grą.
  else if ((!seedParam || String(r.game.seed) === seedParam)
    && (!trudnoscParam || r.game.trudnosc === trudnoscParam)) game = r.game;
}
const resumed = !!game;
if (!game) game = new Game(seedParam || String(Date.now()), { trudnosc });
trudnosc = game.trudnosc;
// Komunikat o wznowieniu NIE idzie do dziennika gry, bo dziennik jest częścią
// zapisanego stanu - co odświeżenie dopisywałoby do niego kolejny wiersz.
if (!resumed) game.message('wejscie');
// Parametry testowe do oglądania konkretnego miejsca gry bez przechodzenia
// całego lochu: `?pietro=N` przenosi bohatera na piętro N (w zakresie lochu),
// `?amulet=1` daje mu Amulet do ręki. Działają na bieżącej partii, także
// wznowionej - to celowe, właściciel chce oglądać SWOJĄ partię, nie nową.
const pietroParam = Number(params.get('pietro'));
if (game.status === 'playing' && Number.isInteger(pietroParam)
  && pietroParam >= 1 && pietroParam <= game.maxDepth && pietroParam !== game.depth) {
  game.enterLevel(pietroParam, pietroParam > game.depth ? 'down' : 'up');
}
if (params.get('amulet') === '1' && game.status === 'playing') game.player.hasAmulet = true;
// `?bog=1` włącza nieśmiertelność (`?bog=0` wyłącza); stan jedzie w zapisie
// razem z bohaterem, więc trzyma się do odwołania, a znacznik w panelu mówi,
// że partia nie jest uczciwa.
if (params.has('bog')) game.player.niesmiertelny = params.get('bog') === '1';
view.sync(game);
renderer.resize(game);

// ---------- tura ----------

/** Jedyna droga, którą stan gry może się zmienić. Wszystko inne tylko czyta. */
function act(action) {
  if (game.status !== 'playing') return;
  game.act(action);
  view.sync(game);
  autoDirty = true;
  if (game.status !== 'playing') { walk = null; flushAuto(); showGameOver(); }
  updateHud();
}

function say(text) {
  notice = text;
  noticeUntil = performance.now() + 2600;
}

// ---------- marsz po kliknięciu ----------

function passableKnown(x, y) {
  const L = game.level;
  if (x < 0 || y < 0 || x >= L.w || y >= L.h) return false;
  // Marsz wolno planować WYŁĄCZNIE przez pola już poznane. Inaczej klikanie
  // w ciemność byłoby darmowym wykrywaczem korytarzy.
  if (!game.isRemembered(x, y)) return false;
  return L.at(x, y) !== WALL;
}

function threatInSight() {
  return game.monsters.some(m => m.hp > 0 && !m.asleep && game.isVisible(m.x, m.y));
}

function startWalk(tx, ty) {
  if (mode !== 'map' || game.status !== 'playing') return;
  if (threatInSight()) { say(t('web.nieWObecnosci')); return; }
  if (!passableKnown(tx, ty)) return;
  const path = findPath({ x: game.player.x, y: game.player.y }, { x: tx, y: ty }, passableKnown);
  if (!path || !path.length) return;
  walk = { path: path.slice(0, WALK_LIMIT), i: 0, hp: game.player.hp, next: 0 };
}

function stepWalk(now) {
  if (!walk || now < walk.next) return;
  // Marsz przerywa się sam przy pierwszym sygnale, że dzieje się coś istotnego.
  if (game.status !== 'playing' || threatInSight() || game.player.hp < walk.hp) { walk = null; return; }
  const step = walk.path[walk.i++];
  if (!step) { walk = null; return; }
  const dx = Math.sign(step.x - game.player.x);
  const dy = Math.sign(step.y - game.player.y);
  if (!dx && !dy) { walk = null; return; }
  act({ type: 'move', dx, dy });
  walk && (walk.next = now + STEP_MS);
  if (walk && game.itemAt(game.player.x, game.player.y)) walk = null;
  if (walk && walk.i >= walk.path.length) walk = null;
}

// ---------- klawiatura ----------

/** Ostatnie klawisze - do odczytania w konsoli, gdy sterowanie zachowa się dziwnie. */
const keyLog = [];

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  let k = e.key;
  if (e.shiftKey && SHIFTED_BY_CODE[e.code]) k = SHIFTED_BY_CODE[e.code];

  keyLog.push({ key: e.key, code: e.code, shift: e.shiftKey, uzyto: k });
  if (keyLog.length > 24) keyLog.shift();

  if (DIR[k] || ['.', ',', '5', 'g', '>', '<', 'i', 'd', 'w', '?', 'S', 'L', 'N', 'm', 'Escape', ' '].includes(k)) e.preventDefault();

  if (walk) { walk = null; return; }   // dowolny klawisz przerywa marsz

  if (mode === 'over') {
    if (k === 'Enter' || k === ' ') newGame();          // ten sam stopień, nowa partia
    else if (k === 'N') pokazWyborTrudnosci();
    return;
  }
  if (mode === 'nowa') {
    if (k === 'Escape' || k === 'q') { zamknijWybor(); return; }
    const n = Number(k);
    const stopnie = Object.keys(TRUDNOSCI);
    if (Number.isInteger(n) && n >= 1 && n <= stopnie.length) newGame(stopnie[n - 1]);
    return;
  }
  // Księga zasad: rozdziały przeglądane bez wychodzenia z gry. Świat stoi,
  // więc czytanie nie kosztuje tury i nie przeczeka potwora.
  if (mode === 'help') {
    if (k === 'Escape' || k === '?' || k === 'q') { closeOverlay(); return; }
    if (k === 'n' || k === ' ' || k === 'ArrowRight' || k === 'ArrowDown') { showRules(ruleSection + 1); return; }
    if (k === 'p' || k === 'ArrowLeft' || k === 'ArrowUp') { showRules(ruleSection - 1); return; }
    const n = Number(k);
    if (Number.isInteger(n) && n >= 1 && n <= rules().length) showRules(n - 1);
    return;
  }

  // Oglądanie nic nie kosztuje, więc wychodzi się z niego dowolnym klawiszem,
  // a przecinek podnosi od razu - bez wracania na mapę po tę samą decyzję.
  if (mode === 'obejrzyj') {
    if (k === ',' || k === 'g') { closeOverlay(); podnies(); return; }
    closeOverlay();
    return;
  }

  // Wybór z kupki. Zaznaczanie NIE zamyka okna - zamyka je dopiero Enter albo
  // Esc. O to prosił właściciel wprost: „nie tak, że raz klikamy i okienko
  // znika, tylko zaznaczamy i zatwierdzamy".
  if (mode === 'stos') {
    if (k === 'Escape' || k === 'q') { closeOverlay(); return; }
    if (k === 'Enter') { potwierdzStos(); return; }
    if (k === '*') { zaznaczWszystko(); return; }
    const idx = k.length === 1 ? k.charCodeAt(0) - 97 : -1;
    if (idx >= 0 && idx < stos.length) przelaczWybor(idx);
    return;
  }

  if (mode === 'inventory' || mode === 'drop' || mode === 'sniff') {
    if (k === 'Escape' || k === 'i' || k === 'q') { closeOverlay(); return; }
    const idx = k.length === 1 ? k.charCodeAt(0) - 97 : -1;
    if (idx >= 0 && idx < game.player.inventory.length) useSlot(idx);
    return;
  }

  if (DIR[k]) { const [dx, dy] = DIR[k]; act({ type: 'move', dx, dy }); return; }

  switch (k) {
    case '.': case '5': act({ type: 'wait' }); break;
    case ',': case 'g': podnies(); break;
    case '>': act({ type: 'descend' }); break;
    case '<': act({ type: 'ascend' }); break;
    case 'i': openInventory('inventory'); break;
    case 'd': openInventory('drop'); break;
    case 'w': openInventory('sniff'); break;
    case 'x': pokazObejrzenie(); break;
    case '?': showRules(ruleSection); break;
    case 'S': doSave(); break;
    case 'L': doLoad(); break;
    case 'm': renderer.minimap = !renderer.minimap; say(t(renderer.minimap ? 'web.minimapaWl' : 'web.minimapaWyl')); break;
    case 'N': pokazWyborTrudnosci(); break;
    default: break;
  }
});

// ---------- mysz ----------

canvas.addEventListener('click', (e) => {
  const r = canvas.getBoundingClientRect();
  const px = e.clientX - r.left;
  const py = e.clientY - r.top;
  // Kliknięcie w plan znaczy to samo co kliknięcie w loch: idź tam. Bez tego
  // trafienie w minimapę zlecałoby marsz w przypadkowe pole POD nią.
  if (renderer.inMinimap(px, py)) {
    const t = renderer.minimapTileAt(px, py);
    if (t) startWalk(t.x, t.y);
    return;
  }
  const { x, y } = renderer.tileAt(px, py);
  if (x === game.player.x && y === game.player.y) { act({ type: 'wait' }); return; }
  startWalk(x, y);
});

// ---------- nakładki ----------

function closeOverlay() { mode = 'map'; overlay.hidden = true; }

// Kliknięcie w ciemne tło poza oknem zamyka je tak samo jak Esc - to też jest
// decyzja gracza (D-044). Ekran końca partii nie ma czego zamykać.
overlay.addEventListener('click', (e) => {
  if (e.target !== overlay || mode === 'over') return;
  if (mode === 'nowa') { zamknijWybor(); return; }
  closeOverlay();
});

/**
 * Użycie rzeczy z ekwipunku. Panel ZOSTAJE otwarty.
 *
 * Właściciel ujął to regułą, która obowiązuje w całym interfejsie: „wyjście
 * z ekwipunku powinno być świadomą decyzją, a nie automatyczną konsekwencją
 * jakiejś akcji". Zamykanie panelu po każdym użyciu kazało otwierać go od nowa
 * przy wypiciu drugiej mikstury albo wyrzuceniu drugiej rzeczy.
 */
function useSlot(idx) {
  const which = mode;
  const action = mode === 'drop' ? 'drop' : mode === 'sniff' ? 'sniff' : 'use';
  act({ type: action, index: idx });
  // Wyjątkiem jest koniec partii: nie ma już czego układać w plecaku.
  if (game.player.status === 'playing') openInventory(which);
  else closeOverlay();
}

/**
 * Obejrzenie rzeczy leżącej pod nogami. Nie kosztuje tury i nie rusza świata -
 * to odczytanie tego, co gracz ma przed oczami, a nie działanie.
 */
function pokazObejrzenie() {
  const it = game.podNogami();
  mode = 'obejrzyj';
  const o = game.obejrzyj(it);
  const nazwa = it ? itemLabel(it, game.appearances, game.identified, game.sniffed) : '';
  panel.innerHTML = obejrzyjHtml(nazwa, o)
    + `<p class="foot">${o ? t('web.podnosiKbd') : ''}${t('web.escWraca')}</p>`;
  overlay.hidden = false;
}

// ---------- kupka pod nogami ----------

let stos = [];                     // rzeczy leżące pod nogami, gdy okno otwarte
let wybrane = new Set();           // identyfikatory zaznaczonych

/**
 * Podniesienie z podłogi. Jedna rzecz idzie od razu - okno wyboru przy jednej
 * pozycji byłoby kliknięciem za dużo. Kilka rzeczy otwiera wybór.
 */
function podnies() {
  const pod = game.stosPodNogami();
  if (pod.length <= 1) { act({ type: 'pickup' }); return; }
  stos = pod;
  wybrane = new Set(pod.map(i => i.id));   // domyślnie wszystko - najczęstszy zamiar
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
  closeOverlay();
  if (ids.length) act({ type: 'pickup', ids });
}

function pokazStos() {
  mode = 'stos';
  const p = game.player;
  const etykieta = (it) => itemLabel(it, game.appearances, game.identified, game.sniffed);
  const lista = stos.map((it) => {
    const o = game.obejrzyj(it);
    return {
      nazwa: etykieta(it),
      opis: itemStats(it, p, game.identified).opis,
      pola: `${poleRzeczy(it)} ${t('pola', { n: poleRzeczy(it) })}`,
      wybrane: wybrane.has(it.id),
      werdykt: o ? o.werdykt : '',
      ton: o ? o.ton : '',
    };
  });
  const zajmie = stos.filter(i => wybrane.has(i.id)).reduce((a, i) => a + poleRzeczy(i), 0);
  panel.innerHTML = stosHtml(lista, { zajmie, wolne: wolnePola(p) });
  panel.querySelectorAll('li.wybor').forEach(li => {
    const it = stos[Number(li.dataset.i)];
    const c = li.querySelector('canvas.ico');
    if (c && it) renderer.drawItemShape(c.getContext('2d'), it, 22, 22, 40, game, view);
    li.addEventListener('click', () => przelaczWybor(Number(li.dataset.i)));
  });
  overlay.hidden = false;
}

const INV_TITLE = { drop: 'term.coWyrzucic', sniff: 'term.coPowachac', inventory: 'term.ekwipunek' };
const INV_HINT = { drop: 'web.inv.drop', sniff: 'web.inv.sniff', inventory: 'web.inv.use' };

function openInventory(which) {
  mode = which;
  const p = game.player;
  const etykieta = (it) => itemLabel(it, game.appearances, game.identified, game.sniffed);
  const rows = p.inventory.map((it, i) => {
    const marks = [];
    if (p.weapon === it) marks.push(t('term.wDloni'));
    if (p.armor === it) marks.push(t('term.naSobie'));
    const worn = marks.length ? `<span class="worn">(${marks.join(', ')})</span>` : '';
    const ile = (it.ile || 1) > 1 ? `<span class="worn">x${it.ile}</span>` : '';
    return `<li class="item" data-i="${i}"><span class="key">${String.fromCharCode(97 + i)})</span>
      <canvas class="ico" width="44" height="44"></canvas>
      <span class="nm">${escapeHtml(etykieta(it))} ${ile} ${worn}
      ${statsHtml(itemStats(it, p, game.identified))}</span></li>`;
  }).join('');
  const poj = pojemnosc(p);
  panel.innerHTML = `
    <h2>${t(INV_TITLE[which])} <span class="muted">${zajetePola(p)}/${poj} ${t('pola', { n: poj })}</span></h2>
    <div class="ekwipunek">${which === 'inventory' ? siatkaHtml(p, etykieta, { kosz: true }) : ''}
      <ul>${rows || `<li class="muted">${t('web.pusto')}</li>`}</ul></div>
    ${dziennikHtml(game.messages)}
    <p class="foot">${t('web.inv.stopka', { co: t(INV_HINT[which]) })}${which === 'inventory'
      ? t('web.inv.dWyrzuca') : ''}${t('web.escWraca')}</p>`;
  // Ikona rysowana tą samą funkcją co przedmiot leżący na podłodze. Dzięki temu
  // "czarna mikstura" w plecaku to dokładnie ta czarna flaszka, którą gracz
  // widział na kaflu - a nie osobna, rozjeżdżająca się z czasem grafika.
  panel.querySelectorAll('li.item').forEach(li => {
    const it = p.inventory[Number(li.dataset.i)];
    const c = li.querySelector('canvas.ico');
    if (c && it) renderer.drawItemShape(c.getContext('2d'), it, 22, 22, 40, game, view);
    li.addEventListener('click', () => useSlot(Number(li.dataset.i)));
  });
  // Przekładanie w plecaku NIE jest działaniem w świecie: nie kosztuje tury
  // i nie rusza gry, więc idzie prosto do silnika, z pominięciem `act`.
  podepnijSiatke(panel, p, {
    przeloz: (i, x, y, obrot) => {
      if (i >= 0) game.przelozWPlecaku(p, i, x, y, obrot);
      openInventory(which);
    },
    uzyj: (i) => useSlot(i),
    // Wyrzucenie JEST działaniem w świecie - kosztuje turę i idzie przez `act`,
    // inaczej niż przekładanie tuż wyżej.
    // Ekwipunek zostaje otwarty: wyrzucanie rzadko dotyczy jednej rzeczy, a
    // zamykanie panelu po każdej kazałoby otwierać go od nowa pięć razy pod rząd.
    wyrzuc: (i) => {
      act({ type: 'drop', index: i });
      if (game.player.status === 'playing') openInventory(which);
      else closeOverlay();
    },
    rysuj: (c, it) => renderer.drawItemShape(c.getContext('2d'), it,
      c.width / 2, c.height / 2, Math.min(c.width, c.height) - 8, game, view),
  });
  overlay.hidden = false;
}

/**
 * Księga zasad. Ta sama treść, co w terminalu i w `docs/zasady.md` - jedno
 * źródło w `src/rules.js`. Nakładka NIE zatrzymuje ani nie przesuwa gry:
 * świat stoi, dopóki gracz czegoś nie zrobi, więc czytania nie da się użyć
 * do przeczekania potwora.
 */
function showRules(index) {
  mode = 'help';
  const RULES = rules();
  ruleSection = ((index % RULES.length) + RULES.length) % RULES.length;
  const sec = RULES[ruleSection];
  const nav = RULES.map((r, i) =>
    `<button class="tab${i === ruleSection ? ' on' : ''}" data-i="${i}">${escapeHtml(r.title)}</button>`).join('');

  const body = sec.blocks.map(b => {
    if (b.t === 'p') return `<p class="muted">${escapeHtml(b.text)}</p>`;
    if (b.t === 'note') return `<p class="note">${escapeHtml(b.text)}</p>`;
    const head = b.head.map(h => `<th>${escapeHtml(h)}</th>`).join('');
    const rows = b.rows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('');
    return `<div class="tw"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }).join('');

  panel.innerHTML = `
    <h2>${t('term.ksiega')} <span class="muted">${t('term.rozdzial', { i: ruleSection + 1, n: RULES.length })}</span></h2>
    <nav class="tabs">${nav}</nav>
    <h3>${escapeHtml(sec.title)}</h3>
    ${body}
    <p class="foot">${t('web.ksiegaStopka', { n: RULES.length, seed: escapeHtml(String(game.seed)) })}</p>`;
  panel.querySelectorAll('button.tab').forEach(btn =>
    btn.addEventListener('click', () => showRules(Number(btn.dataset.i))));
  panel.scrollTop = 0;
  overlay.hidden = false;
}

function showGameOver() {
  mode = 'over';
  const won = game.status === 'won';
  panel.innerHTML = `
    <h2 class="${won ? 'win' : 'lose'}">${t(won ? 'term.zwyciestwo' : 'term.koniecGry')}</h2>
    <dl>
      <dt>${t('web.go.przyczyna')}</dt><dd>${escapeHtml(String(opisPrzyczyny(game.cause)))}</dd>
      <dt>${t('web.go.glebokosc')}</dt><dd>${game.depth}</dd>
      <dt>${t('web.go.trudnosc')}</dt><dd>${t(`trudnosc.${game.trudnosc}`)}</dd>
      <dt>${t('web.go.poziom')}</dt><dd>${game.player.level}</dd>
      <dt>${t('web.go.dosw')}</dt><dd>${game.player.xp}</dd>
      <dt>${t('web.go.pokonanych')}</dt><dd>${game.player.kills}</dd>
      <dt>${t('web.go.tur')}</dt><dd>${game.turn}</dd>
      <dt>${t('web.go.wynik')}</dt><dd><b>${game.score()}</b></dd>
      <dt>${t('web.go.ziarno')}</dt><dd>${escapeHtml(String(game.seed))}</dd>
    </dl>
    <p class="foot">${t('web.go.stopka')}</p>`;
  overlay.hidden = false;
}

/**
 * Wybór stopnia przy nowej grze (Shift+N). Osobne okno, bo nowa gra porzuca
 * bieżącą - wybór stopnia jest przy okazji potwierdzeniem tej decyzji.
 */
function pokazWyborTrudnosci() {
  mode = 'nowa';
  panel.innerHTML = `
    <h2>${t('web.nowa.tytul')}</h2>
    <p class="muted">${t('web.nowa.opis')}</p>
    <div class="wybor-trudnosci">${Object.entries(TRUDNOSCI).map(([k, T], i) => `
      <button data-trudnosc="${k}" class="${k === trudnosc ? 'biezacy' : ''}">
        <b>${i + 1}</b><span class="nazwa">${t(`trudnosc.${k}`)}</span>
        <small>${t('web.nowa.szczegoly', { pietra: T.pietra, potwory: Math.round(T.potwory * 100), glod: Math.round(T.glod * 100) })}</small>
      </button>`).join('')}
    </div>
    <p class="foot">${t('web.nowa.stopka')}</p>`;
  panel.querySelectorAll('button[data-trudnosc]').forEach(b => b.addEventListener('click', () => newGame(b.dataset.trudnosc)));
  panel.scrollTop = 0;
  overlay.hidden = false;
}

/** Rezygnacja z wyboru: wracamy tam, skąd okno wyszło - na mapę albo na ekran końca. */
function zamknijWybor() {
  if (game.status !== 'playing') showGameOver(); else closeOverlay();
}

function newGame(stopien = trudnosc) {
  trudnosc = ustalTrudnosc(stopien) ?? DOMYSLNA_TRUDNOSC;
  try { localStorage.setItem(TRUDNOSC_KEY, trudnosc); } catch { /* bez pamięci wyboru gra działa tak samo */ }
  game = new Game(String(Date.now()), { trudnosc });
  view.reset();
  view.depth = null;
  view.lastPlayerHp = null;
  view.lastPlayerPos = null;
  game.message('wejscie');
  view.sync(game);
  renderer.resize(game);
  closeOverlay();
  updateHud();
  flushAuto();
}

// ---------- zapis ----------

// `localStorage` bywa niedostępny nie tylko przez brak miejsca: tryb prywatny,
// zablokowane dane witryn, strona otwarta z pliku. Każde dotknięcie idzie więc
// przez try, a gra ma działać dalej także wtedy, gdy zapis jest niemożliwy.
function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageRemove(key) {
  try { localStorage.removeItem(key); } catch { /* nic nie da się zrobić */ }
}

let autoDirty = false;
let autoLast = 0;
let autoBroken = false;   // po pierwszej odmowie nie próbujemy co pół sekundy

/**
 * Autozapis. Osobny klucz niż zapis ręczny (S) - inaczej każda tura kasowałaby
 * punkt kontrolny, który gracz zrobił świadomie.
 * Gra skończona autozapisu NIE zostawia: po śmierci odświeżenie ma dać nową grę,
 * a nie wieczny ekran końcowy.
 */
function flushAuto() {
  if (autoBroken) return;
  autoDirty = false;
  autoLast = performance.now();
  try {
    if (game.status !== 'playing') { localStorage.removeItem(AUTO_KEY); return; }
    localStorage.setItem(AUTO_KEY, serialize(game));
    blinkAuto();
  } catch (e) {
    autoBroken = true;
    say(t('web.autozapisNiemozliwy', { powod: e.message }));
    const tag = $('autotag');
    if (tag) { tag.dataset.t = 'web.bezAutozapisu'; tag.textContent = t('web.bezAutozapisu'); tag.className = 'tag bad'; }
  }
}

let blinkUntil = 0;
function blinkAuto() {
  const tag = $('autotag');
  if (!tag) return;
  tag.classList.add('lit');
  blinkUntil = performance.now() + 650;
}

function doSave() {
  try { localStorage.setItem(SAVE_KEY, serialize(game)); say(t('web.zapisano')); }
  catch (e) { say(t('web.zapisNieudany', { powod: e.message })); }
}

function doLoad() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) { say(t('zapis.brak')); return; }
  const r = loadFromString(raw);
  if (!r.ok) { say(r.error); return; }
  game = r.game;
  trudnosc = game.trudnosc;   // nowa partia po tej wczytanej ma iść na jej stopniu
  view.reset();
  view.depth = null;
  view.lastPlayerHp = null;
  view.lastPlayerPos = null;
  view.sync(game);
  renderer.resize(game);
  say(t('web.wczytano'));
  autoDirty = true;
  updateHud();
  // Zapis zrobiony tuż przed śmiercią wczytywał się do stanu, w którym gra jest
  // skończona, ale ekran końcowy nie padał - bo dotąd pokazywał go wyłącznie
  // `act()`. Gracz oglądał wtedy planszę, na której nic nie reaguje.
  if (game.status !== 'playing') showGameOver();
}

// ---------- HUD ----------

const $ = (id) => document.getElementById(id);

function updateHud() {
  const p = game.player;
  const frac = p.hp / p.maxHp;
  $('hpfill').style.width = `${Math.max(0, frac) * 100}%`;
  $('hpfill').style.background = frac > 0.5 ? 'var(--green)' : frac > 0.25 ? 'var(--gold)' : 'var(--red)';
  $('hptext').textContent = `${p.hp}/${p.maxHp}`;
  $('plevel').textContent = p.level;
  const dosw = postepDosw(p);
  $('pxp').textContent = dosw.xp;
  $('pxpprog').textContent = dosw.prog;
  $('xpfill').style.width = `${dosw.frakcja * 100}%`;
  $('patk').textContent = game.playerAttack();
  $('pdef').textContent = game.playerDefense();
  $('pdepth').textContent = `${game.depth}/${game.maxDepth}`;
  // Zaludnienie piętra: liczba zbiorcza, bez położeń. W grze jednoosobowej
  // czytana wprost z poziomu, w wieloosobowej przychodzi w migawce.
  const wrogow = game.levels.get(game.depth).monsters.filter(m => m.hp > 0).length;
  $('pwrogi').textContent = wrogow;
  $('pwrogi').closest('.poz').classList.toggle('sa', wrogow > 0);
  $('pturn').textContent = game.turn;
  $('stany').innerHTML = stanyHtml(p);
  $('amulet').hidden = !p.hasAmulet;
  $('bog').hidden = !p.niesmiertelny;
  const stopien = $('trudnosc');
  stopien.hidden = false;
  stopien.textContent = t(`trudnosc.${game.trudnosc}`);
  stopien.title = t('web.hud.trudnoscTytul', { pietra: game.maxDepth });
  renderLog();
}

let lastLogTurn = -1;
function renderLog() {
  const msgs = game.messages.slice(-3);
  logEl.innerHTML = msgs.map((m, i) =>
    `<li class="${i === msgs.length - 1 && m.turn !== lastLogTurn ? 'fresh' : ''}">${escapeHtml(m.text)}</li>`).join('');
  if (msgs.length) lastLogTurn = msgs[msgs.length - 1].turn;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- pętla klatek ----------

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  stepWalk(now);
  if (autoDirty && now - autoLast > AUTO_MS) flushAuto();
  if (blinkUntil && now > blinkUntil) { blinkUntil = 0; $('autotag')?.classList.remove('lit'); }
  view.step(dt);
  renderer.draw(game, view, dt);
  if (notice && now < noticeUntil) drawNotice();
  else if (notice && now >= noticeUntil) notice = '';
  requestAnimationFrame(frame);
}

function drawNotice() {
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.setTransform(renderer.dpr, 0, 0, renderer.dpr, 0, 0);
  ctx.font = '600 13px ui-monospace, monospace';
  const w = ctx.measureText(notice).width + 26;
  const x = (renderer.cssW - w) / 2;
  ctx.fillStyle = 'rgba(14,16,23,.94)';
  ctx.strokeStyle = '#2a3042';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, 14, w, 30, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffbe6e';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(notice, renderer.cssW / 2, 30);
  ctx.restore();
}

// Uchwyt TYLKO DO ODCZYTU dla konsoli przeglądarki i dla sterownika, którym
// sprawdzam sterowanie bez udziału człowieka. Nie ma tędy drogi do zmiany stanu -
// żeby cokolwiek się wydarzyło, trzeba przejść przez `act()`, tak jak klawiatura.
window.roguelike = {
  get game() { return game; },
  get view() { return view; },
  get mode() { return mode; },
  get walking() { return !!walk; },
  get keys() { return keyLog.slice(); },
};

// Zamknięcie karty potrafi wypaść między dwoma zrzutami z dławieniem. `pagehide`
// jest jedynym zdarzeniem, które leci także przy przejściu do pamięci podręcznej
// wstecz/dalej; `visibilitychange` łapie przełączenie karty na telefonie.
window.addEventListener('pagehide', () => flushAuto());
window.addEventListener('visibilitychange', () => { if (document.hidden) flushAuto(); });

window.addEventListener('resize', () => renderer.resize(game));
// Płótno idzie za rozmiarem SWOJEGO miejsca, nie tylko za rozmiarem okna.
// Pasek trybu turowego albo dłuższy dziennik podnoszą stopkę, a wtedy plansza
// robi się niższa bez zmiany okna - płótno zostawało za duże i dolny pas mapy
// znikał pod stopką, przycięty przez `overflow: hidden`.
if (window.ResizeObserver) {
  new ResizeObserver(() => { if (game.poziom || game.level) renderer.resize(game); })
    .observe(document.getElementById('stage'));
}
updateHud();
flushAuto();
if (resumed) say(t('web.wznowiono'));
if (game.status !== 'playing') showGameOver();
requestAnimationFrame(frame);

podpisz(document.getElementById('podpis'));

// Zmiana języka w trakcie partii: bez tury, bez ruszania stanu gry. Przerysowuje
// się to, co strona zbudowała sama - panel stanu, otwarta nakładka i podpis.
przelacznik(document.getElementById('jezyk'), () => {
  updateHud();
  podpisz(document.getElementById('podpis'));
  if (mode === 'help') showRules(ruleSection);
  else if (mode === 'over') showGameOver();
  else if (mode === 'nowa') pokazWyborTrudnosci();
  else if (mode === 'obejrzyj') pokazObejrzenie();
  else if (mode === 'stos') pokazStos();
  else if (mode === 'inventory' || mode === 'drop' || mode === 'sniff') openInventory(mode);
});
