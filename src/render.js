// Rysowanie w terminalu. Bez zależności - same sekwencje ANSI.
//
// Układ mieści się w oknie 80x24: 1 wiersz stanu, 20 wierszy mapy, 2 wiersze
// dziennika, 1 wiersz podpowiedzi. Na większym oknie mapa zostaje wyśrodkowana,
// zamiast rozjeżdżać się w lewy górny róg.

import { WALL, FLOOR, STAIRS_DOWN, STAIRS_UP } from './map.js';
import { itemLabel, itemGlyph, itemStats, polaSlowo } from './items.js';
import { pojemnosc, zajetePola, ile as sztuk } from './plecak.js';
import { opisWLinijkach } from './ocena.js';
import { buildRules } from './rules.js';
import { stanyBohatera } from './stany.js';

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

// Kolor stanu bierze się z jego TONU, tego samego, którym kieruje się obie
// wersje przeglądarkowe. Jedna tablica progów (`src/stany.js`) i jedna tablica
// kolorów, więc terminal nie może nazwać stanu inaczej niż płótno.
const TON_KOLOR = {
  dobrze: C.brightGreen,
  uwaga: C.yellow,
  zle: C.brightRed,
  krytycznie: C.brightRed + C.bold,
};

/** Stany bohatera jako paski - ten sam kształt co pasek życia obok. */
function stanyNapis(hero) {
  return stanyBohatera(hero).map(s => {
    const k = TON_KOLOR[s.ton] || C.grey;
    return `${C.bold}${s.nazwa}${C.reset} ${bar(s.wartosc, s.max, 10, k)} ${k}${s.etykieta}${C.reset}`;
  });
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
    ...stanyNapis(p),
    `${C.bold}Tura${C.reset} ${game.turn}`,
    p.hasAmulet ? `${C.brightYellow}${C.bold}[AMULET]${C.reset}` : '',
  ].filter(Boolean).join('  ');
}

export function renderMessages(game, count = 2) {
  const msgs = game.messages.slice(-count).map(m => m.text);
  while (msgs.length < count) msgs.unshift('');
  return msgs.map(m => `${C.white}${m}${C.reset}`);
}

const INV_HINT = {
  // Wyrzucanie ISTNIEJE od początku (klawisz d), ale było opisane wyłącznie
  // w księdze zasad - czyli w miejscu, do którego trzeba wyjść z plecaka.
  // Podpowiedź stoi tam, gdzie gracz akurat patrzy na pełny plecak.
  inventory: 'litera = użyj/załóż, d = wyrzuć',
  drop: 'litera = wyrzuć',
  sniff: 'litera = powąchaj (tylko mikstury)',
};

export function renderInventory(game, mode = 'inventory') {
  const p = game.player;
  // W terminalu nie ma układania: gracz widzi WYŁĄCZNIE zajętość, a rzeczy
  // same znajdują sobie miejsce. Ta sama reguła co w przeglądarce - różni się
  // tylko to, kto rozmieszcza.
  const zaj = zajetePola(p), poj = pojemnosc(p);
  const lines = [`${C.bold}Ekwipunek${C.reset} ${C.white}${zaj}/${poj} ${polaSlowo(poj)}${C.reset}`
    + `  ${C.grey}${INV_HINT[mode] || INV_HINT.inventory}, ESC = wróć${C.reset}`, ''];
  if (!p.inventory.length) lines.push(`${C.grey}(pusto)${C.reset}`);
  p.inventory.forEach((it, i) => {
    const letter = String.fromCharCode(97 + i);
    const marks = [];
    if (p.weapon === it) marks.push('w dłoni');
    if (p.armor === it) marks.push('na sobie');
    const suffix = marks.length ? ` ${C.brightGreen}(${marks.join(', ')})${C.reset}` : '';
    // Liczby przy przedmiocie, nie w księdze zasad: decyzja „zakładać czy nie"
    // zapada tutaj, więc tutaj muszą stać skutek i różnica wobec noszonego.
    const st = itemStats(it, p, game.identified);
    const barwa = st.znak === 'plus' ? C.brightGreen : st.znak === 'minus' ? C.brightRed : C.grey;
    const czesci = [st.opis, st.miejsce ? `${st.miejsce}` : null].filter(Boolean).join(', ');
    const opis = czesci ? ` ${C.grey}[${czesci}${st.porownanie ? `${C.reset}${barwa}, ${st.porownanie}` : ''}${C.reset}${C.grey}]${C.reset}` : '';
    const krotnosc = sztuk(it) > 1 ? ` ${C.brightWhite || C.white}x${sztuk(it)}${C.reset}` : '';
    lines.push(`  ${C.brightYellow}${letter}${C.reset}) ${ITEM_COLOR[it.kind] || C.white}${itemGlyph(it)}${C.reset} ${itemLabel(it, game.appearances, game.identified, game.sniffed)}${krotnosc}${suffix}${opis}`);
  });
  return lines;
}

const RULES = buildRules('term');

/** Zawija akapit do podanej szerokości, po słowach. */
function wrap(text, width) {
  const out = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && (line + ' ' + word).length > width) { out.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

/** Tabela o kolumnach dopasowanych do najdłuższej komórki. */
function tableLines(head, rows) {
  const w = head.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
  const line = (cells, color) => '  ' + cells.map((c, i) => `${color}${String(c).padEnd(w[i])}${C.reset}`).join('  ');
  return [
    line(head, C.brightCyan),
    '  ' + w.map(n => '-'.repeat(n)).join('  '),
    ...rows.map(r => line(r, C.white)),
  ];
}

export const RULE_COUNT = RULES.length;

/**
 * Księga zasad w terminalu. Ta sama treść, co w przeglądarce i w `docs/zasady.md` -
 * jedno źródło w `src/rules.js`, więc wersje nie mogą się rozjechać.
 */
export function renderRules(index = 0, width = 76) {
  const i = ((index % RULES.length) + RULES.length) % RULES.length;
  const sec = RULES[i];
  const spis = RULES.map((r, n) => n === i
    ? `${C.brightYellow}${n + 1}.${r.title}${C.reset}`
    : `${C.grey}${n + 1}.${r.title}${C.reset}`).join('  ');

  const out = [`${C.bold}Księga zasad${C.reset}  ${C.grey}rozdział ${i + 1} z ${RULES.length}${C.reset}`, '', spis, ''];
  out.push(`${C.bold}${C.brightWhite}${sec.title}${C.reset}`, '');
  for (const b of sec.blocks) {
    if (b.t === 'p') { out.push(...wrap(b.text, width).map(l => `  ${l}`), ''); }
    else if (b.t === 'note') { out.push(...wrap(b.text, width - 2).map(l => `  ${C.brightYellow}|${C.reset} ${l}`), ''); }
    else if (b.t === 'table') { out.push(...tableLines(b.head, b.rows), ''); }
  }
  out.push(`${C.grey}n / spacja = dalej   p = wstecz   1-${RULES.length} = rozdział   ESC albo ? = wróć do gry${C.reset}`);
  return out;
}

/** Składa pełną klatkę. mode: 'map' | 'inventory' | 'drop' | 'sniff' | 'help' */
/**
 * Obejrzenie rzeczy leżącej pod nogami. Osobny ekran, a nie linijka w dzienniku,
 * bo pytanie „brać czy nie brać" ma tu paść z kompletem liczb naraz: co to daje,
 * ile to lepsze albo gorsze od noszonego i czy w ogóle się zmieści.
 */
export function renderObejrzyj(game) {
  const it = game.podNogami();
  if (!it) {
    return [`${C.grey}Nie ma tu nic do obejrzenia.${C.reset}`, '', `${C.grey}Esc wraca.${C.reset}`];
  }
  const o = game.obejrzyj(it);
  const [nazwa, ...reszta] = opisWLinijkach(game.etykieta(it), o);
  const barwa = { plus: C.brightGreen, minus: C.brightRed, rowno: C.grey };
  const out = [`${C.bold}${nazwa}${C.reset}`, ''];
  for (const l of reszta) {
    out.push(l === o.werdykt ? `  ${barwa[o.ton] || ''}${l}${C.reset}` : `  ${C.grey}${l}${C.reset}`);
  }
  out.push('', `${C.grey}, = podnieś   Esc = wróć${C.reset}`);
  return out;
}

export function renderFrame(game, mode = 'map', extra = '', section = 0) {
  const width = Math.max(80, Math.min(process.stdout.columns || 80, 200));
  const pad = ' '.repeat(Math.max(0, Math.floor((width - game.level.w) / 2)));
  const out = [];

  if (mode === 'help') {
    out.push('', ...renderRules(section, Math.min(76, width - 6)).map(l => pad + l));
    return clearScreen() + out.join('\n') + '\n';
  }
  if (mode === 'obejrzyj') {
    out.push('', ...renderObejrzyj(game).map(l => pad + l));
    return clearScreen() + out.join('\n') + '\n';
  }
  if (mode === 'inventory' || mode === 'drop' || mode === 'sniff') {
    const titles = { drop: 'Co wyrzucić?', sniff: 'Co powąchać?' };
    const title = titles[mode] ? `${C.bold}${titles[mode]}${C.reset}` : '';
    out.push('', ...(title ? [pad + title, ''] : []), ...renderInventory(game, mode).map(l => pad + l));
    return clearScreen() + out.join('\n') + '\n';
  }

  out.push(pad + renderStatus(game));
  out.push(...renderMap(game).map(l => pad + l));
  out.push(...renderMessages(game).map(l => pad + l));
  out.push(pad + (extra || `${C.grey}? = zasady   i = ekwipunek   x = obejrzyj   , = podnieś   > < = schody   S = zapis   Q = wyjście${C.reset}`));
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
