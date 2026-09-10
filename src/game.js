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
import { randomItem, makeAmulet, makeAppearances, itemLabel } from './items.js';
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
    this.identified = new Set();
    this.levels = new Map(); // depth -> {level, monsters, items, memory}
    this.messages = [];
    this.turn = 0;
    this.status = 'playing'; // 'playing' | 'won' | 'dead'
    this.cause = null;
    this.depth = 0;
    this.visible = new Set();

    this.player = {
      x: 0, y: 0,
      hp: PLAYER_START.hp, maxHp: PLAYER_START.hp,
      str: PLAYER_START.str, def: PLAYER_START.def,
      level: 1, xp: 0,
      hunger: HUNGER_START,
      inventory: [],
      weapon: null, armor: null,
      hasAmulet: false,
      kills: 0,
    };

    if (!opts.deferStart) this.enterLevel(1, 'start');
  }

  newId() { return this._idCounter++; }

  // ---------- świat ----------

  get here() { return this.levels.get(this.depth); }
  get level() { return this.here.level; }
  get monsters() { return this.here.monsters; }
  get items() { return this.here.items; }

  message(text) {
    this.messages.push({ turn: this.turn, text });
    if (this.messages.length > 200) this.messages.shift();
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

    return { level, monsters, items, memory: new Uint8Array(level.w * level.h) };
  }

  enterLevel(depth, from = 'down') {
    if (depth < 1) depth = 1;
    if (!this.levels.has(depth)) this.levels.set(depth, this.buildLevel(depth));
    this.depth = depth;
    const L = this.here.level;
    const spot = from === 'up' ? L.downPos : L.upPos; // wracając z dołu stajemy przy schodach w dół
    this.player.x = spot.x;
    this.player.y = spot.y;
    // gdyby na schodach stał potwór, przesuwamy go, zamiast wpychać gracza w potwora
    const blocker = this.monsters.find(m => m.x === spot.x && m.y === spot.y);
    if (blocker) {
      const p = this.freeTile(L, this.monsters, this.items, [spot]);
      if (p) { blocker.x = p.x; blocker.y = p.y; }
    }
    this.updateFOV();
  }

  updateFOV() {
    const L = this.level;
    this.visible = new Set();
    const mem = this.here.memory;
    computeFOV({ x: this.player.x, y: this.player.y }, FOV_RADIUS,
      (x, y) => !L.inBounds(x, y) || L.isOpaque(x, y),
      (x, y) => {
        if (!L.inBounds(x, y)) return;
        this.visible.add(`${x},${y}`);
        mem[L.idx(x, y)] = 1;
      });
  }

  isVisible(x, y) { return this.visible.has(`${x},${y}`); }
  isRemembered(x, y) { return this.here.memory[this.level.idx(x, y)] === 1; }

  monsterAt(x, y) { return this.monsters.find(m => m.x === x && m.y === y && m.hp > 0); }
  itemAt(x, y) { return this.items.find(i => i.x === x && i.y === y); }

  // ---------- statystyki bojowe ----------

  playerAttack() {
    const w = this.player.weapon;
    return this.player.str + (w ? w.bonus + (w.enchant || 0) : 0);
  }

  playerDefense() {
    const a = this.player.armor;
    return this.player.def + (a ? a.bonus + (a.enchant || 0) : 0);
  }

  // ---------- działania gracza ----------

  /**
   * Jedno działanie gracza. Zwraca true, jeśli minęła tura (czyli świat też się ruszył).
   * Działania odrzucone (ruch w ścianę, brak przedmiotu) NIE zużywają tury.
   */
  act(action) {
    if (this.status !== 'playing') return false;
    let spent = false;

    switch (action.type) {
      case 'move': spent = this.tryMove(action.dx, action.dy); break;
      case 'wait': spent = true; break;
      case 'pickup': spent = this.pickUp(); break;
      case 'descend': spent = this.descend(); break;
      case 'ascend': spent = this.ascend(); break;
      case 'use': spent = this.useItem(action.index); break;
      case 'drop': spent = this.dropItem(action.index); break;
      default: spent = false;
    }

    if (spent) {
      this.turn++;
      this.monstersAct();
      this.tickRegen();
      this.tickHunger();
      this.updateFOV();
      if (this.player.hp <= 0 && this.status === 'playing') this.die(this.deathCause || 'rany');
    }
    return spent;
  }

  tryMove(dx, dy) {
    const nx = this.player.x + dx, ny = this.player.y + dy;
    const L = this.level;
    if (!L.inBounds(nx, ny)) return false;
    const m = this.monsterAt(nx, ny);
    if (m) { this.attack(this.player, m); return true; }
    if (!L.isWalkable(nx, ny)) return false;
    // zakaz ścinania rogów - ta sama reguła co w szukaniu drogi
    if (dx !== 0 && dy !== 0 && (!L.isWalkable(this.player.x + dx, this.player.y) || !L.isWalkable(this.player.x, this.player.y + dy))) return false;
    this.player.x = nx; this.player.y = ny;
    const it = this.itemAt(nx, ny);
    if (it) this.message(`Leży tu ${itemLabel(it, this.appearances, this.identified)}.`);
    const t = L.at(nx, ny);
    if (t === STAIRS_DOWN) this.message('Są tu schody w dół (>).');
    if (t === STAIRS_UP) this.message('Są tu schody w górę (<).');
    return true;
  }

  attack(attacker, defender) {
    const isPlayer = attacker === this.player;
    const atkPower = isPlayer ? this.playerAttack() : attacker.str;
    const defPower = isPlayer ? defender.def : this.playerDefense();
    const raw = this.rng.dice(1, Math.max(1, atkPower));
    const mitigation = this.rng.int(defPower + 1);
    const dmg = Math.max(0, raw - mitigation);

    const aName = isPlayer ? 'Trafiasz' : `${cap(attacker.name)} trafia`;
    if (dmg <= 0) {
      this.message(isPlayer ? `Chybiasz - ${defender.name} unika ciosu.` : `${cap(attacker.name)} chybia.`);
      return;
    }
    if (isPlayer) {
      defender.hp -= dmg;
      this.message(`${aName} ${defender.name} (${dmg}).`);
      if (defender.hp <= 0) this.killMonster(defender);
    } else {
      this.player.hp -= dmg;
      this.deathCause = `zabity przez: ${attacker.name}`;
      this.message(`${aName} Ciebie (${dmg}).`);
    }
  }

  killMonster(m) {
    this.message(`${cap(m.name)} pada.`);
    this.player.kills++;
    this.gainXp(m.xp);
    const idx = this.monsters.indexOf(m);
    if (idx >= 0) this.monsters.splice(idx, 1);
    if (m.boss) {
      const amulet = makeAmulet();
      amulet.id = this.newId();
      amulet.x = m.x; amulet.y = m.y;
      this.items.push(amulet);
      this.message('Z ciała wypada Amulet Otchłani! Zabierz go na powierzchnię.');
    }
  }

  gainXp(amount) {
    this.player.xp += amount;
    while (this.player.xp >= xpForLevel(this.player.level + 1)) {
      this.player.level++;
      this.player.maxHp += 10;
      this.player.hp += 10;
      this.player.str += 1;
      if (this.player.level % 2 === 0) this.player.def += 1;
      this.message(`Awansujesz na poziom ${this.player.level}!`);
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
      this.message(`Podnosisz: ${itemLabel(it, this.appearances, this.identified)}.`);
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
    this.message(`Odkładasz: ${itemLabel(it, this.appearances, this.identified)}.`);
    return true;
  }

  identify(item) { this.identified.add(`${item.kind}:${item.type}`); }

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
        this.message(this.player.weapon ? `Dobywasz: ${itemLabel(it, this.appearances, this.identified)}.` : 'Chowasz broń.');
        return true;
      }
      case 'armor': {
        this.player.armor = this.player.armor === it ? null : it;
        this.message(this.player.armor ? `Zakładasz: ${itemLabel(it, this.appearances, this.identified)}.` : 'Zdejmujesz pancerz.');
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
      case 'magicMap': {
        this.here.memory.fill(1);
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
      if (this.player.hasAmulet) { this.win(); return true; }
      this.message('Nie wrócisz z pustymi rękami. Amulet czeka w głębi.');
      return false;
    }
    this.enterLevel(this.depth - 1, 'up');
    this.message(`Wracasz na poziom ${this.depth}.`);
    return true;
  }

  // ---------- świat odpowiada ----------

  monstersAct() {
    const L = this.level;
    const awake = this.monsters.filter(m => !m.asleep && m.hp > 0);

    // budzenie: FOV jest symetryczny, więc "gracz widzi potwora" znaczy też
    // "potwór widzi gracza" - nie trzeba liczyć pola widzenia każdemu z osobna
    for (const m of this.monsters) {
      if (!m.asleep) continue;
      const dist = chebyshev(m.x, m.y, this.player.x, this.player.y);
      if (dist <= FOV_RADIUS && this.isVisible(m.x, m.y) && this.rng.chance(0.55)) {
        m.asleep = false;
        awake.push(m);
      } else if (dist <= 1) {
        m.asleep = false;
        awake.push(m);
      }
    }
    if (awake.length === 0) return;

    const passable = (x, y) => L.isWalkable(x, y);
    const field = distanceField([{ x: this.player.x, y: this.player.y }], passable, { limit: 40 });

    for (const m of awake) {
      if (m.hp <= 0) continue;
      if (m.regen && m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + m.regen);

      if (chebyshev(m.x, m.y, this.player.x, this.player.y) === 1) {
        this.attack(m, this.player);
        continue;
      }
      if (m.erratic && this.rng.chance(0.4)) {
        const opts = neighbors(m.x, m.y, passable).filter(([nx, ny]) => !this.monsterAt(nx, ny) && !(nx === this.player.x && ny === this.player.y));
        if (opts.length) { const [nx, ny] = this.rng.pick(opts); m.x = nx; m.y = ny; }
        continue;
      }

      const myD = field.get(`${m.x},${m.y}`);
      if (myD === undefined) continue; // gracz nieosiągalny - potwór czeka
      let best = null, bestD = myD;
      for (const [nx, ny] of neighbors(m.x, m.y, passable)) {
        const d = field.get(`${nx},${ny}`);
        if (d === undefined || d >= bestD) continue;
        if (this.monsterAt(nx, ny)) continue;
        if (nx === this.player.x && ny === this.player.y) continue;
        bestD = d; best = [nx, ny];
      }
      if (best) { m.x = best[0]; m.y = best[1]; }
    }
  }

  /** Powolna regeneracja życia. Bez niej partia jest ciągiem strat bez odbicia
   *  i nie da się jej wygrać niezależnie od umiejętności - patrz D-005. */
  tickRegen() {
    const p = this.player;
    if (p.hp <= 0 || p.hp >= p.maxHp) return;
    if (p.hunger <= 0) return; // głodujący się nie regeneruje
    const interval = Math.max(8, 24 - p.level);
    if (this.turn % interval === 0) p.hp = Math.min(p.maxHp, p.hp + 1);
  }

  tickHunger() {
    this.player.hunger--;
    if (this.player.hunger === 200) this.message('Robisz się głodny.');
    if (this.player.hunger === 50) this.message('Jesteś bardzo głodny!');
    if (this.player.hunger <= 0) {
      this.player.hunger = 0;
      if (this.turn % 3 === 0) {
        this.player.hp -= 1;
        this.deathCause = 'głód';
        if (this.turn % 15 === 0) this.message('Umierasz z głodu...');
      }
    }
  }

  die(cause) {
    this.status = 'dead';
    this.cause = cause;
    this.message(`Ginisz. Przyczyna: ${cause}.`);
  }

  win() {
    this.status = 'won';
    this.cause = 'wyniesiono Amulet Otchłani';
    this.message('Wychodzisz na światło dnia z Amuletem Otchłani. ZWYCIĘSTWO!');
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
        memory: bytesToBase64(entry.memory),
      };
    }
    return {
      format: 1,
      seed: this.seed,
      rng: this.rng.getState(),
      idCounter: this._idCounter,
      maxDepth: this.maxDepth,
      width: this.width, height: this.height,
      appearances: this.appearances,
      identified: [...this.identified],
      depth: this.depth,
      turn: this.turn,
      status: this.status,
      cause: this.cause,
      deathCause: this.deathCause ?? null,
      messages: this.messages,
      player: {
        ...this.player,
        inventory: this.player.inventory,
        weapon: this.player.weapon ? this.player.weapon.id : null,
        armor: this.player.armor ? this.player.armor.id : null,
      },
      levels,
    };
  }

  static fromJSON(data) {
    if (!data || data.format !== 1) throw new Error('Nieznany format zapisu');
    const g = new Game(data.seed, { deferStart: true, maxDepth: data.maxDepth, w: data.width, h: data.height });
    g.rng.setState(data.rng);
    g._idCounter = data.idCounter;
    g.appearances = data.appearances;
    g.identified = new Set(data.identified);
    g.depth = data.depth;
    g.turn = data.turn;
    g.status = data.status;
    g.cause = data.cause;
    g.deathCause = data.deathCause ?? undefined;
    g.messages = data.messages;
    g.player = { ...data.player };
    g.player.inventory = data.player.inventory;
    g.player.weapon = g.player.inventory.find(i => i.id === data.player.weapon) || null;
    g.player.armor = g.player.inventory.find(i => i.id === data.player.armor) || null;
    g.levels = new Map();
    for (const [d, e] of Object.entries(data.levels)) {
      g.levels.set(Number(d), {
        level: Level.fromJSON(e.level),
        monsters: e.monsters,
        items: e.items,
        memory: base64ToBytes(e.memory),
      });
    }
    g.updateFOV();
    return g;
  }
}

function it_power(it) { return it.type === 'greaterHeal' ? 30 : 12; }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
