// Spinacz wersji graficznej: wejście, pętla klatek, HUD, zapis.
//
// Ten plik NIE zawiera ani jednej reguły gry. Wszystkie decyzje podejmuje ten sam
// `Game`, który chodzi w terminalu - tutaj są wyłącznie klawisze, piksele i
// `localStorage`. Gdyby kiedyś okazało się, że wersja graficzna zachowuje się
// inaczej niż terminalowa, winy trzeba szukać w tym pliku, nie w silniku.

import { Game } from '../src/game.js';
import { serialize, loadFromString } from '../src/serialize.js';
import { itemLabel } from '../src/items.js';
import { findPath } from '../src/path.js';
import { WALL } from '../src/map.js';
import { Renderer } from './draw.js';
import { View } from './view.js';

const SAVE_KEY = 'roguelike:save';
const STEP_MS = 108;             // tempo marszu po kliknięciu
const WALK_LIMIT = 400;          // twardy sufit, żeby marsz nie mógł trwać w nieskończoność

const canvas = document.getElementById('map');
const overlay = document.getElementById('overlay');
const panel = document.getElementById('panel');
const logEl = document.getElementById('log');

const renderer = new Renderer(canvas);
const view = new View();

const params = new URLSearchParams(location.search);
let game = new Game(params.get('seed') || String(Date.now()));
let mode = 'map';                // 'map' | 'inventory' | 'drop' | 'help' | 'over'
let walk = null;
let notice = '';
let noticeUntil = 0;

game.message('Wchodzisz do lochu. Naciśnij ? po pomoc.');
view.sync(game);
renderer.resize(game);

// ---------- tura ----------

/** Jedyna droga, którą stan gry może się zmienić. Wszystko inne tylko czyta. */
function act(action) {
  if (game.status !== 'playing') return;
  game.act(action);
  view.sync(game);
  if (game.status !== 'playing') { walk = null; showGameOver(); }
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

const DIR = {
  h: [-1, 0], j: [0, 1], k: [0, -1], l: [1, 0],
  y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
  '4': [-1, 0], '2': [0, 1], '8': [0, -1], '6': [1, 0],
  '7': [-1, -1], '9': [1, -1], '1': [-1, 1], '3': [1, 1],
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};

// Znaki, które na typowej klawiaturze powstają dopiero z Shiftem. Na części
// układów `e.key` nie donosi o tym wcale i do gry dociera znak spod klawisza -
// przecinek zamiast '<', kropka zamiast '>'. Wtedy "wejdź po schodach" zamienia
// się w "podnieś", co wygląda jak wada gry, a jest rozjazdem układu klawiatury.
// Rozstrzyga `e.code`, czyli POŁOŻENIE klawisza, niezależne od układu.
const SHIFTED_BY_CODE = {
  Comma: '<', Period: '>', Slash: '?', KeyS: 'S', KeyL: 'L', KeyQ: 'Q',
};

/** Ostatnie klawisze - do odczytania w konsoli, gdy sterowanie zachowa się dziwnie. */
const keyLog = [];

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  let k = e.key;
  if (e.shiftKey && SHIFTED_BY_CODE[e.code]) k = SHIFTED_BY_CODE[e.code];

  keyLog.push({ key: e.key, code: e.code, shift: e.shiftKey, uzyto: k });
  if (keyLog.length > 24) keyLog.shift();

  if (DIR[k] || ['.', ',', '5', 'g', '>', '<', 'i', 'd', '?', 'S', 'L', 'Escape', ' '].includes(k)) e.preventDefault();

  if (walk) { walk = null; return; }   // dowolny klawisz przerywa marsz

  if (mode === 'over') { if (k === 'Enter' || k === ' ') newGame(); return; }
  if (mode === 'help') { closeOverlay(); return; }

  if (mode === 'inventory' || mode === 'drop') {
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
    case '?': openHelp(); break;
    case 'S': doSave(); break;
    case 'L': doLoad(); break;
    default: break;
  }
});

// ---------- mysz ----------

canvas.addEventListener('click', (e) => {
  const r = canvas.getBoundingClientRect();
  const { x, y } = renderer.tileAt(e.clientX - r.left, e.clientY - r.top);
  if (x === game.player.x && y === game.player.y) { act({ type: 'wait' }); return; }
  startWalk(x, y);
});

// ---------- nakładki ----------

function closeOverlay() { mode = 'map'; overlay.hidden = true; }

function useSlot(idx) {
  const action = mode === 'drop' ? 'drop' : 'use';
  closeOverlay();
  act({ type: action, index: idx });
}

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
      <span>${escapeHtml(itemLabel(it, game.appearances, game.identified))}</span> ${worn}</li>`;
  }).join('');
  panel.innerHTML = `
    <h2>${which === 'drop' ? 'Co wyrzucić?' : 'Ekwipunek'} <span class="muted">${p.inventory.length}/16</span></h2>
    <ul>${rows || '<li class="muted">(pusto)</li>'}</ul>
    <p class="foot">Litera albo kliknięcie ${which === 'drop' ? 'wyrzuca' : 'używa lub zakłada'}. <kbd>Esc</kbd> wraca.</p>`;
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

function openHelp() {
  mode = 'help';
  panel.innerHTML = `
    <h2>Sterowanie</h2>
    <div class="keys">
      <b>ruch</b><span>strzałki, <kbd>hjkl</kbd> bok, <kbd>yubn</kbd> skos, klawiatura numeryczna</span>
      <b>marsz</b><span>kliknięcie w poznane pole - idzie, dopóki nie zobaczy potwora</span>
      <b>czekaj</b><span><kbd>.</kbd> albo <kbd>5</kbd>, albo kliknięcie w siebie</span>
      <b>podnieś</b><span><kbd>,</kbd> albo <kbd>g</kbd></span>
      <b>schody</b><span><kbd>&gt;</kbd> w dół, <kbd>&lt;</kbd> w górę</span>
      <b>ekwipunek</b><span><kbd>i</kbd>, wyrzucanie <kbd>d</kbd></span>
      <b>zapis</b><span><kbd>S</kbd> zapisuje, <kbd>L</kbd> wczytuje</span>
    </div>
    <h2>Cel</h2>
    <p class="muted">Zejdź na poziom 8, pokonaj Smoka Otchłani, zabierz Amulet
      i wróć schodami w górę na powierzchnię.</p>
    <h2>Co widać</h2>
    <p class="muted">Jasne pola widzisz teraz. Zimne i przygaszone - pamiętasz z wcześniej,
      więc nie zobaczysz tam ruchu potworów. Czarne są nieznane.<br>
      Barwa mikstury to jej <em>wygląd</em>, nie działanie: ta sama barwa znaczy to samo
      przez całą rozgrywkę, ale co znaczy - trzeba sprawdzić.</p>
    <p class="foot">Ziarno tej rozgrywki: <b>${escapeHtml(String(game.seed))}</b>. Dowolny klawisz wraca do gry.</p>`;
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
}

// ---------- zapis ----------

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

window.addEventListener('resize', () => renderer.resize(game));
updateHud();
requestAnimationFrame(frame);
