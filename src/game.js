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
import { randomItem, makeAmulet, makeAppearances, itemLabel, potionPower, SCENTS, POTION_SCENT, scentGroup } from './items.js';
import { PLECAK_START, dolozDoPlecaka, przepakuj, zmiesciSie, poloz, mozna, ile as sztuk, poleRzeczy, wolnePola, pojemnosc } from './plecak.js';
import { obejrzyj as obejrzyjRzecz } from './ocena.js';
import { HUNGER_START, HUNGER_MAX, stopienGlodu } from './stany.js';
import { spawnMonster, spawnBoss } from './monsters.js';
import { bytesToBase64, base64ToBytes } from './bytes.js';

export const MAX_DEPTH = 8;
export const FOV_RADIUS = 8;
export { HUNGER_START, HUNGER_MAX } from './stany.js';

const PLAYER_START = { hp: 30, str: 6, def: 2 };

/**
 * Powierzchnia mapy, pod którą strojono równowagę gry jednoosobowej.
 * Liczba potworów i przedmiotów na poziomie jest do niej ODNOSZONA, a nie stała:
 * ta sama garść przeciwników rozsypana po mapie dwa i pół raza większej daje
 * poziom, po którym da się przejść od schodów do schodów i nie spotkać nikogo.
 * Przy rozmiarze domyślnym mnożnik wynosi dokładnie 1, więc partia jednoosobowa
 * przebiega jak przed tą zmianą - i to jest dowód, że równowaga się nie ruszyła.
 */
const POWIERZCHNIA_WZORCOWA = 76 * 20;

/** Co ile tur stół zagląda, czy poziomy nie zrobiły się martwe. */
const ODNOWA_CO_TUR = 40;

/**
 * Ile razy pod rząd wolno cofać się przed innym uczestnikiem, zanim zabraknie tchu.
 *
 * Bez tego progu pościg między dwoma uczestnikami o tej samej szybkości nie ma
 * końca: ruchy rozstrzygają się jednocześnie, więc uciekający utrzymuje odstęp
 * w nieskończoność i starcie nigdy nie następuje. Zgłoszenie właściciela:
 * „jeżeli on nie chce walczyć, to nie ma sposobu, żeby z nim walczyć".
 */
export const PROG_ZMECZENIA = 6;

/**
 * Zwrot sił za zabicie przeciwnika. Jedno źródło dla silnika i dla księgi zasad -
 * księga liczy z tej funkcji, więc nie da się jej rozjechać z grą (D-021).
 */
export const ZWROT_DZIELNIK = 5;
export const ZWROT_MIN = 2;

/**
 * O ile wolniej życie odnawia się SAMO, odkąd odnawia je walka.
 *
 * To jest cena nagrody za zabicie, ustalona pomiarem, a nie wyczuciem. Sama
 * nagroda (bez tego mnożnika) podniosła udział zwycięstw gracza automatycznego
 * z 29,5% na 59,0% na dwustu partiach - czyli po cichu zrobiła grę łatwiejszą,
 * o co nikt nie prosił. Przy mnożniku 3 udział wraca do 37,0%, więc zmiana jest
 * PRZESUNIĘCIEM źródła leczenia z czekania na walkę, a nie ułatwieniem.
 * Zmierzone warianty: 2x -> 45,5%, 3x -> 37,0%, 4x -> 30,5%.
 */
export const REGEN_MNOZNIK = 3;
export function zwrotZaZabicie(maxHp) {
  return Math.max(ZWROT_MIN, Math.round(maxHp / ZWROT_DZIELNIK));
}

/** Próg doświadczenia potrzebny do osiągnięcia danego poziomu postaci. */
export function xpForLevel(n) { return Math.floor(10 * Math.pow(n - 1, 1.85)); }

export class Game {
  constructor(seed = 'los', opts = {}) {
    this.seed = seed;
    this.rng = new RNG(seed);
    this.maxDepth = opts.maxDepth ?? MAX_DEPTH;
    this.width = opts.w ?? 76;
    this.height = opts.h ?? 20;
    // Odnawianie lochu jest WYŁĄCZONE domyślnie. Partia jednoosobowa ma być
    // skończonym zadaniem: poziom ogołocony jest tam wynikiem gry, nie usterką,
    // a dosypywanie potworów przesunęłoby zmierzoną równowagę. Stół wieloosobowy
    // włącza je, bo tam ten sam loch żyje godzinami i kilku uczestników ogołaca
    // go szybciej, niż nowy zdąży wejść.
    this.odnawianie = !!opts.odnawianie;
    this.ostatniaOdnowa = 0;
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
      plecak: { ...PLECAK_START },
      weapon: null, armor: null,
      hasAmulet: false,
      kills: 0,
      zmeczenie: 0,       // ile razy pod rząd cofał się przed innym uczestnikiem
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

  /**
   * Mnożnik zaludnienia: ile razy ta mapa jest większa od wzorcowej.
   * Przy rozmiarze domyślnym daje 1, więc stare liczby zostają nietknięte.
   */
  get gestosc() { return (this.width * this.height) / POWIERZCHNIA_WZORCOWA; }

  /** Docelowa liczba potworów na poziomie tej głębokości. */
  ilePotworow(depth) { return Math.max(1, Math.round((4 + depth) * this.gestosc)); }

  /** Docelowa liczba przedmiotów, bez losowej dosypki. */
  ilePrzedmiotow(depth) { return Math.max(1, Math.round((3 + Math.floor(depth / 2)) * this.gestosc)); }

  buildLevel(depth) {
    const level = generateLevel(this.rng, { w: this.width, h: this.height, depth });
    const monsters = [];
    const items = [];

    const count = this.ilePotworow(depth);
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

    const itemCount = this.ilePrzedmiotow(depth) + this.rng.int(3);
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
  /** Wszystko, co leży na jednym kaflu. Rzeczy wolno układać w stos (D-016). */
  itemsAt(x, y) { return this.items.filter(i => i.x === x && i.y === y); }

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

    // Stan PRZED działaniami: kogo każdy widzi i kto z kim stoi twarzą w twarz.
    // Odczyt musi być zrobiony teraz, bo po ruchach nie da się już odróżnić
    // „odskoczył" od „nigdy nie stał obok".
    const kontakty = new Map();
    const sasiedztwoPrzed = new Map();
    for (const h of uczestnicy) {
      const k = this.contacts(h);
      kontakty.set(h.hid, k);
      sasiedztwoPrzed.set(h.hid, k.filter(o => chebyshev(h.x, h.y, o.x, o.y) === 1));
    }

    const spent = new Map();
    const cofnal = new Set();
    for (const hero of uczestnicy) {
      let a = actions.get(hero.hid) ?? { type: 'wait' };
      if (kontakty.get(hero.hid).length && this.czyOdwrot(hero, kontakty.get(hero.hid), a)) {
        if ((hero.zmeczenie || 0) >= PROG_ZMECZENIA) {
          hero.zmeczenie = 0;
          this.tell(hero, 'Brakuje Ci tchu - stajesz, żeby zaczerpnąć powietrza.');
          a = { type: 'wait' };
        } else {
          cofnal.add(hero.hid);
        }
      }
      spent.set(hero.hid, this.applyAction(hero, a));
    }

    // Zmęczenie rośnie tylko od cofania się i schodzi, gdy uczestnik stanie
    // albo natrze. Dzięki temu ostrożne podejście nie jest karane, a ucieczka
    // bez końca przestaje być możliwa - i to symetrycznie dla obu stron.
    for (const h of uczestnicy) {
      h.zmeczenie = cofnal.has(h.hid)
        ? Math.min(PROG_ZMECZENIA, (h.zmeczenie || 0) + 1)
        : Math.max(0, (h.zmeczenie || 0) - 1);
    }

    this.ciosyWOdwrocie(uczestnicy, sasiedztwoPrzed, cofnal);
    this.turn++;
    this.worldTurn(uczestnicy);
    return spent;
  }

  /**
   * Czy to działanie jest cofnięciem się przed kimś, kogo uczestnik widzi.
   *
   * Sądzone po JEGO kroku wobec położeń sprzed tury, a nie po odległości
   * końcowej: przy jednoczesnym rozstrzyganiu obie strony ruszają się naraz,
   * więc odległość końcowa mówi o obu decyzjach, a nas interesuje ta jedna.
   */
  czyOdwrot(hero, kontakt, action) {
    if (!action || action.type !== 'move') return false;
    const teraz = Math.min(...kontakt.map(o => chebyshev(hero.x, hero.y, o.x, o.y)));
    const potem = Math.min(...kontakt.map(o =>
      chebyshev(hero.x + action.dx, hero.y + action.dy, o.x, o.y)));
    return potem > teraz;
  }

  /**
   * Cios w odwrocie: kto stał twarzą w twarz i odskoczył, dostaje w plecy od
   * tego, kto został. Obopólne rozejście jest darmowe - kara jest za wyjście
   * ze starcia, którego druga strona nie przerywa.
   *
   * Obrażenia są POŁOWICZNE. Pełny cios darmowy zamieniłby każde spotkanie
   * w zakład o to, kto pierwszy odskoczy, a to jest dokładnie ten „bęcek bez
   * możliwości wycofania się", którego zakazuje D-023.
   */
  ciosyWOdwrocie(uczestnicy, sasiedztwoPrzed, cofnal) {
    for (const h of uczestnicy) {
      if (!cofnal.has(h.hid) || h.status !== 'playing') continue;
      for (const o of sasiedztwoPrzed.get(h.hid)) {
        if (o.status !== 'playing' || o.depth !== h.depth) continue;
        if (cofnal.has(o.hid)) continue;              // rozeszli się obopólnie
        if (chebyshev(h.x, h.y, o.x, o.y) === 1) continue;   // odstęp się nie otworzył
        this.attack(o, h, { okazja: true });
      }
    }
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
        case 'pickup': return this.pickUp(action.ids || null);
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
    // Potwory ruszają się w turze TYCH, przy których stoją - a nie przy każdym
    // działaniu kogokolwiek na piętrze. Bez tego ograniczenia świat chodzi tyle
    // razy na jedną turę gracza, ilu bohaterów jest na poziomie: przy czterech
    // botach szczur obok człowieka dostawał pięć ruchów na jego jeden, co z
    // fotela gracza wygląda jak walka w czasie rzeczywistym w środku tury
    // wspólnej. Zawężenie działa WYŁĄCZNIE tam, gdzie na piętrze jest więcej
    // niż jeden bohater, więc gra jednoosobowa ma dokładnie dawne zachowanie.
    for (const [d, cele] of poziomy) {
      const ilu = this.heroes.filter(h => h.status === 'playing' && h.depth === d).length;
      this.monstersActOn(d, cele, ilu > 1 ? { zasieg: FOV_RADIUS + 2 } : {});
    }

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
    if (this.odnawianie) this.odnowLoch();
  }

  /**
   * Odnawianie lochu na stole, który żyje godzinami.
   *
   * Zmierzone na czterech botach i mapie 120x32: poziom pierwszy miał ZERO
   * potworów i ZERO przedmiotów już w turze 1891 i tak zostawał do końca
   * partii. Człowiek wchodzący później dostawał martwy loch - dokładnie to
   * zgłosił właściciel („przeszedłem cały poziom i spotkałem jednego goblina").
   *
   * Dwie reguły, które trzymają to po stronie uczciwej:
   *  - nic nie wyrasta w POLU WIDZENIA ani w jego pobliżu, więc gracz nigdy nie
   *    widzi potwora pojawiającego się z powietrza;
   *  - odnawianie tylko UZUPEŁNIA do liczby, którą poziom miał na starcie, więc
   *    nie da się nim zrobić poziomu gęstszego niż zamierzony.
   */
  odnowLoch() {
    if (this.turn - this.ostatniaOdnowa < ODNOWA_CO_TUR) return;
    this.ostatniaOdnowa = this.turn;
    for (const [depth, entry] of this.levels) {
      const zywe = entry.monsters.filter(m => m.hp > 0);
      if (zywe.length < this.ilePotworow(depth)) {
        const p = this.wolnePoleWCiemnosci(depth, entry);
        if (p) {
          const m = spawnMonster(this.rng, depth, p.x, p.y);
          m.id = this.newId();
          entry.monsters.push(m);
        }
      }
      if (entry.items.length < this.ilePrzedmiotow(depth) && this.rng.int(3) === 0) {
        const p = this.wolnePoleWCiemnosci(depth, entry);
        if (p) {
          const it = randomItem(this.rng, depth);
          it.id = this.newId();
          it.x = p.x; it.y = p.y;
          entry.items.push(it);
        }
      }
    }
  }

  /** Wolne pole podłogi, którego NIKT z obecnych na poziomie nie widzi ani nie ma blisko. */
  wolnePoleWCiemnosci(depth, entry) {
    const obecni = this.heroes.filter(h => h.status === 'playing' && h.depth === depth);
    for (let tries = 0; tries < 200; tries++) {
      const p = this.freeTile(entry.level, entry.monsters, entry.items);
      if (!p) return null;
      if (obecni.some(h => h.visible.has(`${p.x},${p.y}`)
        || chebyshev(h.x, h.y, p.x, p.y) <= FOV_RADIUS + 2)) continue;
      return p;
    }
    return null;
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
      delete it.px; delete it.py;
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
    // Ślad, po którym interfejs pozna, że to się właśnie stało. Trzy znikające
    // linijki dziennika to za mało na utratę CAŁEGO dobytku i skok o piętro:
    // właściciel zgłosił to jako „glitch, przeniosło mnie i wyczyściło plecak",
    // bo z ekranu nie dało się odczytać, co zaszło (W-26).
    hero.przegranaTura = this.turn;
    hero.przegrana = { kto: winner.name, ile, zPietra: hero.depth, naPietro: Math.max(1, hero.depth - 1) };
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
  attack(attacker, defender, { okazja = false } = {}) {
    const aHero = this.isHero(attacker);
    const dHero = this.isHero(defender);
    const atkPower = aHero ? this.playerAttack(attacker) : attacker.str;
    const defPower = dHero ? this.playerDefense(defender) : defender.def;
    const raw = this.rng.dice(1, Math.max(1, atkPower));
    const mitigation = this.rng.int(defPower + 1);
    const pelne = Math.max(0, raw - mitigation);
    const dmg = okazja ? Math.floor(pelne / 2) : pelne;

    if (dmg <= 0) {
      if (okazja) {
        if (aHero) this.tell(attacker, `${cap(defender.name)} odskakuje - nie dosięgasz.`);
        if (dHero) this.tell(defender, `Odskakujesz i ${attacker.name} nie dosięga.`);
        return;
      }
      if (aHero) this.tell(attacker, `Chybiasz - ${defender.name} unika ciosu.`);
      if (dHero) this.tell(defender, `${cap(attacker.name)} chybia.`);
      return;
    }

    defender.hp -= dmg;
    if (aHero && dHero) this.stats.pvpHits++;
    if (okazja) {
      if (aHero) this.tell(attacker, `${cap(defender.name)} odskakuje - trafiasz w odwrocie (${dmg}).`);
      if (dHero) {
        defender.deathCause = `zabity przez: ${attacker.name}`;
        defender.lastHitBy = attacker;
        this.tell(defender, `Odskakujesz, ale ${attacker.name} trafia Cię w odwrocie (${dmg}).`);
      }
      return;
    }
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
      this.lupSil(killer, m);
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

  /**
   * Zwrot sił za zabicie. Zgłoszenie właściciela: „w przeciwnym razie jedynym
   * rozsądnym rozwiązaniem po spotkaniu takiego przeciwnika jest ominięcie go
   * jak najszerszym łukiem" - czyli walka, będąca sednem gry, była decyzją
   * ekonomicznie błędną wszędzie poza koniecznością.
   *
   * Zwrot rośnie z siłą przeciwnika, ale ma dolną granicę, żeby szczur też był
   * wart ciosu. NIGDY nie podnosi życia powyżej pełni - inaczej wystarczyłoby
   * stać w drzwiach i zbierać drobnicę, żeby nadrobić dowolne obrażenia.
   */
  lupSil(hero, m) {
    if (hero.hp >= hero.maxHp) return 0;
    const ile = Math.min(zwrotZaZabicie(m.maxHp), hero.maxHp - hero.hp);
    hero.hp += ile;
    this.tell(hero, `Bierzesz oddech po walce (+${ile}).`);
    return ile;
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

  /** Etykieta widziana przez CZYNNEGO uczestnika - to ona rozstrzyga o stosach. */
  etykieta(it) { return itemLabel(it, this.appearances, this.identified, this.sniffed); }

  /**
   * Przełożenie rzeczy w plecaku. NIE jest działaniem w grze: nie kosztuje tury,
   * nie rusza świata i nie przechodzi przez turę wspólną. Porządkowanie plecaka
   * nie może dawać przewagi ani jej odbierać - dlatego stoi obok tury, a nie w niej.
   */
  przelozWPlecaku(hero, index, x, y, obrot = 0) {
    const it = hero.inventory[index];
    if (!it) return false;
    const stare = { px: it.px, py: it.py, obrot: it.obrot };
    if (!mozna(hero, it, x, y, obrot ? 1 : 0, it)) return false;
    if (!poloz(hero, it, x, y, obrot ? 1 : 0)) { Object.assign(it, stare); return false; }
    return true;
  }

  /** Czy rzecz zmieści się w plecaku czynnego uczestnika. */
  czyZmiesci(it, hero = this.player) { return zmiesciSie(hero, it, (x) => this.etykieta(x)); }

  /**
   * Obejrzenie rzeczy. DARMOWE - nie kosztuje tury i nie rusza świata, bo
   * przyjrzenie się czemuś leżącemu pod nogami nie jest działaniem, tylko
   * odczytaniem tego, co gracz i tak ma przed oczami. Nie rozpoznaje przy tym
   * rodzaju mikstury ani zwoju: patrz `src/ocena.js`.
   */
  obejrzyj(it, hero = this.player) {
    if (!it) return null;
    return obejrzyjRzecz(it, hero, this.identified, (x) => this.etykieta(x));
  }

  /** Rzecz leżąca pod nogami uczestnika. */
  podNogami(hero = this.player) { return this.itemAt(hero.x, hero.y); }
  /** Cały stos pod nogami - to z niego gracz wybiera, co wziąć. */
  stosPodNogami(hero = this.player) { return this.itemsAt(hero.x, hero.y); }

  /**
   * Podniesienie z podłogi.
   *
   * Bez argumentu bierze wierzchnią rzecz - tak, jak działało to zawsze i tak,
   * jak nadal działa klawisz `,`. Z listą identyfikatorów bierze WYBRANE rzeczy
   * z tego samego kafla, i to jest odpowiedź na zgłoszenie właściciela: gdy na
   * jednym polu leży kilka rzeczy, przebieranie ich po kolei (podnieś, wyrzuć
   * niepotrzebne, podnieś następne) było karą za sam układ podłogi.
   *
   * Cały wybór kosztuje JEDNĄ turę, a nie po jednej za sztukę. To jest zmiana
   * na korzyść gracza i trzeba ją nazwać wprost: schylenie się po trzy rzeczy
   * naraz jest tańsze niż trzy schylenia. Bot z tego nie korzysta, więc seria
   * pomiarowa równowagi tego nie zmierzy - dotyczy wyłącznie człowieka
   * i wyłącznie kafli z kilkoma rzeczami (D-043).
   */
  pickUp(wybor = null) {
    const stos = this.stosPodNogami();
    if (!stos.length) { this.message('Nie ma tu nic do podniesienia.'); return false; }
    // Lista przychodzi z sieci przy stole, więc nie ufamy jej kształtowi.
    const lista = Array.isArray(wybor) ? wybor : null;
    const chciane = lista === null ? [stos[0]] : stos.filter(i => lista.includes(i.id));
    if (!chciane.length) { this.message('Nic nie wybrano.'); return false; }

    const wziete = [], zostalo = [];
    for (const it of chciane) {
      const bylo = sztuk(it);
      const ile = dolozDoPlecaka(this.player, it, (x) => this.etykieta(x));
      if (ile === 0) { zostalo.push(it); continue; }
      if (ile >= bylo) this.items.splice(this.items.indexOf(it), 1);
      else it.ile = bylo - ile;
      wziete.push({ it, ile, reszta: bylo - ile });
      if (it.kind === 'amulet') this.player.hasAmulet = true;
    }

    if (!wziete.length) {
      // Odmowa, nie utrata: rzeczy zostają na podłodze, tura nie mija.
      const it = zostalo[0];
      this.message(`Nie ma miejsca w plecaku (${wolnePola(this.player)} z ${pojemnosc(this.player)} pól wolnych, `
        + `a to zajmuje ${poleRzeczy(it)}).`);
      return false;
    }

    if (wziete.some(w => w.it.kind === 'amulet')) {
      this.message('Bierzesz Amulet Otchłani. Wracaj na powierzchnię!');
    }
    const opis = wziete.filter(w => w.it.kind !== 'amulet').map(w =>
      `${this.etykieta(w.it)}${w.ile > 1 ? ` x${w.ile}` : ''}${w.reszta > 0 ? ` (${w.reszta} zostaje - brak miejsca)` : ''}`);
    if (opis.length) this.message(`Podnosisz: ${opis.join(', ')}.`);
    // Rzeczy, które się nie zmieściły, mają zostać nazwane. Cisza po wybraniu
    // pięciu rzeczy i wzięciu dwóch wygląda jak zgubienie trzech.
    if (zostalo.length) {
      this.message(`Nie zmieściło się: ${zostalo.map(i => this.etykieta(i)).join(', ')}.`);
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
    delete it.px; delete it.py;              // położenie w plecaku traci sens na podłodze
    this.items.push(it);
    const krotnosc = sztuk(it) > 1 ? ` x${sztuk(it)}` : '';
    this.message(`Odkładasz: ${this.etykieta(it)}${krotnosc}.`);
    return true;
  }

  /**
   * Zużycie JEDNEJ sztuki. Stos maleje o jeden, ostatnia sztuka znika z plecaka.
   * Wszystkie zużycia idą tędy - inaczej wypicie mikstury ze stosu kasowałoby
   * cały stos, co jest usterką niewidoczną, dopóki ktoś nie uzbiera trzech.
   */
  zuzyj(it, index) {
    if (sztuk(it) > 1) { it.ile = sztuk(it) - 1; return; }
    this.player.inventory.splice(index, 1);
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
        this.zuzyj(it, index);
        this.message(`Zjadasz: ${it.name}.`);
        return true;
      }
      case 'pack': {
        // Większy plecak nie może zgubić ani jednej rzeczy: przepakowanie idzie
        // po zdjęciu samego plecaka ze stanu i tylko POWIĘKSZA pole, więc
        // niepowodzenie jest niemożliwe - ale sprawdzamy je mimo to.
        const stary = { ...this.player.plecak };
        if (it.w * it.h <= stary.w * stary.h) {
          this.message('Ten plecak nie jest większy od Twojego.');
          return false;
        }
        this.zuzyj(it, index);
        this.player.plecak = { w: it.w, h: it.h };
        if (!przepakuj(this.player)) {
          this.player.plecak = stary;
          this.player.inventory.splice(index, 0, it);
          przepakuj(this.player);
          this.message('Nie udało się przełożyć rzeczy.');
          return false;
        }
        this.message(`Przekładasz rzeczy do większego plecaka: ${it.w}x${it.h} pól.`);
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
    this.zuzyj(it, index);
    this.identify(it);
    switch (it.type) {
      case 'heal':
      case 'greaterHeal': {
        const before = this.player.hp;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + potionPower(it.type));
        this.message(`Pijesz ${it.name}. Odzyskujesz ${this.player.hp - before} życia.`);
        break;
      }
      case 'strength':
        this.player.str += potionPower('strength');
        this.message('Czujesz przypływ siły.');
        break;
      case 'poison': {
        const d = potionPower('poison');
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
    this.zuzyj(it, index);
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

  monstersActOn(depth, cele = this.heroesOn(depth), { zasieg = null } = {}) {
    const entry = this.levels.get(depth);
    if (!entry) return;
    const L = entry.level;
    const lista = entry.monsters;
    // Cele w stałej kolejności tablicy uczestników. Pole odległości ma WIELE
    // źródeł, więc każdy potwór schodzi w dół w stronę najbliższego z nich -
    // jeden przebieg na poziom, nie jeden na potwora.
    if (!cele.length) return;

    // `zasieg` odsiewa potwory, które z tą turą nie mają nic wspólnego, bo stoją
    // przy kimś innym. Odległość liczona CZTEREMA LICZBAMI - `chebyshev` nie
    // przyjmuje obiektów i po cichu daje NaN, co raz już unieruchomiło całą
    // regułę bez jednego błędu (W-19).
    const wZasiegu = (m) => zasieg === null
      || cele.some(h => chebyshev(m.x, m.y, h.x, h.y) <= zasieg);
    const awake = lista.filter(m => !m.asleep && m.hp > 0 && wZasiegu(m));

    // budzenie: FOV jest symetryczny, więc "gracz widzi potwora" znaczy też
    // "potwór widzi gracza" - nie trzeba liczyć pola widzenia każdemu z osobna
    for (const m of lista) {
      if (!m.asleep || !wZasiegu(m)) continue;
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
    const interval = Math.max(8, 24 - p.level) * REGEN_MNOZNIK;
    if (this.turn % interval === 0) p.hp = Math.min(p.maxHp, p.hp + 1);
  }

  tickHunger(hero = this.player) {
    // Ostrzeżenie odzywa się przy ZEJŚCIU O STOPIEŃ, a stopnie są te same, które
    // rysuje pasek sytości (`src/stany.js`). Wcześniej były to dwie niezależne
    // liczby i pasek zmieniał kolor w innym miejscu, niż odzywał się dziennik.
    const przed = stopienGlodu(hero.hunger);
    hero.hunger--;
    const po = stopienGlodu(hero.hunger);
    if (po !== przed && po.komunikat) this.tell(hero, po.komunikat);
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
    plecak: { ...(h.plecak || PLECAK_START) },
    weapon: h.weapon ? h.weapon.id : null,
    armor: h.armor ? h.armor.id : null,
    hasAmulet: h.hasAmulet,
    kills: h.kills,
    zmeczenie: h.zmeczenie || 0,
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
    // Zapis sprzed wprowadzenia zmęczenia go nie niesie - zero jest wtedy
    // stanem prawdziwym, bo tamta gra nie znała cofania się z kosztem.
    zmeczenie: h.zmeczenie || 0,
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
  // Zapis sprzed wprowadzenia przestrzeni nie niesie ani wymiarów, ani położeń.
  // Rzeczy trzeba ułożyć od nowa, a plecak MUSI je pomieścić: zgubienie choćby
  // jednej rzeczy przy wczytaniu byłoby po stronie gracza nieodróżnialne od
  // kradzieży. Dlatego przy niepowodzeniu plecak rośnie, zamiast odrzucać.
  hero.plecak = h.plecak ? { ...h.plecak } : { ...PLECAK_START };
  if (!hero.inventory.every(i => Number.isInteger(i.px)) && !przepakuj(hero)) {
    for (let wys = hero.plecak.h + 1; wys <= 24; wys++) {
      hero.plecak = { w: hero.plecak.w, h: wys };
      if (przepakuj(hero)) break;
    }
  }
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

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
