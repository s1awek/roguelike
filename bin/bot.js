#!/usr/bin/env node
// Gracz automatyczny: seria partii albo podgląd jednej rozgrywki.
//
// Seria jest odbiorem końcowym gry (kryteria 6-7 spec-a): tysiąc partii bez
// wywrotki i bez zakleszczenia, z odsetkiem zwycięstw w przedziale 5-60%.
// Wynik poza przedziałem jest usterką na równi z wywrotką - gra niegrywalna
// i gra trywialna są tak samo zepsute.

import { Game } from '../src/game.js';
import { playOut, Bot, MAX_TURNS } from '../src/bot.js';
import { renderFrame, renderGameOver, clearScreen, showCursor } from '../src/render.js';
import { appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = args.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return dflt;
  const a = args[i];
  return a.includes('=') ? a.split('=').slice(1).join('=') : (args[i + 1] ?? dflt);
};

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Gracz automatyczny

  node bin/bot.js [--games N] [--base <przedrostek>] [--max-turns N] [--progress <plik>]
  node bin/bot.js --watch <ziarno> [--delay <ms>]

  --games N        ile partii rozegrać (domyślnie 100)
  --base <tekst>   przedrostek ziarna, ziarna to <tekst>0, <tekst>1, ... (domyślnie "s")
  --max-turns N    limit tur na partię (domyślnie MAX_TURNS z src/bot.js)
  --progress <p>   dopisuj postęp do pliku (do podglądu przez tail -f)
  --json           wypisz wynik jako JSON zamiast tabeli
  --watch <ziarno> pokaż JEDNĄ rozgrywkę na ekranie, tura po turze
  --delay <ms>     odstęp między turami w podglądzie (domyślnie 60)`);
  process.exit(0);
}

const watchSeed = argOf('watch', null);

if (watchSeed !== null) {
  const delay = Number(argOf('delay', 60));
  const game = new Game(watchSeed);
  const bot = new Bot();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  process.on('SIGINT', () => { process.stdout.write(showCursor()); process.exit(0); });
  let guard = 0;
  while (game.status === 'playing' && game.turn < 8000 && guard < 40000) {
    guard++;
    const action = bot.decide(game);
    if (!game.act(action)) { bot.invalidate(); continue; }
    process.stdout.write(renderFrame(game, 'map', '  [gracz automatyczny - Ctrl+C przerywa]'));
    await sleep(delay);
  }
  process.stdout.write(clearScreen() + renderGameOver(game) + showCursor() + '\n');
  process.exit(0);
}

const games = Number(argOf('games', 100));
const base = argOf('base', 's');
const maxTurns = Number(argOf('max-turns', MAX_TURNS));
const progressPath = argOf('progress', null);
const asJson = args.includes('--json');

const results = [];
const started = Date.now();
let lastReport = 0;

for (let i = 0; i < games; i++) {
  const seed = `${base}${i}`;
  let r;
  try {
    r = playOut(new Game(seed), { maxTurns });
  } catch (e) {
    // wywrotka POZA rozgrywką (np. w budowie poziomu) też jest wywrotką
    r = { outcome: 'crash', cause: e.message, seed, turns: 0, depth: 0, level: 0, xp: 0, kills: 0, score: 0 };
  }
  results.push(r);

  if (progressPath && (Date.now() - lastReport > 3000 || i === games - 1)) {
    lastReport = Date.now();
    const done = i + 1;
    const el = (Date.now() - started) / 1000;
    const won = results.filter(x => x.outcome === 'won').length;
    const crash = results.filter(x => x.outcome === 'crash').length;
    const stall = results.filter(x => x.outcome === 'stalled').length;
    const pct = Math.round((done / games) * 100);
    const bar = '#'.repeat(Math.round(pct / 5)).padEnd(20, '-');
    const eta = done ? ((el / done) * (games - done)).toFixed(0) : '?';
    appendFileSync(progressPath,
      `[${new Date().toTimeString().slice(0, 8)}] BOT  [${bar}] ${done}/${games} (${pct}%) | ` +
      `wygrane ${won} | zakleszczenia ${stall} | WYWROTKI ${crash} | ostatnie: ${r.outcome} gl${r.depth} | ` +
      `${el.toFixed(0)}s, zostalo ~${eta}s\n`);
  }
}

const by = k => results.filter(r => r.outcome === k);
const won = by('won'), dead = by('dead'), stalled = by('stalled'), crashed = by('crash');
const winRate = (won.length / games) * 100;
const avg = f => (results.reduce((a, r) => a + f(r), 0) / games);

const summary = {
  games,
  won: won.length, dead: dead.length, stalled: stalled.length, crashed: crashed.length,
  winRatePct: Number(winRate.toFixed(1)),
  avgTurns: Number(avg(r => r.turns).toFixed(0)),
  avgDepthReached: Number(avg(r => r.depth).toFixed(2)),
  maxDepthReached: Math.max(...results.map(r => r.depth)),
  reachedBottom: results.filter(r => r.depth >= 8 || r.hasAmulet).length,
  avgScore: Number(avg(r => r.score).toFixed(0)),
  seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
  crashSeeds: crashed.map(r => r.seed).slice(0, 20),
  stalledSeeds: stalled.map(r => r.seed).slice(0, 20),
};

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  const causes = {};
  for (const r of results) causes[`${r.outcome}: ${r.cause}`] = (causes[`${r.outcome}: ${r.cause}`] || 0) + 1;
  console.log(`\nSeria ${games} partii (${summary.seconds}s)\n`);
  console.log(`  zwycięstwa      ${won.length} (${winRate.toFixed(1)}%)`);
  console.log(`  śmierć          ${dead.length}`);
  console.log(`  bez rozstrzygnięcia ${stalled.length}`);
  console.log(`  WYWROTKI        ${crashed.length}`);
  console.log(`\n  tur średnio     ${summary.avgTurns}`);
  console.log(`  dotarło na dno  ${summary.reachedBottom}`);
  console.log(`  wynik średnio   ${summary.avgScore}`);
  console.log('\n  przyczyny końca:');
  for (const [c, n] of Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`    ${String(n).padStart(5)}  ${c}`);
  }
  if (crashed.length) console.log(`\n  ZIARNA Z WYWROTKĄ: ${summary.crashSeeds.join(', ')}`);
  if (stalled.length) console.log(`\n  ziarna bez rozstrzygnięcia: ${summary.stalledSeeds.join(', ')}`);
}

// Kod wyjścia niesie werdykt, żeby dało się to wpiąć w kontrolę automatyczną
const ok = crashed.length === 0 && winRate >= 5 && winRate <= 60;
process.exit(ok ? 0 : 1);
