import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, MAX_DEPTH, HUNGER_START } from '../src/game.js';
import { TRUDNOSCI, DOMYSLNA_TRUDNOSC, ustalTrudnosc, znanaTrudnosc, wzmocnij } from '../src/trudnosc.js';
import { KINDS, BOSS } from '../src/monsters.js';
import { STAIRS_DOWN } from '../src/map.js';
import { serialize, loadFromString, fingerprint } from '../src/save.js';
import { playOut } from '../src/bot.js';

// Stopnie trudności (spec `roboczy/powrot-trudnosc-hud-acceptance-spec.md`, część B; D-055).

const rodzaj = (type) => KINDS.find(k => k.type === type);
const skaluj = (x, m) => Math.max(1, Math.round(x * m));

function maSchodyWDol(level) {
  for (let y = 0; y < level.h; y++) for (let x = 0; x < level.w; x++) if (level.at(x, y) === STAIRS_DOWN) return true;
  return false;
}

test('trzy stopnie: normalny jest wzorcem, nazwy angielskie i polskie prowadzą do tego samego stopnia', () => {
  assert.deepEqual(Object.keys(TRUDNOSCI), ['latwy', 'normalny', 'trudny']);
  assert.equal(DOMYSLNA_TRUDNOSC, 'normalny');
  assert.equal(TRUDNOSCI.normalny.pietra, MAX_DEPTH);
  assert.equal(TRUDNOSCI.normalny.potwory, 1);
  assert.equal(TRUDNOSCI.normalny.glod, 1);
  assert.ok(TRUDNOSCI.latwy.pietra < MAX_DEPTH && TRUDNOSCI.trudny.pietra > MAX_DEPTH);
  assert.ok(TRUDNOSCI.latwy.potwory < 1 && TRUDNOSCI.trudny.potwory > 1);
  assert.ok(TRUDNOSCI.latwy.glod > 1 && TRUDNOSCI.trudny.glod < 1);
  for (const [a, b] of [['easy', 'latwy'], ['NORMAL', 'normalny'], [' hard ', 'trudny'], ['latwy', 'latwy'], ['trudny', 'trudny']]) {
    assert.equal(ustalTrudnosc(a), b);
  }
  assert.equal(ustalTrudnosc('medium'), null);
  assert.equal(ustalTrudnosc(undefined), null);
  assert.ok(znanaTrudnosc('trudny') && !znanaTrudnosc('hard'));
});

test('wzmocnienie: mnożnik 1 nie dotyka niczego, inne skalują życie i siłę, nigdy poniżej 1', () => {
  const m = { hp: 5, maxHp: 5, str: 3, def: 0, xp: 2 };
  assert.deepEqual(wzmocnij({ ...m }, 1), m);
  assert.deepEqual(wzmocnij({ ...m }, 1.2), { hp: 6, maxHp: 6, str: 4, def: 0, xp: 2 });
  assert.deepEqual(wzmocnij({ hp: 1, maxHp: 1, str: 1 }, 0.1), { hp: 1, maxHp: 1, str: 1 });
});

test('stopień normalny = gra bez stopnia: ten sam odcisk po 400 turach bota, potwory bez wzmocnienia', () => {
  for (const seed of ['norm-0', 'norm-1']) {
    const a = new Game(seed);
    const b = new Game(seed, { trudnosc: 'normalny' });
    playOut(a, { maxTurns: 400 });
    playOut(b, { maxTurns: 400 });
    assert.equal(fingerprint(a), fingerprint(b), `ziarno ${seed}: stopień normalny zmienił przebieg`);
    assert.equal(a.trudnosc, 'normalny');
  }
  const g = new Game('norm-2');
  assert.equal(g.maxDepth, MAX_DEPTH);
  assert.equal(g.player.hunger, HUNGER_START);
  for (const m of g.monsters) {
    assert.equal(m.maxHp, rodzaj(m.type).hp);
    assert.equal(m.str, rodzaj(m.type).str);
  }
  // nieznany stopień nie wywraca gry - jest normalny
  assert.equal(new Game('norm-3', { trudnosc: 'ultra' }).trudnosc, 'normalny');
});

for (const stopien of ['latwy', 'trudny']) {
  test(`${stopien}: liczba pięter, siła potworów, sytość, przeciwnik ostateczny na dnie, dno bez zejścia, pula rozciągnięta`, () => {
    const T = TRUDNOSCI[stopien];
    const g = new Game(`${stopien}-0`, { trudnosc: stopien });
    assert.equal(g.trudnosc, stopien);
    assert.equal(g.maxDepth, T.pietra);
    assert.equal(g.player.hunger, Math.round(HUNGER_START * T.glod));
    for (const m of g.monsters) {
      assert.equal(m.maxHp, skaluj(rodzaj(m.type).hp, T.potwory), `${m.type}: życie nieprzeskalowane`);
      assert.equal(m.str, skaluj(rodzaj(m.type).str, T.potwory), `${m.type}: siła nieprzeskalowana`);
      assert.equal(m.def, rodzaj(m.type).def, 'obrona ma zostać');
      assert.equal(m.xp, rodzaj(m.type).xp, 'doświadczenie ma zostać');
    }
    // piętro 1 ma stwory z piętra wzorcowego 1: nic głębszego niż kobold
    assert.ok(g.monsters.every(m => rodzaj(m.type).minD === 1), 'na piętrze 1 tylko stwory z płycizny');

    for (let d = 2; d <= T.pietra; d++) g.enterLevel(d, 'down');
    assert.equal(g.depth, T.pietra);
    const boss = g.monsters.find(m => m.boss);
    assert.ok(boss, 'na dnie ma być przeciwnik ostateczny');
    assert.equal(boss.maxHp, skaluj(BOSS.hp, T.potwory));
    assert.equal(boss.str, skaluj(BOSS.str, T.potwory));
    assert.ok(!maSchodyWDol(g.level), 'dno nie ma zejścia');
    assert.ok(maSchodyWDol(g.levels.get(T.pietra - 1).level), 'przedostatnie piętro ma zejście');
    assert.equal(g.descend(), false);
    // pula dna = pula piętra wzorcowego 8, niezależnie od liczby pięter
    const mieszkancy = g.monsters.filter(m => !m.boss);
    assert.ok(mieszkancy.length > 0);
    assert.ok(mieszkancy.every(m => rodzaj(m.type).maxD >= MAX_DEPTH), `na dnie mają być stwory z dna wzorcowego, są: ${mieszkancy.map(m => m.type).join(',')}`);
  });
}

test('jedzenie syci proporcjonalnie do stopnia', () => {
  for (const stopien of ['latwy', 'normalny', 'trudny']) {
    const g = new Game(`syci-${stopien}`, { trudnosc: stopien });
    g.player.hunger = 100;
    g.player.inventory = [];
    const racja = { id: g.newId(), kind: 'food', type: 'ration', name: 'racja żywnościowa', nutrition: 800, px: 0, py: 0 };
    g.player.inventory.push(racja);
    assert.ok(g.act({ type: 'use', index: 0 }), 'zjedzenie powinno się udać');
    // minus jedna tura głodu po działaniu
    assert.equal(g.player.hunger, 100 + Math.round(800 * TRUDNOSCI[stopien].glod) - 1);
  }
});

test('zapis niesie stopień i liczbę pięter; zapis bez pola wczytuje się jako normalny', () => {
  const g = new Game('zapis-trudny', { trudnosc: 'trudny' });
  playOut(g, { maxTurns: 50 });
  const r = loadFromString(serialize(g));
  assert.equal(r.game.trudnosc, 'trudny');
  assert.equal(r.game.maxDepth, TRUDNOSCI.trudny.pietra);
  assert.equal(fingerprint(r.game), fingerprint(g));

  const dane = JSON.parse(serialize(new Game('zapis-norm')));
  assert.equal(dane.trudnosc, 'normalny');
  delete dane.trudnosc;
  const s = loadFromString(JSON.stringify(dane));
  assert.equal(s.game.trudnosc, 'normalny');
  assert.equal(s.game.maxDepth, MAX_DEPTH);
});

test('gracz automatyczny na tych samych ziarnach: łatwy wygrywa nie rzadziej niż normalny, normalny nie rzadziej niż trudny', () => {
  // Zgrubna kontrola kierunku na 30 ziarnach; wiążący pomiar to 300 partii na
  // stopień (`roboczy/zmierz-trudnosc.mjs`, liczby w D-055).
  const wygrane = {};
  for (const stopien of ['latwy', 'normalny', 'trudny']) {
    let n = 0;
    for (let i = 0; i < 30; i++) if (playOut(new Game(`stopien-${i}`, { trudnosc: stopien })).outcome === 'won') n++;
    wygrane[stopien] = n;
  }
  assert.ok(wygrane.latwy >= wygrane.normalny, `łatwy ${wygrane.latwy} < normalny ${wygrane.normalny}`);
  assert.ok(wygrane.normalny >= wygrane.trudny, `normalny ${wygrane.normalny} < trudny ${wygrane.trudny}`);
  assert.ok(wygrane.latwy > wygrane.trudny, `łatwy ${wygrane.latwy} nie jest łatwiejszy od trudnego ${wygrane.trudny}`);
});
