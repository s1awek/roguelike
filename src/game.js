// Silnik rozgrywki: tury, walka, głód, przedmioty, poziomy lochu.
//
// Dwie decyzje warte zapamiętania:
//
// 1. Identyfikatory bytów są przydzielane PER ROZGRYWKA (this.newId), nie z licznika
//    modułu. Licznik modułu wyglądałby na działający, ale dwie rozgrywki z tego samego
//    ziarna w jednym procesie dostałyby różne identyfikatory - a bot rozgrywa tysiąc
//    partii w jednym procesie i porównuje stany. Byłaby to niepowtarzalność widoczna
//    dopiero w teście powtarzalności, czyli najgorszy rodzaj.
//
// 2. Potwory nie liczą trasy każdy z osobna (A* razy N potworów razy tura). Raz na turę
//    powstaje mapa odległości od gracza i każdy potwór schodzi po niej w dół. Wynik jest
//    identyczny z A*, a koszt spada z O(N * mapa) do O(mapa).

import { RNG } from './rng.js';
import { generateLevel, Level, STAIRS_DOWN, STAIRS_UP, WALL } from './map.js';
import { computeFOV } from './fov.js';
import { distanceField, neighbors, chebyshev } from './path.js';
import { randomItem, makeAmulet, makeAppearances, itemLabel, SCENTS, POTION_SCENT, scentGroup } from './items.js';
import { spawnMonster, spawnBoss } from './monsters.js';
import { bytesToBase64, base64ToBytes } from './bytes.js';

export const MAX_DEPTH = 8;
export const FOV_RADIUS = 8;
export const INVENTORY_LIMIT = 16;
export const HUNGER_START = 1200;
export const HUNGER_MAX = 2000;

const PLAYER_START = { hp: 30, str: 6, def: 2 };

/** Próg doświadczenia potrzebny do osiągnięcia danego poziomu postaci. */
export function xpForLevel(n) { return Math.floor(10 * Math.pow(n - 1, 1.85)); }

export class Game {
  constructor(seed = 'los', opts = {}) {
    this.seed = seed;
    this.rng = new RNG(seed);
    this.maxDepth = opts.maxDepth ?? MAX_DEPTH;
    this.width = opts.w ?? 76;
    this.height = opts.h ?? 20;
    this._idCounter = 1;

    this.appearances = makeAppearances(this.rng);
    this.levels = new Map(); // depth -> {level, monsters, items} - to jest ŚWIAT, wspólny
    this.turn = 0;

    // Uczestnicy. Gra jednoosobowa to lista o długości jeden, a `this.player` jest
    // WIDOKIEM na uczestnika czynnego. Dzięki temu cały silnik, napisany w liczbie
    // pojedynczej, działa bez zmiany i bez drugiej ścieżki kodu „jeśli wielu" -
    // a druga ścieżka rozeszłaby się z pierwszą przy pierwszym strojeniu.
    this.heroes = [];
    this.active = 0;
    // Licznik do POMIARU starć, nie część stanu gry - nie wchodzi do zapisu.
    this.stats = { pvpHits: 0, fightsLost: 0 };
    this.heroes.push(this.makeHero(opts.name ?? 'Ty'));

    if (!opts.deferStart) this.enterLevel(1, 'start');
  }

  newId() { return this._idCounter++; }

  /**
   * Nowy uczestnik. Wszystko, co jest CIAŁEM albo WIEDZĄ, należy do niego:
   * położenie, życie, plecak, pamięć terenu, dziennik, rozpoznane rodzaje.
   * Wspólny zostaje wyłącznie świat - loch, potwory, przedmioty na podłodze,
   * generator losowy i wygląd mikstur.
   *
   * Uczestnik NIE pobiera identyfikatora z `newId()` celowo: przesunąłby
   * numerację potworów i przedmiotów, a od niej zależy powtarzalność serii bota.
   */
  makeHero(name = 'Ty') {
    return {
      hid: this.heroes.length,
      name,
      x: 0, y: 0,
      hp: PLAYER_START.hp, maxHp: PLAYER_START.hp,
      str: PLAYER_START.str, def: PLAYER_START.def,
      level: 1, xp: 0,
      hunger: HUNGER_START,
      inventory: [],
      weapon: null, armor: null,
      hasAmulet: false,
      kills: 0,
      depth: 0,
      memory: new Map(),   // głębokość -> Uint8Array; pamięć terenu jest OSOBISTA
      visible: new Set(),
      messages: [],
      identified: new Set(),
      sniffed: new Set(),
      status: 'playing',   // 'playing' | 'won' | 'dead'
      cause: null,
      deathCause: null,
    };
  }

  get player() { return this.heroes[this.active]; }

  // Widoki na uczestnika czynnego. Silnik czyta i pisze `this.depth`,
  // `this.messages`, `this.identified` i tak dalej - a trafia to do uczestnika.
  get depth() { return this.player.depth; }
  set depth(v) { this.player.depth = v; }
  get visible() { return this.player.visible; }
  set visible(v) { this.player.visible = v; }
  get messages() { return this.player.messages; }
  set messages(v) { this.player.messages = v; }
  get identified() { return this.player.identified; }
  set identified(v) { this.player.identified = v; }
  get sniffed() { return this.player.sniffed; }
  set sniffed(v) { this.player.sniffed = v; }
  get status() { return this.player.status; }
  set status(v) { this.player.status = v; }
  get cause() { return this.player.cause; }
  set cause(v) { this.player.cause = v; }
  get deathCause() { return this.player.deathCause; }
  set deathCause(v) { this.player.deathCause = v; }

  /** Osobista pamięć terenu danego uczestnika na danym poziomie. */
  memoryOf(hero, depth = hero.depth) {
    let m = hero.memory.get(depth);
    if (!m) {
      const L = this.levels.get(depth).level;
      m = new Uint8Array(L.w * L.h);
      hero.memory.set(depth, m);
    }
    return m;
  }

  // ---------- świat ----------

  get here() { return this.levels.get(this.depth); }
  get level() { return this.here.level; }
  get monsters() { return this.here.monsters; }
  get items() { return this.here.items; }

  message(text) { this.tell(this.player, text); }

  /** Komunikat do dziennika KONKRETNEGO uczestnika - dziennik jest osobisty. */
  tell(hero, text) {
    if (!hero) return;
    hero.messages.push({ turn: this.turn, text });
    if (hero.messages.length > 200) hero.messages.shift();
  }

  isHero(x) { return this.heroes.includes(x); }

  /** Żywi uczestnicy na danym poziomie, w STAŁEJ kolejności - od kolejności
   *  zależy zużycie generatora losowego, więc nie wolno jej uzależnić od niczego. */
  heroesOn(depth) {
    return this.heroes.filter(h => h.status === 'playing' && h.depth === depth);
  }

  heroAt(x, y, depth, except = null) {
    return this.heroes.find(h => h !== except && h.status === 'playing'
      && h.depth === depth && h.x === x && h.y === y) || null;
  }

  /**
   * Inni uczestnicy, z którymi ten jest w KONTAKCIE - czyli tacy, których widzi.
   *
   * To jest granica, na której tura przestaje być prywatna i staje się wspólna.
   * Kontakt idzie po polu widzenia, a pole widzenia jest w tej grze symetryczne
   * (kryterium 3 pierwotnej spec-a), więc „A widzi B" znaczy też „B widzi A"
   * i nie trzeba pytać dwa razy.
   *
   * Świadomie NIE po wejściu na poziom: przy kilku uczestnikach cały poziom
   * czekałby na najwolniejszego, a przy dziesięciu byłoby to nie do gry.
   */
  contacts(hero) {
    return this.heroes.filter(o => o !== hero && o.status === 'playing'
      && o.depth === hero.depth && hero.visible.has(`${o.x},${o.y}`));
  }

  monsterOn(depth, x, y) {
    const e = this.levels.get(depth);
    return e ? e.monsters.find(m => m.x === x && m.y === y && m.hp > 0) : undefined;
  }

  /**
   * Dołącza uczestnika do trwającej partii.
   *
   * Domyślnie ROZSTAWIA go po poziomie, a nie stawia na schodach wejściowych.
   * Wyszło to z pierwszego pomiaru pojedynku: gdy wszyscy wchodzą tymi samymi
   * schodami, każda partia zaczyna się bójką na wejściu, jeszcze przed
   * znalezieniem czegokolwiek - czyli spotkanie nie jest wtedy wydarzeniem,
   * tylko podatkiem od wejścia.
   */
  addHero(name = null, depth = 1, { scatter = true } = {}) {
    const hero = this.makeHero(name ?? `Gracz ${this.heroes.length + 1}`);
    this.heroes.push(hero);
    if (scatter) this.scatterHero(hero, depth);
    else this.placeHero(hero, depth, 'start');
    return hero;
  }

  /** Stawia uczestnika na wolnym polu poziomu, z dala od innych uczestników. */
  scatterHero(hero, depth = hero.depth || 1) {
    if (!this.levels.has(depth)) this.levels.set(depth, this.buildLevel(depth));
    hero.depth = depth;
    const entry = this.levels.get(depth);
    const inni = this.heroes
      .filter(h => h !== hero && h.depth === depth)
      .map(h => ({ x: h.x, y: h.y }));
    const p = this.freeTile(entry.level, entry.monsters, entry.items, inni);
    if (p) { hero.x = p.x; hero.y = p.y; }
    this.updateFOV(hero);
    return hero;
  }

  /** Losowe wolne pole podłogi, na którym nikt nie stoi i nic nie leży. */
  freeTile(level, monsters, items, avoid = []) {
    for (let tries = 0; tries < 600; tries++) {
      const x = this.rng.int(level.w), y = this.rng.int(level.h);
      if (!level.isWalkable(x, y)) continue;
      if (level.at(x, y) === STAIRS_DOWN || level.at(x, y) === STAIRS_UP) continue;
      if (monsters.some(m => m.x === x && m.y === y)) continue;
      if (items.some(i => i.x === x && i.y === y)) continue;
      if (avoid.some(p => p.x === x && p.y === y)) continue;
      return { x, y };
    }
    return null;
  }

  buildLevel(depth) {
    const level = generateLevel(this.rng, { w: this.width, h: this.height, depth });
    const monsters = [];
    const items = [];

    const count = 4 + depth;
    for (let i = 0; i < count; i++) {
      const p = this.freeTile(level, monsters, items, [level.upPos]);
      if (!p) break;
      const m = spawnMonster(this.rng, depth, p.x, p.y);
      m.id = this.newId();
      monsters.push(m);
    }
    if (depth === this.maxDepth) {
      const p = this.freeTile(level, monsters, items, [level.upPos]) || { x: level.downPos.x, y: level.downPos.y };
      const b = spawnBoss(p.x, p.y);
      b.id = this.newId();
      b.asleep = true;
      monsters.push(b);
    }

    const itemCount = 3 + Math.floor(depth / 2) + this.rng.int(3);
    for (let i = 0; i < itemCount; i++) {
      const p = this.freeTile(level, monsters, items);
      if (!p) break;
      const it = randomItem(this.rng, depth);
      it.id = this.newId();
      it.x = p.x; it.y = p.y;
      items.push(it);
    }
    // gwarancja jedzenia: bez tego głębokie poziomy potrafią zagłodzić gracza
    // niezależnie od jego gry, co czyni partię nie do wygrania z przyczyn losowych
    if (!items.some(i => i.kind === 'food')) {
      const p = this.freeTile(level, monsters, items);
      if (p) {
        const it = randomItem(this.rng, depth);
        it.kind = 'food'; it.type = 'ration'; it.name = 'racja żywnościowa'; it.nutrition = 800;
        it.id = this.newId(); it.x = p.x; it.y = p.y;
        items.push(it);
      }
    }

    return { level, monsters, items };
  }

  enterLevel(depth, from = 'down') { this.placeHero(this.player, depth, from); }

  placeHero(hero, depth, from = 'down') {
    if (depth < 1) depth = 1;
    if (!this.levels.has(depth)) this.levels.set(depth, this.buildLevel(depth));
    hero.depth = depth;
    const entry = this.levels.get(depth);
    const L = entry.level;
    const spot = from === 'up' ? L.downPos : L.upPos; // wracając z dołu stajemy przy schodach w dół
    hero.x = spot.x;
    hero.y = spot.y;
    // gdyby na schodach stał potwór, przesuwamy go, zamiast wpychać gracza w potwora
    const blocker = entry.monsters.find(m => m.x === spot.x && m.y === spot.y);
    if (blocker) {
      const p = this.freeTile(L, entry.monsters, entry.items, [spot]);
      if (p) { blocker.x = p.x; blocker.y = p.y; }
    }
    // Gdyby na wejściu stał już inny uczestnik, schodzimy o pole obok. BEZ losowania:
    // obecność drugiego gracza nie może przesuwać strumienia losowego, bo wtedy
    // partia jednoosobowa i wieloosobowa z tego samego ziarna to dwa różne lochy.
    if (this.heroAt(hero.x, hero.y, depth, hero)) {
      for (const [nx, ny] of neighbors(spot.x, spot.y, (x, y) => L.isWalkable(x, y))) {
        if (this.heroAt(nx, ny, depth, hero)) continue;
        if (entry.monsters.some(m => m.x === nx && m.y === ny && m.hp > 0)) continue;
        hero.x = nx; hero.y = ny; break;
      }
    }
    this.updateFOV(hero);
  }

  updateFOV(hero = this.player) {
    const L = this.levels.get(hero.depth).level;
    hero.visible = new Set();
    const mem = this.memoryOf(hero);
    computeFOV({ x: hero.x, y: hero.y }, FOV_RADIUS,
      (x, y) => !L.inBounds(x, y) || L.isOpaque(x, y),
      (x, y) => {
        if (!L.inBounds(x, y)) return;
        hero.visible.add(`${x},${y}`);
        mem[L.idx(x, y)] = 1;
      });
  }

  isVisible(x, y) { return this.visible.has(`${x},${y}`); }
  isRemembered(x, y) { return this.memoryOf(this.player)[this.level.idx(x, y)] === 1; }

  monsterAt(x, y) { return this.monsters.find(m => m.x === x && m.y === y && m.hp > 0); }
  itemAt(x, y) { return this.items.find(i => i.x === x && i.y === y); }

  // ---------- statystyki bojowe ----------

  playerAttack(hero = this.player) {
    const w = hero.weapon;
    return hero.str + (w ? w.bonus + (w.enchant || 0) : 0);
  }

  playerDefense(hero = this.player) {
    const a = hero.armor;
    return hero.def + (a ? a.bonus + (a.enchant || 0) : 0);
  }

  // ---------- działania gracza ----------

  /**
   * Jedno działanie gracza. Zwraca true, jeśli minęła tura (czyli świat też się ruszył).
   * Działania odrzucone (ruch w ścianę, brak przedmiotu) NIE zużywają tury.
   */
  act(action) {
    if (this.player.status !== 'playing') return false;
    const hero = this.player;
    const spent = this.applyAction(hero, action);
    if (spent) { this.turn++; this.worldTurn([hero]); }
    return spent;
  }

  /**
   * Jedna tura WSPÓLNA. Wszyscy uczestnicy deklarują działanie, wszystkie
   * działania biorą skutek w tej samej turze, dopiero potem rusza się świat.
   *
   * To jest odpowiedź na dwie rzeczy naraz. Po pierwsze, nikt nie dostaje
   * darmowej serii ciosów: nie istnieje przebieg, w którym jeden uderza dwa
   * razy, a drugi nie ma między tymi ciosami możliwości zadziałania. Po drugie,
   * wycofanie się jest zawsze możliwe, bo krok w tył bierze skutek w tej samej
   * turze co cios przeciwnika. Wariant „blok N ruchów" dawałby drugiemu
   * graczowi N darmowych ciosów, co przy tych punktach życia jest śmiercią.
   *
   * Uczestnik bez deklaracji stoi bezczynnie - bezczynność jednego nie
   * zatrzymuje partii (kryterium 18 spec-a).
   *
   * `actions`: Map hid -> działanie. Zwraca Map hid -> czy tura zeszła.
   */
  resolveTurn(actions = new Map(), grupa = null) {
    // Uczestnicy tury ustalani PRZED działaniami: kto wchodził w turę żywy,
    // ten ją do końca odbywa, choćby w jej trakcie wygrał albo padł.
    //
    // `grupa` zawęża turę do tych, którzy są ze sobą w kontakcie. Bez tego
    // zawężenia tura wspólna dwóch graczy ruszała świat WSZYSTKIM, także tym,
    // którzy chodzą osobno - a ci dostawali swoją turę jeszcze raz, we własnym
    // tempie. Przy dwóch uczestnikach było to niewidoczne, bo grupa w kontakcie
    // jest wtedy całą listą; przy dziesięciu ośmiu pozostałym świat ruszał się
    // dwa razy na jedno ich działanie.
    const uczestnicy = (grupa ?? this.heroes).filter(h => h.status === 'playing');
    const spent = new Map();
    for (const hero of uczestnicy) {
      const a = actions.get(hero.hid) ?? { type: 'wait' };
      spent.set(hero.hid, this.applyAction(hero, a));
    }
    this.turn++;
    this.worldTurn(uczestnicy);
    return spent;
  }

  /**
   * Działanie JEDNEGO uczestnika, bez ruszania świata.
   *
   * Uczestnik czynny jest przestawiany na czas działania. Dzięki temu wszystkie
   * metody napisane w liczbie pojedynczej (`this.player`, `this.messages`,
   * `this.identified`) działają dla tego, kto właśnie działa - bez drugiej
   * ścieżki kodu i bez przewlekania uczestnika przez kilkanaście podpisów.
   */
  applyAction(hero, action) {
    const prev = this.active;
    this.active = this.heroes.indexOf(hero);
    try {
      switch (action.type) {
        case 'move': return this.tryMove(action.dx, action.dy);
        case 'wait': return true;
        case 'pickup': return this.pickUp();
        case 'descend': return this.descend();
        case 'ascend': return this.ascend();
        case 'use': return this.useItem(action.index);
        case 'drop': return this.dropItem(action.index);
        case 'sniff': return this.sniff(action.index);
        default: return false;
      }
    } finally {
      this.active = prev;
    }
  }

  /**
   * Świat odpowiada: potwory na każdym zamieszkanym poziomie, potem ciała.
   *
   * `uczestnicy` to ci, którzy WCHODZILI w turę żywi - a nie ci, którzy ją
   * przeżyli. Różnica jest o jeden punkt głodu i wyszła z pomiaru, nie z lektury:
   * gracz, który w tej samej turze wygrał, w pierwotnym silniku nadal zgłodniał
   * i nadal mógł oberwać. Filtr „tylko żywi" cicho by to zmienił.
   */
  worldTurn(uczestnicy = this.heroes.filter(h => h.status === 'playing')) {
    const poziomy = new Map();
    for (const h of uczestnicy) {
      if (!poziomy.has(h.depth)) poziomy.set(h.depth, []);
      poziomy.get(h.depth).push(h);
    }
    for (const [d, cele] of poziomy) this.monstersActOn(d, cele);

    for (const hero of uczestnicy) {
      this.tickRegen(hero);
      this.tickHunger(hero);
      this.updateFOV(hero);
      if (hero.hp <= 0 && hero.status === 'playing') {
        // Przegrane starcie z innym uczestnikiem NIE kończy partii (kryterium 21).
        if (hero.lastHitBy && this.isHero(hero.lastHitBy)) this.loseFight(hero, hero.lastHitBy);
        else this.die(hero, hero.deathCause || 'rany');
      }
    }
  }

  /**
   * Stawka przegranego starcia z innym uczestnikiem. **D-022:** przegrany gubi
   * cały dobytek i budzi się piętro wyżej, ale gra dalej.
   *
   * Sens: skoro całą regułą tury jest „przelicz siły i wycofaj się", to kara za
   * złe przeliczenie nie może brzmieć „koniec zabawy" - inaczej każde spotkanie
   * znowu jest zakładem o wszystko. Amulet też wypada, więc odebranie go komuś
   * jest realnym sposobem wygrania wyścigu.
   *
   * To jedno miejsce w silniku. Zmiana stawki na inną (śmierć, zgoda na walkę)
   * jest zmianą tej metody i niczego więcej.
   */
  loseFight(hero, winner) {
    this.stats.fightsLost++;
    const entry = this.levels.get(hero.depth);
    for (const it of [...hero.inventory]) {
      it.x = hero.x; it.y = hero.y;
      entry.items.push(it);
    }
    const ile = hero.inventory.length;
    hero.inventory = [];
    hero.weapon = null;
    hero.armor = null;
    hero.hasAmulet = false;
    hero.hp = Math.max(1, Math.floor(hero.maxHp * 0.25));
    hero.lastHitBy = null;
    hero.deathCause = null;
    this.tell(hero, `${cap(winner.name)} kładzie Cię na deski. Gubisz dobytek (${ile}) i uciekasz w górę.`);
    this.tell(winner, `${cap(hero.name)} pada bez czucia. Dobytek zostaje na ziemi.`);
    this.placeHero(hero, Math.max(1, hero.depth - 1), 'up');
  }

  tryMove(dx, dy) {
    const nx = this.player.x + dx, ny = this.player.y + dy;
    const L = this.level;
    if (!L.inBounds(nx, ny)) return false;
    const m = this.monsterAt(nx, ny);
    if (m) { this.attack(this.player, m); return true; }
    // wejście na innego uczestnika to cios, tak samo jak wejście na potwora
    const other = this.heroAt(nx, ny, this.player.depth, this.player);
    if (other) { this.attack(this.player, other); return true; }
    if (!L.isWalkable(nx, ny)) return false;
    // zakaz ścinania rogów - ta sama reguła co w szukaniu drogi
    if (dx !== 0 && dy !== 0 && (!L.isWalkable(this.player.x + dx, this.player.y) || !L.isWalkable(this.player.x, this.player.y + dy))) return false;
    this.player.x = nx; this.player.y = ny;
    const it = this.itemAt(nx, ny);
    if (it) this.message(`Leży tu ${itemLabel(it, this.appearances, this.identified, this.sniffed)}.`);
    const t = L.at(nx, ny);
    if (t === STAIRS_DOWN) this.message('Są tu schody w dół (>).');
    if (t === STAIRS_UP) this.message('Są tu schody w górę (<).');
    return true;
  }

  /**
   * Cios. Napastnikiem i celem może być uczestnik ALBO potwór - obrażenia liczą
   * się na tych samych zasadach, więc gracz kontra gracz nie jest osobną
   * mechaniką, tylko tym samym ciosem skierowanym w kogoś innego.
   *
   * Kolejność losowań (kość obrażeń, potem redukcja) jest nietykalna: od niej
   * zależy, czy partia jednoosobowa z danego ziarna przebiega jak przed zmianą.
   */
  attack(attacker, defender) {
    const aHero = this.isHero(attacker);
    const dHero = this.isHero(defender);
    const atkPower = aHero ? this.playerAttack(attacker) : attacker.str;
    const defPower = dHero ? this.playerDefense(defender) : defender.def;
    const raw = this.rng.dice(1, Math.max(1, atkPower));
    const mitigation = this.rng.int(defPower + 1);
    const dmg = Math.max(0, raw - mitigation);

    if (dmg <= 0) {
      if (aHero) this.tell(attacker, `Chybiasz - ${defender.name} unika ciosu.`);
      if (dHero) this.tell(defender, `${cap(attacker.name)} chybia.`);
      return;
    }

    defender.hp -= dmg;
    if (aHero && dHero) this.stats.pvpHits++;
    if (aHero) this.tell(attacker, `Trafiasz ${defender.name} (${dmg}).`);
    if (dHero) {
      defender.deathCause = `zabity przez: ${attacker.name}`;
      defender.lastHitBy = attacker;
      this.tell(defender, `${cap(attacker.name)} trafia Ciebie (${dmg}).`);
    } else if (defender.hp <= 0) {
      this.killMonster(defender, aHero ? attacker : null);
    }
  }

  killMonster(m, killer = this.player) {
    const depth = killer ? killer.depth : this.depth;
    const entry = this.levels.get(depth);
    this.tell(killer, `${cap(m.name)} pada.`);
    if (killer) {
      killer.kills++;
      this.gainXp(killer, m.xp);
    }
    const idx = entry.monsters.indexOf(m);
    if (idx >= 0) entry.monsters.splice(idx, 1);
    if (m.boss) {
      const amulet = makeAmulet();
      amulet.id = this.newId();
      amulet.x = m.x; amulet.y = m.y;
      entry.items.push(amulet);
      this.tell(killer, 'Z ciała wypada Amulet Otchłani! Zabierz go na powierzchnię.');
    }
  }

  gainXp(hero, amount) {
    hero.xp += amount;
    while (hero.xp >= xpForLevel(hero.level + 1)) {
      hero.level++;
      hero.maxHp += 10;
      hero.hp += 10;
      hero.str += 1;
      if (hero.level % 2 === 0) hero.def += 1;
      this.tell(hero, `Awansujesz na poziom ${hero.level}!`);
    }
  }

  pickUp() {
    const it = this.itemAt(this.player.x, this.player.y);
    if (!it) { this.message('Nie ma tu nic do podniesienia.'); return false; }
    if (this.player.inventory.length >= INVENTORY_LIMIT) {
      this.message('Nie udźwigniesz więcej.');
      return false;
    }
    this.items.splice(this.items.indexOf(it), 1);
    delete it.x; delete it.y;
    this.player.inventory.push(it);
    if (it.kind === 'amulet') {
      this.player.hasAmulet = true;
      this.message('Bierzesz Amulet Otchłani. Wracaj na powierzchnię!');
    } else {
      this.message(`Podnosisz: ${itemLabel(it, this.appearances, this.identified, this.sniffed)}.`);
    }
    return true;
  }

  dropItem(index) {
    const it = this.player.inventory[index];
    if (!it) return false;
    // Przedmioty wolno układać w stos. Zakaz odkładania na zajęte pole wyglądał
    // na porządkujący, a w praktyce czynił grę nieukończalną: z pełnym plecakiem
    // stojąc na Amulecie nie dało się zrobić NICZEGO - ani podnieść, ani odłożyć.
    this.player.inventory.splice(index, 1);
    if (this.player.weapon === it) this.player.weapon = null;
    if (this.player.armor === it) this.player.armor = null;
    if (it.kind === 'amulet') this.player.hasAmulet = false;
    it.x = this.player.x; it.y = this.player.y;
    this.items.push(it);
    this.message(`Odkładasz: ${itemLabel(it, this.appearances, this.identified, this.sniffed)}.`);
    return true;
  }

  identify(item) { this.identified.add(`${item.kind}:${item.type}`); }

  /**
   * Powąchanie mikstury. Kosztuje turę, nie kosztuje życia, i NIGDY nie wskazuje
   * jednego rodzaju samodzielnie - podaje parę, do której mikstura należy.
   *
   * Jedyny wyjątek to wykluczenie: jeśli drugi rodzaj z pary jest już rozpoznany,
   * zapach rozstrzyga na pewno. Ten rachunek robi gra, bo gracz i tak umiałby go
   * zrobić na kartce, a kartka nie jest mechaniką.
   */
  sniff(index) {
    const it = this.player.inventory[index];
    if (!it) return false;
    if (it.kind !== 'potion') {
      this.message(`${itemLabel(it, this.appearances, this.identified, this.sniffed)} niczym nie pachnie.`);
      return false;
    }
    const key = `potion:${it.type}`;
    if (this.identified.has(key)) {
      this.message(`Wiesz już, co to: ${it.name}.`);
      return false;
    }
    const scent = SCENTS[POTION_SCENT[it.type]];
    const look = `${this.appearances.potion[it.type]} mikstura`;
    if (this.sniffed.has(key)) {
      this.message(`${look} - już wiesz: zapach ${scent.short}.`);
      return false;
    }

    this.sniffed.add(key);
    const para = scentGroup(scent.key);
    const nieznane = para.filter(p => !this.identified.has(`potion:${p.type}`));
    if (nieznane.length === 1) {
      // Drugi rodzaj z pary jest już rozpoznany, więc zostaje tylko jeden.
      this.identify(it);
      this.message(`Zapach ${scent.full}. Znasz już drugą taką - to ${it.name}.`);
    } else {
      const nazwy = para.map(p => p.name).join(' albo ');
      this.message(`Zapach ${scent.full}. Tak pachnie ${nazwy}.`);
    }
    return true;
  }

  useItem(index) {
    const it = this.player.inventory[index];
    if (!it) return false;
    switch (it.kind) {
      case 'potion': return this.quaff(it, index);
      case 'scroll': return this.read(it, index);
      case 'food': {
        this.player.hunger = Math.min(HUNGER_MAX, this.player.hunger + it.nutrition);
        this.player.inventory.splice(index, 1);
        this.message(`Zjadasz: ${it.name}.`);
        return true;
      }
      case 'weapon': {
        this.player.weapon = this.player.weapon === it ? null : it;
        this.message(this.player.weapon ? `Dobywasz: ${itemLabel(it, this.appearances, this.identified, this.sniffed)}.` : 'Chowasz broń.');
        return true;
      }
      case 'armor': {
        this.player.armor = this.player.armor === it ? null : it;
        this.message(this.player.armor ? `Zakładasz: ${itemLabel(it, this.appearances, this.identified, this.sniffed)}.` : 'Zdejmujesz pancerz.');
        return true;
      }
      case 'amulet':
        this.message('Amulet ciąży w dłoni. Musisz wynieść go na powierzchnię.');
        return false;
      default: return false;
    }
  }

  quaff(it, index) {
    this.player.inventory.splice(index, 1);
    this.identify(it);
    switch (it.type) {
      case 'heal':
      case 'greaterHeal': {
        const before = this.player.hp;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + it_power(it));
        this.message(`Pijesz ${it.name}. Odzyskujesz ${this.player.hp - before} życia.`);
        break;
      }
      case 'strength':
        this.player.str += 1;
        this.message('Czujesz przypływ siły.');
        break;
      case 'poison': {
        const d = 8;
        this.player.hp -= d;
        this.deathCause = 'zatrucie';
        this.message(`Mikstura parzy gardło! Tracisz ${d} życia.`);
        break;
      }
      default: this.message('Nic się nie dzieje.');
    }
    return true;
  }

  read(it, index) {
    this.player.inventory.splice(index, 1);
    this.identify(it);
    const L = this.level;
    switch (it.type) {
      case 'identify': {
        // Rozpoznaje RODZAJ, nie sztukę - więc obejmuje też te same mikstury
        // leżące na podłodze i znalezione później.
        const nieznane = this.player.inventory.filter(
          x => (x.kind === 'potion' || x.kind === 'scroll') && !this.identified.has(`${x.kind}:${x.type}`));
        if (!nieznane.length) {
          this.message('Zwój rozpoznania - ale w plecaku nie ma już żadnej zagadki.');
          break;
        }
        for (const x of nieznane) this.identify(x);
        const lista = nieznane.map(x => x.name).join(', ');
        this.message(`Wiedza spływa na Ciebie. Rozpoznajesz: ${lista}.`);
        break;
      }
      case 'magicMap': {
        this.memoryOf(this.player).fill(1);
        this.message('Mapa lochu rozjaśnia się w Twojej głowie.');
        break;
      }
      case 'teleport': {
        const p = this.freeTile(L, this.monsters, this.items);
        if (p) { this.player.x = p.x; this.player.y = p.y; this.message('Świat wiruje - jesteś gdzie indziej.'); }
        else this.message('Nic się nie dzieje.');
        break;
      }
      case 'enchantWeapon':
        if (this.player.weapon) { this.player.weapon.enchant = (this.player.weapon.enchant || 0) + 1; this.message('Twoja broń lśni ostrzej.'); }
        else this.message('Nie masz dobytej broni.');
        break;
      case 'enchantArmor':
        if (this.player.armor) { this.player.armor.enchant = (this.player.armor.enchant || 0) + 1; this.message('Twój pancerz twardnieje.'); }
        else this.message('Nie masz założonego pancerza.');
        break;
      default: this.message('Litery rozmywają się w nic.');
    }
    return true;
  }

  descend() {
    if (this.level.at(this.player.x, this.player.y) !== STAIRS_DOWN) {
      this.message('Nie ma tu schodów w dół.');
      return false;
    }
    this.enterLevel(this.depth + 1, 'down');
    this.message(`Schodzisz na poziom ${this.depth}.`);
    return true;
  }

  ascend() {
    if (this.level.at(this.player.x, this.player.y) !== STAIRS_UP) {
      this.message('Nie ma tu schodów w górę.');
      return false;
    }
    if (this.depth === 1) {
      if (this.player.hasAmulet) { this.win(this.player); return true; }
      this.message('Nie wrócisz z pustymi rękami. Amulet czeka w głębi.');
      return false;
    }
    this.enterLevel(this.depth - 1, 'up');
    this.message(`Wracasz na poziom ${this.depth}.`);
    return true;
  }

  // ---------- świat odpowiada ----------

  monstersActOn(depth, cele = this.heroesOn(depth)) {
    const entry = this.levels.get(depth);
    if (!entry) return;
    const L = entry.level;
    const lista = entry.monsters;
    // Cele w stałej kolejności tablicy uczestników. Pole odległości ma WIELE
    // źródeł, więc każdy potwór schodzi w dół w stronę najbliższego z nich -
    // jeden przebieg na poziom, nie jeden na potwora.
    if (!cele.length) return;

    const awake = lista.filter(m => !m.asleep && m.hp > 0);

    // budzenie: FOV jest symetryczny, więc "gracz widzi potwora" znaczy też
    // "potwór widzi gracza" - nie trzeba liczyć pola widzenia każdemu z osobna
    for (const m of lista) {
      if (!m.asleep) continue;
      const widziany = cele.some(h => chebyshev(m.x, m.y, h.x, h.y) <= FOV_RADIUS && h.visible.has(`${m.x},${m.y}`));
      if (widziany && this.rng.chance(0.55)) {
        m.asleep = false;
        awake.push(m);
      } else if (cele.some(h => chebyshev(m.x, m.y, h.x, h.y) <= 1)) {
        m.asleep = false;
        awake.push(m);
      }
    }
    if (awake.length === 0) return;

    const passable = (x, y) => L.isWalkable(x, y);
    const field = distanceField(cele.map(h => ({ x: h.x, y: h.y })), passable, { limit: 40 });

    for (const m of awake) {
      if (m.hp <= 0) continue;
      if (m.regen && m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + m.regen);

      const sasiad = cele.find(h => chebyshev(m.x, m.y, h.x, h.y) === 1);
      if (sasiad) {
        this.attack(m, sasiad);
        continue;
      }
      if (m.erratic && this.rng.chance(0.4)) {
        const opts = neighbors(m.x, m.y, passable).filter(([nx, ny]) => !this.monsterOn(depth, nx, ny) && !this.heroAt(nx, ny, depth));
        if (opts.length) { const [nx, ny] = this.rng.pick(opts); m.x = nx; m.y = ny; }
        continue;
      }

      const myD = field.get(`${m.x},${m.y}`);
      if (myD === undefined) continue; // gracz nieosiągalny - potwór czeka
      let best = null, bestD = myD;
      for (const [nx, ny] of neighbors(m.x, m.y, passable)) {
        const d = field.get(`${nx},${ny}`);
        if (d === undefined || d >= bestD) continue;
        if (this.monsterOn(depth, nx, ny)) continue;
        if (this.heroAt(nx, ny, depth)) continue;
        bestD = d; best = [nx, ny];
      }
      if (best) { m.x = best[0]; m.y = best[1]; }
    }
  }

  /** Zgodność w tył dla wywołań z zewnątrz silnika. */
  monstersAct() { this.monstersActOn(this.depth); }

  /** Powolna regeneracja życia. Bez niej partia jest ciągiem strat bez odbicia
   *  i nie da się jej wygrać niezależnie od umiejętności - patrz D-005. */
  tickRegen(hero = this.player) {
    const p = hero;
    if (p.hp <= 0 || p.hp >= p.maxHp) return;
    if (p.hunger <= 0) return; // głodujący się nie regeneruje
    const interval = Math.max(8, 24 - p.level);
    if (this.turn % interval === 0) p.hp = Math.min(p.maxHp, p.hp + 1);
  }

  tickHunger(hero = this.player) {
    hero.hunger--;
    if (hero.hunger === 200) this.tell(hero, 'Robisz się głodny.');
    if (hero.hunger === 50) this.tell(hero, 'Jesteś bardzo głodny!');
    if (hero.hunger <= 0) {
      hero.hunger = 0;
      if (this.turn % 3 === 0) {
        hero.hp -= 1;
        hero.deathCause = 'głód';
        hero.lastHitBy = null;   // głód nie jest przegranym starciem
        if (this.turn % 15 === 0) this.tell(hero, 'Umierasz z głodu...');
      }
    }
  }

  die(hero = this.player, cause = 'rany') {
    hero.status = 'dead';
    hero.cause = cause;
    this.tell(hero, `Ginisz. Przyczyna: ${cause}.`);
  }

  win(hero = this.player) {
    hero.status = 'won';
    hero.cause = 'wyniesiono Amulet Otchłani';
    this.tell(hero, 'Wychodzisz na światło dnia z Amuletem Otchłani. ZWYCIĘSTWO!');
  }

  score() {
    return this.player.xp + this.player.kills * 5 + this.depth * 25 + (this.player.hasAmulet ? 1000 : 0) + (this.status === 'won' ? 2000 : 0);
  }

  // ---------- zapis ----------

  toJSON() {
    const levels = {};
    for (const [d, entry] of this.levels) {
      levels[d] = {
        level: entry.level.toJSON(),
        monsters: entry.monsters,
        items: entry.items,
      };
    }
    return {
      format: 2,
      seed: this.seed,
      rng: this.rng.getState(),
      idCounter: this._idCounter,
      maxDepth: this.maxDepth,
      width: this.width, height: this.height,
      appearances: this.appearances,
      turn: this.turn,
      active: this.active,
      heroes: this.heroes.map(h => heroToJSON(h)),
      levels,
    };
  }

  static fromJSON(data) {
    if (!data) throw new Error('Nieznany format zapisu');
    // Format 1 to zapisy sprzed wprowadzenia wielu uczestników. Mają się
    // wczytywać - w przeglądarce leżą w autozapisie prawdziwych rozgrywek.
    if (data.format === 1) data = przepiszFormat1(data);
    if (data.format !== 2) throw new Error('Nieznany format zapisu');

    const g = new Game(data.seed, { deferStart: true, maxDepth: data.maxDepth, w: data.width, h: data.height });
    g.rng.setState(data.rng);
    g._idCounter = data.idCounter;
    g.appearances = data.appearances;
    g.turn = data.turn;

    g.levels = new Map();
    for (const [d, e] of Object.entries(data.levels)) {
      g.levels.set(Number(d), {
        level: Level.fromJSON(e.level),
        monsters: e.monsters,
        items: e.items,
      });
    }

    g.heroes = data.heroes.map((h, i) => heroFromJSON(h, i));
    g.active = data.active ?? 0;
    // Pole widzenia nie jest zapisywane - liczy się od nowa, każdemu z osobna.
    for (const h of g.heroes) g.updateFOV(h);
    return g;
  }
}

/** Uczestnik do zapisu. Zbiory i mapy nie przechodzą przez JSON same z siebie. */
function heroToJSON(h) {
  const memory = {};
  for (const [d, m] of h.memory) memory[d] = bytesToBase64(m);
  return {
    hid: h.hid,
    name: h.name,
    x: h.x, y: h.y,
    hp: h.hp, maxHp: h.maxHp,
    str: h.str, def: h.def,
    level: h.level, xp: h.xp,
    hunger: h.hunger,
    inventory: h.inventory,
    weapon: h.weapon ? h.weapon.id : null,
    armor: h.armor ? h.armor.id : null,
    hasAmulet: h.hasAmulet,
    kills: h.kills,
    depth: h.depth,
    memory,
    identified: [...h.identified],
    sniffed: [...h.sniffed],
    status: h.status,
    cause: h.cause ?? null,
    deathCause: h.deathCause ?? null,
  };
}

function heroFromJSON(h, index) {
  const hero = {
    ...h,
    hid: h.hid ?? index,
    memory: new Map(),
    visible: new Set(),
    messages: h.messages ?? [],
    identified: new Set(h.identified || []),
    sniffed: new Set(h.sniffed || []),
    cause: h.cause ?? null,
    deathCause: h.deathCause ?? null,
  };
  for (const [d, b64] of Object.entries(h.memory || {})) hero.memory.set(Number(d), base64ToBytes(b64));
  hero.inventory = h.inventory || [];
  hero.weapon = hero.inventory.find(i => i.id === h.weapon) || null;
  hero.armor = hero.inventory.find(i => i.id === h.armor) || null;
  return hero;
}

/**
 * Zapis jednoosobowy w starym kształcie na nowy. Stary format trzymał pamięć
 * terenu w POZIOMIE, a wiedzę i dziennik w grze - jedno i drugie należy teraz
 * do uczestnika, więc przy wczytaniu trafia tam, gdzie jest jego miejsce.
 */
function przepiszFormat1(d) {
  const memory = {};
  const levels = {};
  for (const [depth, e] of Object.entries(d.levels)) {
    levels[depth] = { level: e.level, monsters: e.monsters, items: e.items };
    if (e.memory) memory[depth] = e.memory;
  }
  return {
    format: 2,
    seed: d.seed, rng: d.rng, idCounter: d.idCounter,
    maxDepth: d.maxDepth, width: d.width, height: d.height,
    appearances: d.appearances,
    turn: d.turn,
    active: 0,
    levels,
    heroes: [{
      ...d.player,
      hid: 0,
      name: 'Ty',
      depth: d.depth,
      memory,
      messages: d.messages || [],
      identified: d.identified || [],
      sniffed: d.sniffed || [],
      status: d.status,
      cause: d.cause ?? null,
      deathCause: d.deathCause ?? null,
    }],
  };
}

function it_power(it) { return it.type === 'greaterHeal' ? 30 : 12; }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
