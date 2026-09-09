// Rysowanie w terminalu. Bez zależności - same sekwencje ANSI.
//
// Układ mieści się w oknie 80x24: 1 wiersz stanu, 20 wierszy mapy, 2 wiersze
// dziennika, 1 wiersz podpowiedzi. Na większym oknie mapa zostaje wyśrodkowana,
// zamiast rozjeżdżać się w lewy górny róg.

import { WALL, FLOOR, STAIRS_DOWN, STAIRS_UP } from './map.js';
import { itemLabel, itemGlyph } from './items.js';

const ESC = '\x1b[';
export const C = {
  reset: `${ESC}0m`, bold: `${ESC}1m`, dim: `${ESC}2m`,
  black: `${ESC}30m`, red: `${ESC}31m`, green: `${ESC}32m`, yellow: `${ESC}33m`,
  blue: `${ESC}34m`, magenta: `${ESC}35m`, cyan: `${ESC}36m`, white: `${ESC}37m`,
  grey: `${ESC}90m`, brightRed: `${ESC}91m`, brightGreen: `${ESC}92m`,
  brightYellow: `${ESC}93m`, brightCyan: `${ESC}96m`, brightWhite: `${ESC}97m`,
};

const MONSTER_COLOR = {
  rat: C.grey, bat: C.magenta, kobold: C.yellow, goblin: C.green,
  skeleton: C.brightWhite, orc: C.brightGreen, ogre: C.brightYellow,
  troll: C.brightCyan, wraith: C.magenta, dragon: C.brightRed + C.bold,
};
const ITEM_COLOR = {
  potion: C.brightRed, scroll: C.brightWhite, weapon: C.cyan,
  armor: C.blue, food: C.yellow, amulet: C.brightYellow + C.bold,
};

export function clearScreen() { return `${ESC}2J${ESC}H`; }
export function hideCursor() { return `${ESC}?25l`; }
export function showCursor() { return `${ESC}?25h`; }

function tileGlyph(t) {
  switch (t) {
    case WALL: return '#';
    case STAIRS_DOWN: return '>';
    case STAIRS_UP: return '<';
    default: return '.';
  }
}

/** Rysuje sam obszar mapy jako tablicę wierszy. */
export function renderMap(game) {
  const L = game.level;
  const rows = [];
  for (let y = 0; y < L.h; y++) {
    let line = '';
    for (let x = 0; x < L.w; x++) {
      const vis = game.isVisible(x, y);
      const mem = game.isRemembered(x, y);
      if (!vis && !mem) { line += ' '; continue; }

      if (vis && game.player.x === x && game.player.y === y) {
        line += `${C.bold}${C.brightWhite}@${C.reset}`;
        continue;
      }
      if (vis) {
        const m = game.monsterAt(x, y);
        if (m) { line += `${MONSTER_COLOR[m.type] || C.red}${m.glyph}${C.reset}`; continue; }
      }
      if (vis) {
        const it = game.itemAt(x, y);
        if (it) { line += `${ITEM_COLOR[it.kind] || C.white}${itemGlyph(it)}${C.reset}`; continue; }
      }
      const g = tileGlyph(L.at(x, y));
      // pamiętane, ale niewidoczne pola są przygaszone - i nie pokazują ruchu potworów
      line += vis ? `${C.white}${g}${C.reset}` : `${C.grey}${C.dim}${g}${C.reset}`;
    }
    rows.push(line);
  }
  return rows;
}

function bar(value, max, width, color) {
  const filled = Math.max(0, Math.min(width, Math.round((value / max) * width)));
  return `${color}${'█'.repeat(filled)}${C.grey}${'░'.repeat(width - filled)}${C.reset}`;
}

function hungerWord(h) {
  if (h <= 0) return `${C.brightRed}GŁODUJESZ${C.reset}`;
  if (h < 200) return `${C.yellow}głodny${C.reset}`;
  if (h > 1500) return `${C.grey}najedzony${C.reset}`;
  return `${C.grey}syty${C.reset}`;
}

export function renderStatus(game) {
  const p = game.player;
  const hpColor = p.hp / p.maxHp > 0.5 ? C.brightGreen : p.hp / p.maxHp > 0.25 ? C.yellow : C.brightRed;
  return [
    `${C.bold}HP${C.reset} ${bar(p.hp, p.maxHp, 10, hpColor)} ${hpColor}${p.hp}/${p.maxHp}${C.reset}`,
    `${C.bold}Poz${C.reset} ${p.level}`,
    `${C.bold}DP${C.reset} ${p.xp}`,
    `${C.bold}Atak${C.reset} ${game.playerAttack()}`,
    `${C.bold}Obrona${C.reset} ${game.playerDefense()}`,
    `${C.bold}Głębokość${C.reset} ${C.brightCyan}${game.depth}/${game.maxDepth}${C.reset}`,
    hungerWord(p.hunger),
    `${C.bold}Tura${C.reset} ${game.turn}`,
    p.hasAmulet ? `${C.brightYellow}${C.bold}[AMULET]${C.reset}` : '',
  ].filter(Boolean).join('  ');
}

export function renderMessages(game, count = 2) {
  const msgs = game.messages.slice(-count).map(m => m.text);
  while (msgs.length < count) msgs.unshift('');
  return msgs.map(m => `${C.white}${m}${C.reset}`);
}

export function renderInventory(game) {
  const p = game.player;
  const lines = [`${C.bold}Ekwipunek${C.reset} (${p.inventory.length}/16)  ${C.grey}litera = użyj/załóż, ESC = wróć${C.reset}`, ''];
  if (!p.inventory.length) lines.push(`${C.grey}(pusto)${C.reset}`);
  p.inventory.forEach((it, i) => {
    const letter = String.fromCharCode(97 + i);
    const marks = [];
    if (p.weapon === it) marks.push('w dłoni');
    if (p.armor === it) marks.push('na sobie');
    const suffix = marks.length ? ` ${C.brightGreen}(${marks.join(', ')})${C.reset}` : '';
    lines.push(`  ${C.brightYellow}${letter}${C.reset}) ${ITEM_COLOR[it.kind] || C.white}${itemGlyph(it)}${C.reset} ${itemLabel(it, game.appearances, game.identified)}${suffix}`);
  });
  return lines;
}

export const HELP_LINES = [
  `${C.bold}Sterowanie${C.reset}`,
  '',
  '  Ruch          strzałki, hjkl (bok), yubn (skos), klawiatura numeryczna',
  '  Czekaj        . lub 5',
  '  Podnieś       , lub g',
  '  Schody        > w dół, < w górę',
  '  Ekwipunek     i        Wyrzuć: d',
  '  Zapis         S        Wczytaj: L',
  '  Pomoc         ?        Wyjście: Q',
  '',
  `${C.bold}Cel${C.reset}`,
  `  Zejdź na poziom ${C.brightCyan}8${C.reset}, pokonaj ${C.brightRed}Smoka Otchłani${C.reset} (D),`,
  '  zabierz Amulet i wróć schodami w górę na powierzchnię.',
  '',
  `${C.bold}Znaki${C.reset}`,
  `  ${C.brightWhite}@${C.reset} ty   ${C.brightRed}!${C.reset} mikstura   ${C.brightWhite}?${C.reset} zwój   ${C.cyan})${C.reset} broń   ${C.blue}[${C.reset} pancerz   ${C.yellow}%${C.reset} jedzenie`,
  '  litery = potwory (małe słabsze, wielkie groźniejsze)',
  '',
  `${C.grey}Dowolny klawisz wraca do gry.${C.reset}`,
];

/** Składa pełną klatkę. mode: 'map' | 'inventory' | 'help' | 'drop' */
export function renderFrame(game, mode = 'map', extra = '') {
  const width = Math.max(80, Math.min(process.stdout.columns || 80, 200));
  const pad = ' '.repeat(Math.max(0, Math.floor((width - game.level.w) / 2)));
  const out = [];

  if (mode === 'help') {
    out.push('', ...HELP_LINES.map(l => pad + l));
    return clearScreen() + out.join('\n') + '\n';
  }
  if (mode === 'inventory' || mode === 'drop') {
    const title = mode === 'drop' ? `${C.bold}Co wyrzucić?${C.reset}` : '';
    out.push('', ...(title ? [pad + title, ''] : []), ...renderInventory(game).map(l => pad + l));
    return clearScreen() + out.join('\n') + '\n';
  }

  out.push(pad + renderStatus(game));
  out.push(...renderMap(game).map(l => pad + l));
  out.push(...renderMessages(game).map(l => pad + l));
  out.push(pad + (extra || `${C.grey}? = pomoc   i = ekwipunek   , = podnieś   > < = schody   S = zapis   Q = wyjście${C.reset}`));
  return clearScreen() + out.join('\n') + '\n';
}

export function renderGameOver(game) {
  const won = game.status === 'won';
  const title = won
    ? `${C.brightYellow}${C.bold}ZWYCIĘSTWO${C.reset}`
    : `${C.brightRed}${C.bold}KONIEC GRY${C.reset}`;
  return [
    '', `  ${title}`, '',
    `  Przyczyna:    ${game.cause}`,
    `  Głębokość:    ${game.depth}`,
    `  Poziom:       ${game.player.level}`,
    `  Doświadczenie:${game.player.xp}`,
    `  Pokonanych:   ${game.player.kills}`,
    `  Tur:          ${game.turn}`,
    `  ${C.bold}Wynik:        ${game.score()}${C.reset}`,
    '', `  ${C.grey}Ziarno tej rozgrywki: ${game.seed}${C.reset}`, '',
  ].join('\n');
}
