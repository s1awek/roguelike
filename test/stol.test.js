// Stół: rozjemca tury. Zegar jest podstawiony, więc testy nie śpią ani sekundy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { Stol } from '../src/stol.js';
import { mozna, dolozDoPlecaka } from '../src/plecak.js';
import { WEAPONS } from '../src/items.js';

/** Gra z uczestnikami postawionymi ręcznie: obok siebie albo daleko od siebie. */
function stol(seed, ilu, { obokSiebie, opts = {} } = {}) {
  const g = new Game(seed);
  for (let i = 1; i < ilu; i++) g.addHero(`Gracz ${i + 1}`, 1, { scatter: false });
  const L = g.levels.get(1).level;
  const wolne = [];
  for (let y = 1; y < L.h - 1 && wolne.length < 200; y++) {
    for (let x = 1; x < L.w - 1; x++) {
      if (L.isWalkable(x, y) && !g.monsterOn(1, x, y)) wolne.push([x, y]);
    }
  }
  assert.ok(wolne.length >= ilu * 2, 'za mało wolnych pól na tej mapie');
  if (obokSiebie) {
    g.heroes.forEach((h, i) => { h.depth = 1; [h.x, h.y] = wolne[i]; });
    for (const h of g.heroes) g.updateFOV(h);
  } else {
    // Rozstawienie „osobno" musi być SPRAWDZONE, nie oszacowane odległością:
    // dwa pola daleko od siebie w linii prostej mogą leżeć w tym samym
    // korytarzu i widzieć się wzajemnie. Kandydat wchodzi, dopiero gdy nikt
    // z już postawionych go nie widzi, ani on nikogo.
    const postawieni = [];
    for (const h of g.heroes) {
      let udalo = false;
      for (const [x, y] of wolne) {
        h.depth = 1; h.x = x; h.y = y;
        g.updateFOV(h);
        if (postawieni.every(o => !h.visible.has(`${o.x},${o.y}`) && !o.visible.has(`${x},${y}`))) {
          postawieni.push(h); udalo = true; break;
        }
      }
      assert.ok(udalo, 'nie udało się rozstawić uczestników poza polem widzenia');
    }
  }
  let zegar = 1_000_000;
  const s = new Stol(g, { teraz: () => zegar, ...opts });
  return { g, s, przesun: (ms) => { zegar += ms; }, teraz: () => zegar };
}

const KROK = { type: 'move', dx: 1, dy: 0 };

test('poza kontaktem nikt na nikogo nie czeka', () => {
  const { g, s } = stol('osobno', 3, { obokSiebie: false });
  // gdyby ktokolwiek był w kontakcie, ten test mierzyłby coś innego
  for (const h of g.heroes) assert.equal(g.contacts(h).length, 0, 'uczestnicy mieli stać osobno');
  for (const h of g.heroes) s.zadeklaruj(h.hid, { type: 'wait' });
  const w = s.tick();
  assert.equal(w.wykonane.length, 3, `zadziałało ${w.wykonane.length} z 3`);
  assert.equal(w.wykonane.every(x => x.wspolna === false), true, 'to nie miała być tura wspólna');
  assert.equal(w.czekaja.length, 0);
});

test('jeden brak deklaracji nie rusza cudzej gry poza kontaktem', () => {
  const { g, s } = stol('osobno-2', 2, { obokSiebie: false });
  s.zadeklaruj(0, { type: 'wait' });
  const w = s.tick();
  assert.deepEqual(w.wykonane.map(x => x.hid), [0]);
  assert.equal(w.czekaja.length, 1, 'milczący ma czekać na siebie, i tylko na siebie');
  assert.equal(g.heroes[1].hunger, new Game('osobno-2').player.hunger, 'milczącemu ubył głód');
});

test('w kontakcie tura NIE rusza, dopóki nie ma wszystkich deklaracji', () => {
  const { g, s } = stol('kontakt', 2, { obokSiebie: true });
  assert.equal(g.contacts(g.heroes[0]).length, 1, 'uczestnicy mieli się widzieć');
  const tura = g.turn;
  s.zadeklaruj(0, KROK);
  const w = s.tick();
  assert.equal(g.turn, tura, 'tura zeszła przed zebraniem deklaracji');
  assert.equal(w.wykonane.length, 0);
  assert.deepEqual(w.czekaja[0].milczacy, [1]);
});

test('po zebraniu obu deklaracji tura rozstrzyga się RAZ, dla obu', () => {
  const { g, s } = stol('kontakt-2', 2, { obokSiebie: true });
  const tura = g.turn;
  s.zadeklaruj(0, { type: 'wait' });
  s.zadeklaruj(1, { type: 'wait' });
  const w = s.tick();
  assert.equal(g.turn, tura + 1, 'tura wspólna policzyła się inną liczbę razy niż raz');
  assert.equal(w.wykonane.length, 2);
  assert.equal(w.wykonane.every(x => x.wspolna === true), true);
});

test('po upływie czasu milczący STOI BEZCZYNNIE, a partia idzie dalej', () => {
  const { g, s, przesun } = stol('termin', 2, { obokSiebie: true, opts: { czasNaDeklaracjeMs: 5000 } });
  const tura = g.turn;
  s.zadeklaruj(0, { type: 'wait' });
  s.tick();                       // ustawia termin
  assert.equal(g.turn, tura, 'nie powinno ruszyć od razu');
  przesun(4999);
  s.tick();
  assert.equal(g.turn, tura, 'ruszyło przed terminem');
  przesun(2);
  const w = s.tick();
  assert.equal(g.turn, tura + 1, 'po terminie tura MIAŁA zejść');
  assert.equal(w.wykonane.length, 2, 'milczący ma odbyć turę bezczynnie, a nie wypaść z partii');
  assert.equal(s.zdarzenia.filter(z => z.co === 'termin').length, 1, 'przekroczenie terminu ma być zapisane');
});

test('deklaracja jest NIEJAWNA: samo zgłoszenie nie zmienia świata', () => {
  const { g, s } = stol('niejawna', 2, { obokSiebie: true });
  const przed = JSON.stringify(g.heroes.map(h => [h.x, h.y, h.hp, h.hunger]));
  s.zadeklaruj(0, KROK);
  s.zadeklaruj(1, KROK);
  assert.equal(JSON.stringify(g.heroes.map(h => [h.x, h.y, h.hp, h.hunger])), przed,
    'zgłoszenie działania samo w sobie ruszyło grę');
  assert.equal(s.stan().uczestnicy.filter(u => u.zadeklarowal).length, 2);
  // stan stołu mówi TYLKO, że ktoś zadeklarował - nigdy co zadeklarował
  assert.equal(JSON.stringify(s.stan()).includes('"dx"'), false,
    'podglądany stan stołu zdradza treść cudzej deklaracji');
});

test('bot dosadzony do stołu gra sam, dławiony tempem', () => {
  const { g, s, przesun } = stol('bot-2', 1, { obokSiebie: false, opts: { tempoBotaMs: 300 } });
  const { hero } = s.dosiadz('Automat', { rodzaj: 'bot' });
  const tura = g.turn;
  const w1 = s.tick();
  assert.ok(w1.wykonane.some(x => x.hid === hero.hid), 'bot miał zagrać sam, bez deklaracji z zewnątrz');
  const po = g.turn;
  s.tick();
  assert.equal(g.turn, po, 'bot zagrał drugi raz w tej samej chwili - tempo nie dławi');
  przesun(301);
  s.tick();
  assert.ok(g.turn > po, 'po upływie tempa bot miał zagrać ponownie');
  assert.ok(po > tura);
});

test('KONTROLA PRZYRZĄDU: odmowa poza kontaktem nie kosztuje tury', () => {
  const { g, s } = stol('odmowa', 1, { obokSiebie: false });
  const h = g.heroes[0];
  // szukamy kierunku, w którym stoi ściana - taki krok gra ma odrzucić
  const L = g.levels.get(1).level;
  let kier = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (!L.isWalkable(h.x + dx, h.y + dy)) { kier = { type: 'move', dx, dy }; break; }
  }
  assert.ok(kier, 'uczestnik stoi na otwartej przestrzeni - test nie ma czego zmierzyć');
  const tura = g.turn;
  s.zadeklaruj(0, kier);
  const w = s.tick();
  assert.equal(g.turn, tura, 'odmowa zabrała turę');
  assert.equal(w.odrzucone.length, 1, 'odmowa nie została zgłoszona wywołującemu');
  assert.equal(w.wykonane.length, 0);
});

test('KONTROLA PRZYRZĄDU: deklaracja od uczestnika po partii jest odrzucana', () => {
  const { g, s } = stol('po-partii', 2, { obokSiebie: false });
  g.heroes[1].status = 'dead';
  assert.equal(s.zadeklaruj(1, KROK).ok, false);
  assert.equal(s.zadeklaruj(7, KROK).ok, false, 'przyjęto deklarację od nieistniejącego miejsca');
  assert.equal(s.zadeklaruj(0, KROK).ok, true, 'żywemu uczestnikowi odmówiono');
});

// ---------- porządkowanie plecaka nie jest ruchem w świecie ----------

/** Wkłada broń danego rodzaju do plecaka tą samą drogą, co podniesienie z ziemi. */
let idTestowe = 90000;
function wloz(g, hero, type) {
  const p = WEAPONS.find(w => w.type === type);
  const it = { id: idTestowe++, kind: 'weapon', type: p.type, name: p.name, bonus: p.bonus, size: p.size };
  assert.equal(dolozDoPlecaka(hero, it, (x) => g.etykieta(x)), 1, `nie zmieściło się: ${p.name}`);
}

test('przełożenie w plecaku nie kosztuje tury i nie czeka na sąsiada', () => {
  // Dwoje uczestników stoi obok siebie, więc ich tura jest WSPÓLNA: żaden ruch
  // nie zejdzie, dopóki oba miejsca nie zadeklarują. Porządkowanie plecaka musi
  // przejść mimo to - inaczej przekładanie rzeczy byłoby zabraniem tury komuś,
  // kto akurat walczy.
  const { s, g } = stol('plecak-stol-1', 2, { obokSiebie: true });
  const a = g.heroes[0];
  wloz(g, a, 'mace');
  const it = a.inventory.find(i => Number.isInteger(i.px));
  assert.ok(it, 'uczestnik powinien mieć w plecaku cokolwiek ułożonego');
  const index = a.inventory.indexOf(it);
  const tura = g.turn;

  // Puste pole liczone tą samą regułą co silnik, a nie zgadnięte.
  let cel = null;
  for (let y = 0; y < a.plecak.h && !cel; y++) {
    for (let x = 0; x < a.plecak.w && !cel; x++) {
      if ((x !== it.px || y !== it.py) && mozna(a, it, x, y, it.obrot || 0, it)) cel = { x, y };
    }
  }
  assert.ok(cel, 'w startowym plecaku musi być dokąd przełożyć');

  const r = s.przeloz(a.hid, { index, x: cel.x, y: cel.y, obrot: it.obrot || 0 });
  assert.equal(r.ok, true, r.powod);
  assert.equal(a.inventory[index].px, cel.x);
  assert.equal(a.inventory[index].py, cel.y);
  assert.equal(g.turn, tura, 'przekładanie zabrało turę');
  assert.ok(!s.miejsca.get(a.hid).deklaracja,
    'przekładanie nie może zostawiać po sobie deklaracji');
});

test('KONTROLA PRZYRZĄDU: stół odmawia przełożenia poza plecak i na zajęte pole', () => {
  const { s, g } = stol('plecak-stol-2', 2, { obokSiebie: true });
  const a = g.heroes[0];
  wloz(g, a, 'mace');
  wloz(g, a, 'dagger');
  const index = a.inventory.findIndex(i => Number.isInteger(i.px));
  const it = a.inventory[index];

  assert.equal(s.przeloz(a.hid, { index, x: 99, y: 0, obrot: 0 }).ok, false, 'poza planszą');
  assert.equal(s.przeloz(a.hid, { index: 99, x: 0, y: 0, obrot: 0 }).ok, false, 'nie ma takiej rzeczy');
  assert.equal(s.przeloz(4242, { index, x: 0, y: 0, obrot: 0 }).ok, false, 'obce miejsce');

  const inne = a.inventory.find((w, k) => k !== index && Number.isInteger(w.px));
  if (inne) {
    assert.equal(s.przeloz(a.hid, { index, x: inne.px, y: inne.py, obrot: inne.obrot || 0 }).ok, false,
      'wolno było położyć rzecz na rzeczy');
  }
  assert.equal(a.inventory[index].px, it.px, 'odmowa nie może niczego przesunąć');
});
