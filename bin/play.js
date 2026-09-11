#!/usr/bin/env node
// Gra w trybie interaktywnym.
//
// Wejście czytane jest w trybie surowym (raw), bo roguelike reaguje na pojedynczy
// klawisz bez Entera. Tryb surowy MUSI zostać zdjęty przy każdym wyjściu - także
// przy wywrotce i przy Ctrl+C - inaczej terminal użytkownika zostaje bez echa,
// co wygląda jak zawieszony terminal.

import { Game } from '../src/game.js';
import { saveToFile, loadFromFile } from '../src/save.js';
import { renderFrame, renderGameOver, clearScreen, hideCursor, showCursor, RULE_COUNT, C } from '../src/render.js';
import { setLang, znanyJezyk, t } from '../src/i18n.js';
import { ustalTrudnosc } from '../src/trudnosc.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SAVE_PATH = process.env.ROGUELIKE_SAVE || join(homedir(), '.roguelike-save.json');

const args = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = args.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return dflt;
  const a = args[i];
  return a.includes('=') ? a.split('=').slice(1).join('=') : (args[i + 1] ?? dflt);
};

// Język gry: angielski, chyba że gracz poprosi jawnie o inny (D-051). Ustalany
// PRZED wszystkim innym, bo już pierwszy komunikat idzie w wybranym języku.
const lang = argOf('lang', 'en');
if (!znanyJezyk(lang)) { console.error(t('term.nieznanyJezyk', { lang })); process.exit(2); }
setLang(lang);

// Stopień trudności: po angielsku albo po polsku, domyślnie normalny (D-055).
const trudnosc = ustalTrudnosc(argOf('difficulty', 'normal'));
if (!trudnosc) { console.error(t('term.nieznanaTrudnosc', { x: argOf('difficulty', '') })); process.exit(2); }

if (args.includes('--help') || args.includes('-h')) {
  console.log(t('term.pomoc', { sciezka: SAVE_PATH }));
  process.exit(0);
}

let game;
if (args.includes('--continue')) {
  const r = loadFromFile(SAVE_PATH);
  if (!r.ok) { console.error(`${r.error}\n${t('term.nowaGra')}`); game = new Game(argOf('seed', String(Date.now())), { trudnosc }); }
  else game = r.game;
} else {
  game = new Game(argOf('seed', String(Date.now())), { trudnosc });
}

let mode = 'map';
let wybrane = new Set();          // zaznaczone rzeczy z kupki pod nogami

/** Jedna rzecz idzie od razu, kilka otwiera wybór. */
function podnies() {
  const stos = game.stosPodNogami();
  if (stos.length <= 1) { mode = 'map'; game.act({ type: 'pickup' }); return; }
  wybrane = new Set(stos.map(i => i.id));
  mode = 'stos';
}
let section = 0;        // otwarty rozdział księgi zasad
let extra = '';

const DIR_KEYS = {
  h: [-1, 0], j: [0, 1], k: [0, -1], l: [1, 0],
  y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
  '4': [-1, 0], '2': [0, 1], '8': [0, -1], '6': [1, 0],
  '7': [-1, -1], '9': [1, -1], '1': [-1, 1], '3': [1, 1],
  UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0],
};

function draw() {
  if (game.status !== 'playing' && mode === 'map') {
    process.stdout.write(clearScreen() + renderGameOver(game) + `\n  ${C.grey}${t('term.dowolnyKonczy')}${C.reset}\n`);
    return;
  }
  process.stdout.write(renderFrame(game, mode, extra, section, wybrane));
  extra = '';
}

function cleanup() {
  try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch { /* terminal już zamknięty */ }
  process.stdout.write(showCursor());
  process.stdin.pause();
}

function quit(msg) {
  cleanup();
  if (msg) process.stdout.write(`\n${msg}\n`);
  process.exit(0);
}

function handleKey(key) {
  if (game.status !== 'playing') quit(t('term.ziarnoWynik', { seed: game.seed, wynik: game.score() }));

  // Księga zasad: rozdziały przeglądane bez wychodzenia z gry. Świat stoi -
  // czytanie nie kosztuje tury i nie da się nim przeczekać potwora.
  if (mode === 'help') {
    if (key === 'ESC' || key === '?' || key === 'q' || key === 'Q') { mode = 'map'; return; }
    if (key === 'n' || key === ' ' || key === 'RIGHT' || key === 'DOWN') { section = (section + 1) % RULE_COUNT; return; }
    if (key === 'p' || key === 'LEFT' || key === 'UP') { section = (section - 1 + RULE_COUNT) % RULE_COUNT; return; }
    const n = Number(key);
    if (Number.isInteger(n) && n >= 1 && n <= RULE_COUNT) section = n - 1;
    return;
  }

  // Oglądanie nic nie kosztuje, więc wychodzi się z niego dowolnym klawiszem
  // poza podniesieniem - a podniesienie działa od razu, bez wracania na mapę.
  if (mode === 'obejrzyj') {
    if (key === ',' || key === 'g') { podnies(); return; }
    mode = 'map';
    return;
  }

  // Kupka pod nogami: zaznaczanie NIE zamyka ekranu, podnosi dopiero Enter.
  if (mode === 'stos') {
    if (key === 'ESC' || key === 'q') { mode = 'map'; return; }
    if (key === 'ENTER' || key === '\r' || key === '\n') {
      const ids = game.stosPodNogami().filter(i => wybrane.has(i.id)).map(i => i.id);
      mode = 'map';
      if (ids.length) game.act({ type: 'pickup', ids });
      return;
    }
    const stos = game.stosPodNogami();
    if (key === '*') {
      wybrane = wybrane.size === stos.length ? new Set() : new Set(stos.map(i => i.id));
      return;
    }
    const i = key.length === 1 ? key.charCodeAt(0) - 97 : -1;
    const it = stos[i];
    if (it) { if (wybrane.has(it.id)) wybrane.delete(it.id); else wybrane.add(it.id); }
    return;
  }

  if (mode === 'inventory' || mode === 'drop' || mode === 'sniff') {
    if (key === 'ESC' || key === 'i' || key === 'q') { mode = 'map'; return; }
    const idx = key.length === 1 ? key.charCodeAt(0) - 97 : -1;
    if (idx >= 0 && idx < game.player.inventory.length) {
      const action = mode === 'drop' ? 'drop' : mode === 'sniff' ? 'sniff' : 'use';
      game.act({ type: action, index: idx });
      // Ekran zostaje otwarty: wyjście z ekwipunku ma być świadomą decyzją
      // (Esc albo `i`), a nie skutkiem ubocznym użycia rzeczy.
      if (game.player.status !== 'playing') mode = 'map';
    }
    return;
  }

  if (DIR_KEYS[key]) { const [dx, dy] = DIR_KEYS[key]; game.act({ type: 'move', dx, dy }); return; }

  switch (key) {
    case '.': case '5': game.act({ type: 'wait' }); break;
    case ',': case 'g': podnies(); break;
    case '>': game.act({ type: 'descend' }); break;
    case '<': game.act({ type: 'ascend' }); break;
    case 'i': mode = 'inventory'; break;
    case 'd': mode = 'drop'; break;
    case 'w': mode = 'sniff'; break;
    case 'x': mode = 'obejrzyj'; break;
    case '?': mode = 'help'; break;
    case 'S': {
      try { saveToFile(game, SAVE_PATH); extra = `${C.brightGreen}${t('term.zapisano', { sciezka: SAVE_PATH })}${C.reset}`; }
      catch (e) { extra = `${C.brightRed}${t('term.zapisNieudany', { powod: e.message })}${C.reset}`; }
      break;
    }
    case 'L': {
      const r = loadFromFile(SAVE_PATH);
      if (r.ok) { game = r.game; extra = `${C.brightGreen}${t('term.wczytano')}${C.reset}`; }
      else extra = `${C.brightRed}${r.error}${C.reset}`;
      break;
    }
    case 'Q': quit(t('term.doZobaczenia', { seed: game.seed })); break;
    default: break;
  }
}

/** Zamienia surowe bajty na nazwę klawisza. */
function keyName(buf) {
  const s = buf.toString('utf8');
  if (s === '\x03') return 'CTRL_C';
  if (s === '\x1b') return 'ESC';
  if (s === '\x1b[A') return 'UP';
  if (s === '\x1b[B') return 'DOWN';
  if (s === '\x1b[C') return 'RIGHT';
  if (s === '\x1b[D') return 'LEFT';
  return s;
}

if (!process.stdin.isTTY) {
  console.error(t('term.wymagaTerminala'));
  process.exit(1);
}

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdout.write(hideCursor());
process.on('exit', cleanup);
process.on('SIGINT', () => quit(t('term.przerwane')));
process.on('uncaughtException', (e) => {
  cleanup();
  console.error(t('term.wywrotka'), e);
  process.exit(1);
});
process.stdout.on('resize', draw);

process.stdin.on('data', (buf) => {
  const key = keyName(buf);
  if (key === 'CTRL_C') quit(t('term.przerwane'));
  handleKey(key);
  draw();
});

game.message('wejscie');
draw();
