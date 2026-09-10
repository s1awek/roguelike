// Gracz automatyczny.
//
// Jest CAŁKOWICIE deterministyczny: nie losuje niczego i nie sięga do generatora
// losowego gry. Remisy rozstrzyga po współrzędnych. Dzięki temu seria partii jest
// powtarzalna, a różnica w wyniku serii znaczy zmianę w GRZE, nie szum bota.
//
// Trasa jest zapamiętywana między turami. Liczenie A* od nowa co turę działa tak
// samo, ale tysiąc partii po kilka tysięcy tur robi z tego kwadrans zamiast minuty.

import { findPath, distanceField, chebyshev, neighbors } from './path.js';
import { STAIRS_DOWN, STAIRS_UP } from './map.js';
import { PROG_ZMECZENIA } from './game.js';
import { wolnePola } from './plecak.js';

const LOW_HP = 0.4;
const CRITICAL_HP = 0.22;
const HUNGRY = 250;

/**
 * Ile przedmiot jest wart dla bota. Potrzebne wyłącznie po to, żeby wiedział,
 * co porzucić przy pełnym plecaku - a to okazało się warunkiem UKOŃCZENIA gry:
 * z pełnym plecakiem stojącym na Amulecie partia nie ma jak się rozstrzygnąć.
 */
function itemValue(game, it, ctx) {
  const known = (k, t) => game.identified.has(`${k}:${t}`);
  const nth = (key) => { ctx[key] = (ctx[key] || 0) + 1; return ctx[key]; };
  switch (it.kind) {
    case 'amulet': return 1e9;
    case 'potion': {
      if (!known('potion', it.type)) return 40;
      if (it.type === 'poison') return 1;
      const n = nth(`p:${it.type}`);
      const base = it.type === 'greaterHeal' ? 120 : it.type === 'heal' ? 100 : 80;
      return n <= 3 ? base : 6; // czwarta i dalsze sztuki to balast
    }
    case 'scroll':
      if (!known('scroll', it.type)) return 50;
      if (it.type === 'enchantWeapon' || it.type === 'enchantArmor') return 90;
      if (it.type === 'teleport') return 30;
      return 15;
    case 'weapon': {
      const v = (it.bonus || 0) + (it.enchant || 0);
      const cur = game.player.weapon ? game.player.weapon.bonus + (game.player.weapon.enchant || 0) : -1;
      return game.player.weapon === it ? 200 : (v > cur ? 150 : 3);
    }
    case 'armor': {
      const v = (it.bonus || 0) + (it.enchant || 0);
      const cur = game.player.armor ? game.player.armor.bonus + (game.player.armor.enchant || 0) : -1;
      return game.player.armor === it ? 200 : (v > cur ? 150 : 3);
    }
    case 'food': {
      ctx.food = (ctx.food || 0) + 1;
      return ctx.food <= 2 ? 95 : 8; // trzecia racja i dalsze to balast
    }
    // Większy plecak jest wart tyle, ile miejsca dokłada - i tylko wtedy, gdy
    // faktycznie jest większy od noszonego.
    case 'pack':
      return (it.w * it.h) > (game.player.plecak.w * game.player.plecak.h) ? 160 : 2;
    default: return 10;
  }
}

/** Indeks najmniej wartościowego przedmiotu w plecaku i jego wartość. */
function worstCarried(game) {
  const ctx = {};
  let idx = -1, val = Infinity;
  game.player.inventory.forEach((it, i) => {
    const v = itemValue(game, it, ctx);
    if (v < val) { val = v; idx = i; }
  });
  return { idx, val };
}

export class Bot {
  constructor() {
    this.path = null;
    this.goalKey = null;
    this.goalKind = null;
    // Pola, na których bot już stał. Wszystko, co z nich widać, jest zapamiętane,
    // więc jako cel eksploracji są wyczerpane. Bez tego zbioru granica poznanego
    // NIGDY się nie kończy: pole sąsiadujące z niewidzianą litą skałą pozostaje
    // "granicą" na zawsze, a bot krąży po zbadanym poziomie zamiast zejść niżej.
    this.exhausted = new Set();
    // Przedmioty świadomie porzucone. Bez tej pamięci bot wpadał w pętlę
    // porzuć-podnieś: odkładał balast i w następnej turze brał go z powrotem,
    // bo podnoszenie nie miało progu wartości. Partia nie kończyła się nigdy.
    this.dropped = new Set();
    this.levelEnteredTurn = 0;
    this.lastDepth = null;
  }

  /** Ile tur bot spędził już na bieżącym poziomie. */
  turnsHere(game) {
    if (this.lastDepth !== game.depth) { this.lastDepth = game.depth; this.levelEnteredTurn = game.turn; }
    return game.turn - this.levelEnteredTurn;
  }

  invalidate() { this.path = null; this.goalKey = null; this.goalKind = null; }

  bestOf(inventory, kind) {
    let best = null;
    for (const it of inventory) {
      if (it.kind !== kind) continue;
      const v = (it.bonus || 0) + (it.enchant || 0);
      if (!best || v > (best.bonus || 0) + (best.enchant || 0)) best = it;
    }
    return best;
  }

  /** Jedno działanie. Zwraca obiekt akcji dla game.act(). */
  decide(game) {
    const p = game.player;
    const inv = p.inventory;
    this.exhausted.add(`${game.depth}:${p.x},${p.y}`);

    // 0. większy plecak przekładamy od razu - noszenie go zamiast używać jest
    //    czystą stratą pola, a przy okazji robi z niego kandydata do porzucenia
    const plecakIdx = inv.findIndex(it => it.kind === 'pack'
      && it.w * it.h > p.plecak.w * p.plecak.h);
    if (plecakIdx >= 0) return { type: 'use', index: plecakIdx };

    // 1. ratunek: leczenie przy niskim życiu
    if (p.hp / p.maxHp < LOW_HP) {
      const i = inv.findIndex(it => it.kind === 'potion' && (it.type === 'heal' || it.type === 'greaterHeal')
        && game.identified.has(`potion:${it.type}`));
      if (i >= 0) return { type: 'use', index: i };
      // nierozpoznana mikstura przy życiu krytycznym - i tak nie ma nic do stracenia
      if (p.hp / p.maxHp < CRITICAL_HP) {
        const j = inv.findIndex(it => it.kind === 'potion' && !game.identified.has(`potion:${it.type}`));
        if (j >= 0) return { type: 'use', index: j };
      }
    }

    // 2. głód
    if (p.hunger < HUNGRY) {
      const i = inv.findIndex(it => it.kind === 'food');
      if (i >= 0) return { type: 'use', index: i };
    }

    // 3. lepszy sprzęt
    const bw = this.bestOf(inv, 'weapon');
    if (bw && bw !== p.weapon && (!p.weapon || (bw.bonus + (bw.enchant || 0)) > (p.weapon.bonus + (p.weapon.enchant || 0)))) {
      return { type: 'use', index: inv.indexOf(bw) };
    }
    const ba = this.bestOf(inv, 'armor');
    if (ba && ba !== p.armor && (!p.armor || (ba.bonus + (ba.enchant || 0)) > (p.armor.bonus + (p.armor.enchant || 0)))) {
      return { type: 'use', index: inv.indexOf(ba) };
    }

    // 3b. zwoje: wzmocnienie sprzętu i rozpoznawanie nieznanych w spokojnej chwili
    const monsterInSight = game.monsters.some(m => m.hp > 0 && game.isVisible(m.x, m.y));
    if (!monsterInSight) {
      if (p.weapon) {
        const i = inv.findIndex(it => it.kind === 'scroll' && it.type === 'enchantWeapon' && game.identified.has('scroll:enchantWeapon'));
        if (i >= 0) return { type: 'use', index: i };
      }
      if (p.armor) {
        const i = inv.findIndex(it => it.kind === 'scroll' && it.type === 'enchantArmor' && game.identified.has('scroll:enchantArmor'));
        if (i >= 0) return { type: 'use', index: i };
      }
      // nieznany zwój czytamy tylko przy zdrowiu i spokoju - to jedyny sposób,
      // żeby dowiedzieć się, co to jest, a niespodzianka przy pełnym HP jest tania
      if (p.hp / p.maxHp > 0.7 && p.hunger > 300) {
        const i = inv.findIndex(it => it.kind === 'scroll' && !game.identified.has(`scroll:${it.type}`));
        if (i >= 0) return { type: 'use', index: i };
      }
    }

    // 4. wróg w zwarciu - bijemy najsłabszego z sąsiadów (stały porządek: po hp, potem po współrzędnych)
    const adjacent = game.monsters
      .filter(m => m.hp > 0 && chebyshev(m.x, m.y, p.x, p.y) === 1)
      .sort((a, b) => a.hp - b.hp || a.x - b.x || a.y - b.y);
    if (adjacent.length) {
      this.invalidate();
      const m = adjacent[0];
      return { type: 'move', dx: Math.sign(m.x - p.x), dy: Math.sign(m.y - p.y) };
    }

    // 5. przedmiot pod nogami
    const under = game.itemAt(p.x, p.y);
    if (under && !this.dropped.has(under.id)) {
      if (game.czyZmiesci(under) && itemValue(game, under, {}) > 10) return { type: 'pickup' };
      // plecak pełny: porzucamy balast, jeśli to, co leży, jest cenniejsze
      const worst = worstCarried(game);
      if (worst.idx >= 0 && itemValue(game, under, {}) > worst.val) {
        this.dropped.add(inv[worst.idx].id);
        return { type: 'drop', index: worst.idx };
      }
      // Nie da się go podnieść ANI wymienić - z punktu widzenia bota jest
      // nieosiągalny, więc przestaje być celem. Bez tego kroku bot krążył wokół
      // niego w nieskończoność: krok 5 nic nie robił, a krok 8 obierał ten sam
      // przedmiot za cel i kazał do niego iść. Zmierzone na `grywalnosc-0`:
      // 400 tur oscylacji między (43,6) a (44,5), pełne HP, partia bez końca.
      this.dropped.add(under.id);
    }

    // 6. schody: w dół dopóki nie mamy amuletu, w górę gdy już go mamy
    const tile = game.level.at(p.x, p.y);
    if (p.hasAmulet && tile === STAIRS_UP) return { type: 'ascend' };
    if (!p.hasAmulet && tile === STAIRS_DOWN && game.depth < game.maxDepth) return { type: 'descend' };
    // na najgłębszym poziomie schodzimy dalej dopiero po pokonaniu smoka - tam schodów nie ma

    const passable = (x, y) => game.level.isWalkable(x, y) && !game.monsterAt(x, y);
    const passableFight = (x, y) => game.level.isWalkable(x, y);

    // 6b. odpoczynek: przy nadszarpniętym zdrowiu i braku zagrożenia lepiej poczekać,
    //     niż wejść w kolejną walkę. Kosztuje głód, więc tylko gdy jest co jeść.
    //
    // „Brak zagrożenia" długo znaczyło wyłącznie „nie widzę potwora", bo reguła
    // powstała dla gry jednoosobowej, w której nikogo innego w lochu nie ma.
    // Przy stole dawało to obraz zgłoszony przez właściciela: czterech
    // poobijanych uczestników stoi nieruchomo w jednym pokoju przez kilka minut,
    // każdy uznając pozostałych za element wystroju (W-27). W partii jednoosobowej
    // `contacts` zwraca pustą listę, więc równowaga mierzona serią 1000 partii
    // nie zmienia się ani o jotę.
    const ludzieWZasiegu = game.contacts ? game.contacts(p).length > 0 : false;
    if (!monsterInSight && !ludzieWZasiegu && p.hp / p.maxHp < 0.65
        && (p.hunger > 400 || inv.some(it => it.kind === 'food'))) {
      if (p.hunger < HUNGRY + 150) {
        const i = inv.findIndex(it => it.kind === 'food');
        if (i >= 0) return { type: 'use', index: i };
      }
      return { type: 'wait' };
    }

    // 7. widoczny obudzony potwór - idziemy do niego (chyba że ledwo żyjemy i nie mamy czym się leczyć)
    const desperate = p.hp / p.maxHp < 0.5 && !inv.some(it => it.kind === 'potion');
    if (!desperate) {
      const targets = game.monsters
        .filter(m => m.hp > 0 && game.isVisible(m.x, m.y))
        .sort((a, b) => chebyshev(a.x, a.y, p.x, p.y) - chebyshev(b.x, b.y, p.x, p.y) || a.x - b.x || a.y - b.y);
      if (targets.length) {
        const t = targets[0];
        const step = this.stepToward(game, { x: t.x, y: t.y }, passableFight, 'monster');
        if (step) return step;
      }
    }

    // 8. przedmioty leżące na poziomie. Amulet ma pierwszeństwo przed wszystkim,
    //    także przed pełnym plecakiem - bez niego partii nie da się wygrać.
    const amuletOnFloor = game.items.find(i => i.kind === 'amulet');
    if (amuletOnFloor) {
      const step = this.stepToward(game, { x: amuletOnFloor.x, y: amuletOnFloor.y }, passable, 'amulet');
      if (step) return step;
    }
    const worst = worstCarried(game);
    if (wolnePola(p) > 0 || worst.val < 30) {
      // pole, na którym stoimy, nie jest celem podróży - inaczej bot wychodzi
      // z niego i natychmiast wraca, bo znów jest najbliższe
      const worthwhile = game.items.filter(i => !this.dropped.has(i.id)
        && !(i.x === p.x && i.y === p.y) && itemValue(game, i, {}) > 10);
      const goal = this.nearest(game, worthwhile.map(i => ({ x: i.x, y: i.y })), passable);
      if (goal) {
        const step = this.stepToward(game, goal, passable, 'item');
        if (step) return step;
      }
    }

    // 9. cel podróży: schody
    const stairGoal = p.hasAmulet ? game.level.upPos : (game.depth < game.maxDepth ? game.level.downPos : null);

    // 10. eksploracja - granica poznanego.
    //     Po wyczerpaniu budżetu czasu na poziom schody mają pierwszeństwo:
    //     dobadywanie resztek granicy potrafi trwać dłużej niż cała reszta partii,
    //     a zysk z niego spada do zera.
    const budgetSpent = this.turnsHere(game) > 700;
    if (budgetSpent && stairGoal) {
      const step = this.stepToward(game, stairGoal, passable, 'stairs');
      if (step) return step;
    }
    const frontier = this.frontierTiles(game);
    if (frontier.length) {
      const goal = this.nearest(game, frontier, passable);
      if (goal) {
        const step = this.stepToward(game, goal, passable, 'explore');
        if (step) return step;
      }
    }

    // 11. wszystko zbadane - do schodów
    if (stairGoal) {
      const step = this.stepToward(game, stairGoal, passable, 'stairs');
      if (step) return step;
    }
    // 12. na najgłębszym poziomie bez celu: szukamy smoka po całej mapie
    if (game.depth === game.maxDepth && !p.hasAmulet) {
      const boss = game.monsters.find(m => m.boss);
      if (boss) {
        const step = this.stepToward(game, { x: boss.x, y: boss.y }, passableFight, 'boss');
        if (step) return step;
      }
    }
    return { type: 'wait' };
  }

  /** Najbliższy z celów wg przeszukiwania wszerz od gracza. */
  nearest(game, candidates, passable) {
    if (!candidates.length) return null;
    const field = distanceField([{ x: game.player.x, y: game.player.y }], passable);
    let best = null, bestD = Infinity;
    for (const c of candidates) {
      const d = field.get(`${c.x},${c.y}`);
      if (d === undefined || d === 0) continue;
      if (d < bestD || (d === bestD && best && (c.x < best.x || (c.x === best.x && c.y < best.y)))) {
        bestD = d; best = c;
      }
    }
    return best;
  }

  /** Pola poznane, sąsiadujące z nieznanymi - naturalna granica eksploracji. */
  frontierTiles(game) {
    const L = game.level;
    const out = [];
    for (let y = 0; y < L.h; y++) {
      for (let x = 0; x < L.w; x++) {
        if (!L.isWalkable(x, y) || !game.isRemembered(x, y)) continue;
        if (this.exhausted.has(`${game.depth}:${x},${y}`)) continue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx, ny = y + dy;
            if (!L.inBounds(nx, ny)) continue;
            if (!game.isRemembered(nx, ny)) { out.push({ x, y }); dy = 2; break; }
          }
        }
      }
    }
    return out;
  }

  /**
   * Krok w stronę celu, z zapamiętaną trasą.
   *
   * Plan awaryjny jest tu istotny, a nie ozdobny: normalnie bot omija pola zajęte
   * przez potwory, ale ŚPIĄCY potwór stojący w korytarzu czyni cel nieosiągalnym
   * na zawsze. Bez ponownego liczenia trasy "przez potwory" bot czekał w miejscu
   * do końca limitu tur - i tak powstawała większość partii bez rozstrzygnięcia.
   */
  stepToward(game, goal, passable, kind) {
    const key = `${goal.x},${goal.y}`;
    const p = game.player;
    if (this.goalKey !== key || this.goalKind !== kind || !this.path || !this.path.length) {
      this.path = findPath({ x: p.x, y: p.y }, goal, passable);
      if (!this.path || !this.path.length) {
        // druga próba: potwory jako przeszkody do usunięcia, nie do ominięcia
        this.path = findPath({ x: p.x, y: p.y }, goal, (x, y) => game.level.isWalkable(x, y));
      }
      this.goalKey = key;
      this.goalKind = kind;
    }
    if (!this.path || !this.path.length) { this.invalidate(); return null; }

    const next = this.path[0];
    if (chebyshev(next.x, next.y, p.x, p.y) !== 1) {
      // trasa się rozjechała (teleport, zejście piętro niżej) - liczymy od nowa
      this.path = findPath({ x: p.x, y: p.y }, goal, passable);
      if (!this.path || !this.path.length) { this.invalidate(); return null; }
    }
    const step = this.path.shift();
    return { type: 'move', dx: step.x - p.x, dy: step.y - p.y };
  }
}

/**
 * Rozgrywa partię do końca.
 * @returns {{outcome, cause, turns, depth, score, level, kills, error}}
 *   outcome: 'won' | 'dead' | 'stalled' | 'crash'
 */
/**
 * Limit tur na partię. JEDNA wartość dla wszystkich wywołań - biblioteki, CLI
 * i odbioru. Wcześniej każde z tych miejsc miało własną domyślną (4000 tutaj,
 * 8000 w bin/bot.js), przez co odbiór mierzył co innego niż seria.
 *
 * Wartość wynika z pomiaru, nie z wygody: przy limicie 20000 najkrótsza wygrana
 * partia trwa 4068 tur, mediana 6444, najdłuższa 8448, a partii nierozstrzygniętych
 * jest ZERO na 150. Limit 12000 leży 1,4x powyżej najdłuższej zaobserwowanej
 * wygranej, czyli przestaje być czynnikiem wiążącym wynik. Limit 4000 leżał
 * PONIŻEJ najkrótszej możliwej wygranej - przy nim gra była nie do przejścia
 * z definicji, a nie z powodu równowagi.
 */
export const MAX_TURNS = 12000;

export function playOut(game, opts = {}) {
  const maxTurns = opts.maxTurns ?? MAX_TURNS;
  const stallLimit = opts.stallLimit ?? 300;
  const bot = new Bot();

  let lastProgress = 0;
  let progressMark = -1;
  let rejected = 0;

  try {
    while (game.status === 'playing' && game.turn < maxTurns) {
      const action = bot.decide(game);
      const spent = game.act(action);
      if (!spent) {
        // odrzucone działanie nie zużywa tury - bez tego licznika bot mógłby
        // w nieskończoność prosić o coś, na co gra się nie zgadza
        if (++rejected > 50) return result(game, 'stalled', 'bot utknął na odrzucanych działaniach');
        bot.invalidate();
        continue;
      }
      rejected = 0;

      // postęp mierzymy zwiedzonym terenem, głębokością i doświadczeniem
      // Zwiedzone pola wliczamy do postępu: bot sprzątający resztki granicy
      // poznanego przez kilkaset tur NIE jest zakleszczony, tylko powolny.
      // Bot krążący między dwoma polami nowych pól nie dodaje - i nadal zostanie złapany.
      const mark = game.depth * 100000 + countExplored(game) + game.player.xp * 7
        + game.player.hp * 3 + bot.exhausted.size * 11 + (game.player.hasAmulet ? 50000 : 0);
      if (mark !== progressMark) { progressMark = mark; lastProgress = game.turn; }
      else if (game.turn - lastProgress > stallLimit) {
        return result(game, 'stalled', `brak postępu przez ${stallLimit} tur`);
      }
    }
  } catch (e) {
    const r = result(game, 'crash', e.message);
    r.error = e;
    return r;
  }

  if (game.status === 'won') return result(game, 'won', game.cause);
  if (game.status === 'dead') return result(game, 'dead', game.cause);
  return result(game, 'stalled', `wyczerpano limit ${maxTurns} tur`);
}

function countExplored(game) {
  let n = 0;
  const mem = game.memoryOf(game.player);
  for (let i = 0; i < mem.length; i++) n += mem[i];
  return n;
}

function result(game, outcome, cause) {
  return {
    outcome, cause,
    seed: game.seed,
    turns: game.turn,
    depth: game.depth,
    level: game.player.level,
    xp: game.player.xp,
    kills: game.player.kills,
    hasAmulet: game.player.hasAmulet,
    score: game.score(),
  };
}

// ---------- pojedynek: dwóch (lub więcej) graczy automatycznych w jednym lochu ----------

/**
 * Warstwa walki gracz-gracz doklejona NA bota, a nie w nim.
 *
 * Bot z `Bot` jest przyrządem pomiarowym i musi zostać w pełni powtarzalny
 * (kryterium 24 spec-a wielu graczy), dlatego nie wie nic o innych uczestnikach.
 * Zachowanie wobec drugiego gracza siedzi tutaj: bij, gdy masz siłę, odejdź,
 * gdy jej nie masz. Tyle wystarcza, żeby ZMIERZYĆ, czy reguła tury daje się
 * rozstrzygać - i czy da się z niej wyjść żywym.
 */
export function decydujWPojedynku(game, hero, bot) {
  const wrogowie = game.contacts(hero);
  const sasiad = wrogowie.find(o => chebyshev(hero.x, hero.y, o.x, o.y) === 1);
  if (sasiad) {
    const slabo = hero.hp < hero.maxHp * 0.45;
    // Bez tchu ucieczka jest pozorna: odwrót zamienia się w przystanek na
    // oddech, a przeciwnik stoi obok i bije. Zwierzę zaszczute staje i walczy -
    // inaczej gracz automatyczny biernie oddaje ciosy, co wygląda na usterkę,
    // a nie na decyzję.
    const bezTchu = (hero.zmeczenie || 0) >= PROG_ZMECZENIA;
    if (!slabo || bezTchu) {
      return { type: 'move', dx: Math.sign(sasiad.x - hero.x), dy: Math.sign(sasiad.y - hero.y) };
    }
    // Wycofanie: pole obok, dalej od przeciwnika, wolne i przejezdne. Bez losowania.
    const L = game.levels.get(hero.depth).level;
    let cel = null, najdalej = chebyshev(hero.x, hero.y, sasiad.x, sasiad.y);
    for (const [nx, ny] of neighbors(hero.x, hero.y, (x, y) => L.isWalkable(x, y))) {
      const d = chebyshev(nx, ny, sasiad.x, sasiad.y);
      if (d <= najdalej) continue;
      if (game.monsterOn(hero.depth, nx, ny) || game.heroAt(nx, ny, hero.depth, hero)) continue;
      najdalej = d; cel = [nx, ny];
    }
    if (cel) return { type: 'move', dx: cel[0] - hero.x, dy: cel[1] - hero.y };
  }
  return bot.decide(game);
}

/**
 * Rozgrywa partię kilku graczy automatycznych w jednym lochu i zwraca pomiar.
 *
 * Reguła tury jest tu użyta dokładnie tak, jak ma działać na serwerze:
 * uczestnicy w kontakcie odbywają turę WSPÓLNĄ (obaj deklarują w ciemno, oba
 * działania biorą skutek naraz), a uczestnik samotny idzie własnym tempem
 * i na nikogo nie czeka.
 */
/**
 * Uczestnicy pogrupowani po kontakcie, DOMKNIĘCIE PRZECHODNIE.
 *
 * Kontakt jest parami: A widzi B, B widzi C, ale A nie widzi C. Naiwne
 * grupowanie „ja plus moje kontakty" dałoby wtedy grupę {A,B}, a C zostałby
 * sam - i rozstrzygałby swoją turę przeciw B, który już się ruszył. To jest
 * dokładnie ta darmowa seria ciosów, której zakazuje reguła tury. Cały
 * łańcuch musi rozstrzygać się razem.
 */
export function grupyWKontakcie(game, zywi) {
  const wziete = new Set();
  const grupy = [];
  for (const start of zywi) {
    if (wziete.has(start.hid)) continue;
    const grupa = [];
    const kolejka = [start];
    wziete.add(start.hid);
    while (kolejka.length) {
      const h = kolejka.shift();
      grupa.push(h);
      for (const o of game.contacts(h)) {
        if (!wziete.has(o.hid)) { wziete.add(o.hid); kolejka.push(o); }
      }
    }
    grupy.push(grupa);
  }
  return grupy;
}

export function playDuel(game, opts = {}) {
  // Licznik tur gry rośnie o jeden na KAŻDE działanie uczestnika, nie na rundę,
  // więc budżet musi skalować się z liczbą graczy - inaczej dziesięciu graczy
  // dostaje jedną piątą partii, którą dostaje dwóch.
  const maxTurns = opts.maxTurns ?? MAX_TURNS * Math.max(1, game.heroes.length);
  const stallLimit = opts.stallLimit ?? 500;
  const boty = game.heroes.map(() => new Bot());

  // UWAGA na `spotkania`/`rozejscia`: to liczniki PRZEJŚĆ stanu „ktokolwiek jest
  // w kontakcie". Przy dwóch graczach mówią to, co się wydaje. Przy dziesięciu
  // NASYCAJĄ SIĘ, bo ktoś jest w kontakcie niemal zawsze, więc przejść jest mało
  // mimo że kontaktu jest dużo. Do gęstości spotkań służy `turyUczestnikowWKontakcie`
  // podzielone przez `turyUczestnikow` - to nie saturuje.
  const pom = {
    spotkania: 0, rozejscia: 0, turyWspolne: 0, turyWolne: 0,
    turyUczestnikow: 0, turyUczestnikowWKontakcie: 0,
    ciosyMiedzyGraczami: 0, przegraneStarcia: 0, odrzucone: 0,
  };
  let byłKontakt = false;
  let znak = -1, ostatniPostep = 0;

  const zyje = () => game.heroes.filter(h => h.status === 'playing');

  try {
    while (game.turn < maxTurns && zyje().length > 0) {
      const grupy = grupyWKontakcie(game, zyje());

      const kontakt = grupy.some(g => g.length > 1);
      if (kontakt && !byłKontakt) pom.spotkania++;
      if (!kontakt && byłKontakt) pom.rozejscia++;
      byłKontakt = kontakt;

      for (const grupa of grupy) {
        pom.turyUczestnikow += grupa.length;
        if (grupa.length > 1) pom.turyUczestnikowWKontakcie += grupa.length;
        if (grupa.length === 1) {
          const h = grupa[0];
          if (h.status !== 'playing') continue;
          const prev = game.active;
          game.active = h.hid;
          const akcja = decydujWPojedynku(game, h, boty[h.hid]);
          const spent = game.act(akcja);   // własne tempo: nikt na nikogo nie czeka
          game.active = prev;
          if (!spent) { pom.odrzucone++; boty[h.hid].invalidate(); }
          else pom.turyWolne++;
        } else {
          // DEKLARACJE NAJPIERW, WSZYSTKIE - nikt nie widzi cudzego działania
          const akcje = new Map();
          for (const h of grupa) {
            const prev = game.active;
            game.active = h.hid;
            akcje.set(h.hid, decydujWPojedynku(game, h, boty[h.hid]));
            game.active = prev;
          }
          const spent = game.resolveTurn(akcje, grupa);
          pom.turyWspolne++;
          for (const [hid, ok] of spent) if (!ok) { pom.odrzucone++; boty[hid].invalidate(); }
        }
      }

      const mark = game.heroes.map(h => `${h.depth}:${h.x},${h.y}:${h.hp}:${h.xp}`).join('|');
      if (mark !== znak) { znak = mark; ostatniPostep = game.turn; }
      else if (game.turn - ostatniPostep > stallLimit) {
        return wynikDuelu(game, pom, 'stalled', `brak postępu przez ${stallLimit} tur`);
      }
    }
  } catch (e) {
    const r = wynikDuelu(game, pom, 'crash', e.message);
    r.error = e;
    return r;
  }

  if (game.turn >= maxTurns && zyje().length > 0) return wynikDuelu(game, pom, 'stalled', 'limit tur');
  return wynikDuelu(game, pom, 'done', null);
}

function wynikDuelu(game, pom, outcome, reason) {
  pom.ciosyMiedzyGraczami = game.stats.pvpHits;
  pom.przegraneStarcia = game.stats.fightsLost;
  return {
    outcome, reason,
    turns: game.turn,
    heroes: game.heroes.map(h => ({
      name: h.name, status: h.status, cause: h.cause,
      depth: h.depth, hp: h.hp, level: h.level, xp: h.xp,
      kills: h.kills, hasAmulet: h.hasAmulet,
    })),
    ...pom,
  };
}
