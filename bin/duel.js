#!/usr/bin/env node
// Seria pojedynków graczy automatycznych - przyrząd do reguły tury.
//
// Odpowiada na pytania, których nie da się rozstrzygnąć czytaniem kodu:
// czy spotkanie dwóch graczy kończy się rozejściem czy śmiercią, czy da się
// z niego wyjść, i czy obecność drugiego uczestnika nie wywraca partii.
//
// Użycie: node bin/duel.js [--games N] [--base ziarno-] [--players N]
//                          [--progress plik] [--json]

import { Game } from '../src/game.js';
import { playDuel } from '../src/bot.js';
import { appendFileSync } from 'node:fs';

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const ILE = Number(arg('--games', 100));
const BAZA = arg('--base', 'duel-');
const GRACZY = Number(arg('--players', 2));
const POSTEP = arg('--progress', null);
const MAPA = arg('--map', null);   // np. --map 150x40
const [MW, MH] = MAPA ? MAPA.split('x').map(Number) : [null, null];
const JSON_OUT = process.argv.includes('--json');

const sum = {
  games: 0, crashed: 0, stalled: 0, done: 0,
  spotkania: 0, rozejscia: 0, ciosyMiedzyGraczami: 0, przegraneStarcia: 0,
  turyUczestnikow: 0, turyUczestnikowWKontakcie: 0,
  turyWspolne: 0, turyWolne: 0, turns: 0,
  zwyciestwa: 0, smierciOdPotworow: 0, zyjacyNaKoniec: 0,
  partieBezSpotkania: 0, crashSeeds: [], stalledSeeds: [],
};

const start = Date.now();
let ostatni = '';

function pisz(i) {
  if (!POSTEP) return;
  const el = Math.round((Date.now() - start) / 1000);
  const pasek = '#'.repeat(Math.round(20 * i / ILE)).padEnd(20, '-');
  const zostalo = i ? Math.round(el / i * (ILE - i)) : 0;
  const t = new Date().toTimeString().slice(0, 8);
  appendFileSync(POSTEP, `[${t}] DUEL [${pasek}] ${i}/${ILE} (${Math.round(100 * i / ILE)}%)`
    + ` | spotkania ${sum.spotkania} | rozejscia ${sum.rozejscia}`
    + ` | przegrane starcia ${sum.przegraneStarcia} | zakleszczenia ${sum.stalled}`
    + ` | WYWROTKI ${sum.crashed} | ostatnie: ${ostatni} | ${el}s, zostalo ~${zostalo}s\n`);
}

for (let i = 0; i < ILE; i++) {
  const seed = `${BAZA}${i}`;
  const g = new Game(seed, MW ? { w: MW, h: MH } : {});
  g.heroes[0].name = 'Pierwszy';
  g.scatterHero(g.heroes[0], 1);
  for (let k = 1; k < GRACZY; k++) g.addHero(`Gracz ${k + 1}`, 1);

  const r = playDuel(g);
  sum.games++;
  sum[r.outcome === 'done' ? 'done' : r.outcome]++;
  if (r.outcome === 'crash') sum.crashSeeds.push(seed);
  if (r.outcome === 'stalled') sum.stalledSeeds.push(seed);
  for (const k of ['spotkania', 'rozejscia', 'ciosyMiedzyGraczami', 'przegraneStarcia', 'turyWspolne', 'turyWolne', 'turns', 'turyUczestnikow', 'turyUczestnikowWKontakcie']) sum[k] += r[k];
  if (!r.spotkania) sum.partieBezSpotkania++;
  for (const h of r.heroes) {
    if (h.status === 'won') sum.zwyciestwa++;
    else if (h.status === 'dead') sum.smierciOdPotworow++;
    else sum.zyjacyNaKoniec++;
  }
  ostatni = `${r.outcome} sp${r.spotkania} pk${r.przegraneStarcia}`;
  if (i % 5 === 0 || i === ILE - 1) pisz(i + 1);
}

sum.seconds = Math.round((Date.now() - start) / 10) / 100;
if (JSON_OUT) console.log(JSON.stringify(sum, null, 2));
else {
  const pol = MW ? MW * MH : 76 * 20;
  console.log(`\nSeria pojedynków: ${sum.games} partii, ${GRACZY} graczy, mapa ${MW ?? 76}x${MH ?? 20} (${pol} pól), ${sum.seconds}s`);
  console.log(`  pól na gracza:       ${Math.round(pol / GRACZY)}`);
  console.log(`  wywrotki:            ${sum.crashed}`);
  console.log(`  bez rozstrzygnięcia: ${sum.stalled}`);
  console.log(`  spotkania:           ${sum.spotkania} (partii bez ani jednego: ${sum.partieBezSpotkania})`);
  console.log(`  rozejścia:           ${sum.rozejscia}`);
  console.log(`  ciosy gracz-gracz:   ${sum.ciosyMiedzyGraczami}`);
  console.log(`  przegrane starcia:   ${sum.przegraneStarcia}`);
  console.log(`  tury wspólne:        ${sum.turyWspolne}`);
  console.log(`  tury własnym tempem: ${sum.turyWolne}`);
  const gest = sum.turyUczestnikow ? (100 * sum.turyUczestnikowWKontakcie / sum.turyUczestnikow) : 0;
  console.log(`  czas w kontakcie:    ${gest.toFixed(1)}% tur uczestnika (${sum.turyUczestnikowWKontakcie}/${sum.turyUczestnikow})`);
  console.log(`  starć na partię:     ${(sum.przegraneStarcia / sum.games).toFixed(1)} przegranych`);
}
