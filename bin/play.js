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

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Roguelike - gra terminalowa

  node bin/play.js [--seed <ziarno>] [--continue]

  --seed <ziarno>   ziarno rozgrywki (to samo ziarno = ten sam loch)
  --continue        wznów z zapisu (${SAVE_PATH})
  --help            ta pomoc

W grze: ? = księga zasad, w = powąchaj miksturę, S = zapis, Q = wyjście.`);
  process.exit(0);
}

let game;
if (args.includes('--continue')) {
  const r = loadFromFile(SAVE_PATH);
  if (!r.ok) { console.error(`${r.error}\nZaczynam nową grę.`); game = new Game(argOf('seed', String(Date.now()))); }
  else game = r.game;
} else {
  game = new Game(argOf('seed', String(Date.now())));
}

let mode = 'map';
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
    process.stdout.write(clearScreen() + renderGameOver(game) + `\n  ${C.grey}Dowolny klawisz kończy.${C.reset}\n`);
    return;
  }
  process.stdout.write(renderFrame(game, mode, extra, section));
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
  if (game.status !== 'playing') quit(`Ziarno: ${game.seed}   Wynik: ${game.score()}`);

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
    if (key === ',' || key === 'g') { game.act({ type: 'pickup' }); mode = 'map'; return; }
    mode = 'map';
    return;
  }

  if (mode === 'inventory' || mode === 'drop' || mode === 'sniff') {
    if (key === 'ESC' || key === 'i' || key === 'q') { mode = 'map'; return; }
    const idx = key.length === 1 ? key.charCodeAt(0) - 97 : -1;
    if (idx >= 0 && idx < game.player.inventory.length) {
      const action = mode === 'drop' ? 'drop' : mode === 'sniff' ? 'sniff' : 'use';
      game.act({ type: action, index: idx });
      mode = 'map';
    }
    return;
  }

  if (DIR_KEYS[key]) { const [dx, dy] = DIR_KEYS[key]; game.act({ type: 'move', dx, dy }); return; }

  switch (key) {
    case '.': case '5': game.act({ type: 'wait' }); break;
    case ',': case 'g': game.act({ type: 'pickup' }); break;
    case '>': game.act({ type: 'descend' }); break;
    case '<': game.act({ type: 'ascend' }); break;
    case 'i': mode = 'inventory'; break;
    case 'd': mode = 'drop'; break;
    case 'w': mode = 'sniff'; break;
    case 'x': mode = 'obejrzyj'; break;
    case '?': mode = 'help'; break;
    case 'S': {
      try { saveToFile(game, SAVE_PATH); extra = `${C.brightGreen}Zapisano: ${SAVE_PATH}${C.reset}`; }
      catch (e) { extra = `${C.brightRed}Zapis nieudany: ${e.message}${C.reset}`; }
      break;
    }
    case 'L': {
      const r = loadFromFile(SAVE_PATH);
      if (r.ok) { game = r.game; extra = `${C.brightGreen}Wczytano zapis.${C.reset}`; }
      else extra = `${C.brightRed}${r.error}${C.reset}`;
      break;
    }
    case 'Q': quit(`Do zobaczenia. Ziarno: ${game.seed}`); break;
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
  console.error('Ta gra wymaga terminala. Do rozgrywki bez człowieka użyj: node bin/bot.js');
  process.exit(1);
}

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdout.write(hideCursor());
process.on('exit', cleanup);
process.on('SIGINT', () => quit('Przerwane.'));
process.on('uncaughtException', (e) => {
  cleanup();
  console.error('\nGra się wywróciła. To jest błąd programu, nie Twoja wina.\n', e);
  process.exit(1);
});
process.stdout.on('resize', draw);

process.stdin.on('data', (buf) => {
  const key = keyName(buf);
  if (key === 'CTRL_C') quit('Przerwane.');
  handleKey(key);
  draw();
});

game.message('Wchodzisz do lochu. Naciśnij ? po pomoc.');
draw();
