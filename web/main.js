// Spinacz wersji graficznej: wejście, pętla klatek, HUD, zapis.
//
// Ten plik NIE zawiera ani jednej reguły gry. Wszystkie decyzje podejmuje ten sam
// `Game`, który chodzi w terminalu - tutaj są wyłącznie klawisze, piksele i
// `localStorage`. Gdyby kiedyś okazało się, że wersja graficzna zachowuje się
// inaczej niż terminalowa, winy trzeba szukać w tym pliku, nie w silniku.

import { Game } from '../src/game.js';
import { serialize, loadFromString } from '../src/serialize.js';
import { itemLabel, itemStats } from '../src/items.js';
import { statsHtml } from './opis.js';
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
let mode = 'map';                // 'map' | 'inventory' | 'drop' | 'sniff' | 'help' | 'over'
const RULES = buildRules('web');
let ruleSection = 0;
let walk = null;
let notice = '';
let noticeUntil = 0;

// Odświeżenie karty nie może kosztować rozgrywki. Stan wraca z autozapisu, chyba
// że w adresie stoi jawne ziarno - wtedy gracz prosi o KONKRETNĄ grę i to on ma
// rację, nie zapisany stan.
let game = null;
const seedParam = params.get('seed');
const raw = storageGet(AUTO_KEY);
if (raw) {
  const r = loadFromString(raw);
  if (!r.ok) storageRemove(AUTO_KEY);          // zapis obcy albo uszkodzony nie blokuje startu
  // Adres z ziarnem prosi o KONKRETNĄ grę. Autozapis tego samego ziarna to ta
  // sama rozgrywka, więc wraca; autozapis innej gry zostaje pominięty i za
  // chwilę nadpisany - takie jest znaczenie jawnego ziarna w adresie.
  else if (!seedParam || String(r.game.seed) === seedParam) game = r.game;
}
const resumed = !!game;
if (!game) game = new Game(seedParam || String(Date.now()));
// Komunikat o wznowieniu NIE idzie do dziennika gry, bo dziennik jest częścią
// zapisanego stanu - co odświeżenie dopisywałoby do niego kolejny wiersz.
if (!resumed) game.message('Wchodzisz do lochu. Naciśnij ? po pomoc.');
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
  if (threatInSight()) { say('Nie w obecności potwora.'); return; }
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

  if (mode === 'over') { if (k === 'Enter' || k === ' ') newGame(); return; }
  // Księga zasad: rozdziały przeglądane bez wychodzenia z gry. Świat stoi,
  // więc czytanie nie kosztuje tury i nie przeczeka potwora.
  if (mode === 'help') {
    if (k === 'Escape' || k === '?' || k === 'q') { closeOverlay(); return; }
    if (k === 'n' || k === ' ' || k === 'ArrowRight' || k === 'ArrowDown') { showRules(ruleSection + 1); return; }
    if (k === 'p' || k === 'ArrowLeft' || k === 'ArrowUp') { showRules(ruleSection - 1); return; }
    const n = Number(k);
    if (Number.isInteger(n) && n >= 1 && n <= RULES.length) showRules(n - 1);
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
    case ',': case 'g': act({ type: 'pickup' }); break;
    case '>': act({ type: 'descend' }); break;
    case '<': act({ type: 'ascend' }); break;
    case 'i': openInventory('inventory'); break;
    case 'd': openInventory('drop'); break;
    case 'w': openInventory('sniff'); break;
    case '?': showRules(ruleSection); break;
    case 'S': doSave(); break;
    case 'L': doLoad(); break;
    case 'm': renderer.minimap = !renderer.minimap; say(renderer.minimap ? 'Minimapa włączona.' : 'Minimapa wyłączona.'); break;
    case 'N': newGame(); break;
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

function useSlot(idx) {
  const action = mode === 'drop' ? 'drop' : mode === 'sniff' ? 'sniff' : 'use';
  closeOverlay();
  act({ type: action, index: idx });
}

const INV_TITLE = { drop: 'Co wyrzucić?', sniff: 'Co powąchać?', inventory: 'Ekwipunek' };
const INV_HINT = {
  drop: 'wyrzuca', sniff: 'wącha - tylko mikstury, koszt jednej tury', inventory: 'używa lub zakłada',
};

function openInventory(which) {
  mode = which;
  const p = game.player;
  const rows = p.inventory.map((it, i) => {
    const marks = [];
    if (p.weapon === it) marks.push('w dłoni');
    if (p.armor === it) marks.push('na sobie');
    const worn = marks.length ? `<span class="worn">(${marks.join(', ')})</span>` : '';
    return `<li class="item" data-i="${i}"><span class="key">${String.fromCharCode(97 + i)})</span>
      <canvas class="ico" width="44" height="44"></canvas>
      <span class="nm">${escapeHtml(itemLabel(it, game.appearances, game.identified, game.sniffed))} ${worn}
      ${statsHtml(itemStats(it, p, game.identified))}</span></li>`;
  }).join('');
  panel.innerHTML = `
    <h2>${INV_TITLE[which]} <span class="muted">${p.inventory.length}/16</span></h2>
    <ul>${rows || '<li class="muted">(pusto)</li>'}</ul>
    <p class="foot">Litera albo kliknięcie ${INV_HINT[which]}. <kbd>Esc</kbd> wraca.</p>`;
  // Ikona rysowana tą samą funkcją co przedmiot leżący na podłodze. Dzięki temu
  // "czarna mikstura" w plecaku to dokładnie ta czarna flaszka, którą gracz
  // widział na kaflu - a nie osobna, rozjeżdżająca się z czasem grafika.
  panel.querySelectorAll('li.item').forEach(li => {
    const it = p.inventory[Number(li.dataset.i)];
    const c = li.querySelector('canvas.ico');
    if (c && it) renderer.drawItemShape(c.getContext('2d'), it, 22, 22, 40, game, view);
    li.addEventListener('click', () => useSlot(Number(li.dataset.i)));
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
    <h2>Księga zasad <span class="muted">rozdział ${ruleSection + 1} z ${RULES.length}</span></h2>
    <nav class="tabs">${nav}</nav>
    <h3>${escapeHtml(sec.title)}</h3>
    ${body}
    <p class="foot"><kbd>n</kbd> dalej &nbsp; <kbd>p</kbd> wstecz &nbsp; <kbd>1</kbd>-<kbd>${RULES.length}</kbd> rozdział
      &nbsp; <kbd>Esc</kbd> wraca do gry. Ziarno tej rozgrywki: <b>${escapeHtml(String(game.seed))}</b>.</p>`;
  panel.querySelectorAll('button.tab').forEach(btn =>
    btn.addEventListener('click', () => showRules(Number(btn.dataset.i))));
  panel.scrollTop = 0;
  overlay.hidden = false;
}

function showGameOver() {
  mode = 'over';
  const won = game.status === 'won';
  panel.innerHTML = `
    <h2 class="${won ? 'win' : 'lose'}">${won ? 'ZWYCIĘSTWO' : 'KONIEC GRY'}</h2>
    <dl>
      <dt>przyczyna</dt><dd>${escapeHtml(String(game.cause))}</dd>
      <dt>głębokość</dt><dd>${game.depth}</dd>
      <dt>poziom</dt><dd>${game.player.level}</dd>
      <dt>doświadczenie</dt><dd>${game.player.xp}</dd>
      <dt>pokonanych</dt><dd>${game.player.kills}</dd>
      <dt>tur</dt><dd>${game.turn}</dd>
      <dt>wynik</dt><dd><b>${game.score()}</b></dd>
      <dt>ziarno</dt><dd>${escapeHtml(String(game.seed))}</dd>
    </dl>
    <p class="foot"><kbd>Enter</kbd> zaczyna nową grę.</p>`;
  overlay.hidden = false;
}

function newGame() {
  game = new Game(String(Date.now()));
  view.reset();
  view.depth = null;
  view.lastPlayerHp = null;
  view.lastPlayerPos = null;
  game.message('Wchodzisz do lochu. Naciśnij ? po pomoc.');
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
    say(`Autozapis niemożliwy: ${e.message}`);
    const tag = $('autotag');
    if (tag) { tag.textContent = 'bez autozapisu'; tag.className = 'tag bad'; }
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
  try { localStorage.setItem(SAVE_KEY, serialize(game)); say('Zapisano w przeglądarce.'); }
  catch (e) { say(`Zapis nieudany: ${e.message}`); }
}

function doLoad() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) { say('Nie ma takiego zapisu.'); return; }
  const r = loadFromString(raw);
  if (!r.ok) { say(r.error); return; }
  game = r.game;
  view.reset();
  view.depth = null;
  view.lastPlayerHp = null;
  view.lastPlayerPos = null;
  view.sync(game);
  renderer.resize(game);
  say('Wczytano zapis.');
  autoDirty = true;
  updateHud();
  // Zapis zrobiony tuż przed śmiercią wczytywał się do stanu, w którym gra jest
  // skończona, ale ekran końcowy nie padał - bo dotąd pokazywał go wyłącznie
  // `act()`. Gracz oglądał wtedy planszę, na której nic nie reaguje.
  if (game.status !== 'playing') showGameOver();
}

// ---------- HUD ----------

const $ = (id) => document.getElementById(id);

function hungerTag(h) {
  if (h <= 0) return ['GŁODUJESZ', 'tag bad'];
  if (h < 200) return ['głodny', 'tag warn'];
  if (h > 1500) return ['najedzony', 'tag'];
  return ['syty', 'tag'];
}

function updateHud() {
  const p = game.player;
  const frac = p.hp / p.maxHp;
  $('hpfill').style.width = `${Math.max(0, frac) * 100}%`;
  $('hpfill').style.background = frac > 0.5 ? 'var(--green)' : frac > 0.25 ? 'var(--gold)' : 'var(--red)';
  $('hptext').textContent = `${p.hp}/${p.maxHp}`;
  $('plevel').textContent = p.level;
  $('pxp').textContent = p.xp;
  $('patk').textContent = game.playerAttack();
  $('pdef').textContent = game.playerDefense();
  $('pdepth').textContent = `${game.depth}/${game.maxDepth}`;
  // Zaludnienie piętra: liczba zbiorcza, bez położeń. W grze jednoosobowej
  // czytana wprost z poziomu, w wieloosobowej przychodzi w migawce.
  $('pwrogi').textContent = game.levels.get(game.depth).monsters.filter(m => m.hp > 0).length;
  $('pturn').textContent = game.turn;
  const [word, cls] = hungerTag(p.hunger);
  $('hunger').textContent = word;
  $('hunger').className = cls;
  $('amulet').hidden = !p.hasAmulet;
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
updateHud();
flushAuto();
if (resumed) say('Wznowiono grę z autozapisu. Nowa gra: Shift+N.');
if (game.status !== 'playing') showGameOver();
requestAnimationFrame(frame);

podpisz(document.getElementById('podpis'));
