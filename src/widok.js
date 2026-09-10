// Widok jednego uczestnika: to, i tylko to, co wolno mu wiedzieć.
//
// W grze jednoosobowej rysownik dostaje po prostu obiekt gry - nie ma przed kim
// niczego chować. W grze wieloosobowej stan trzyma serwer, a każdy uczestnik
// dostaje własną migawkę. Granica jest tu ostra, bo od niej zależy, czy da się
// oszukiwać: migawka nie niesie ani cudzej pamięci terenu, ani potworów spoza
// pola widzenia, ani zawartości cudzego plecaka.
//
// Kształt migawki jest dobrany tak, żeby przeglądarka złożyła z niej ATRAPĘ
// o tym samym kształcie co silnik (`web/cien.js`). Dzięki temu rysownik
// (`web/draw.js`) działa bez jednej zmiany w obu trybach gry.

import { bytesToBase64, base64ToBytes } from './bytes.js';
import { PROG_ZMECZENIA } from './game.js';

/** Kafle, których uczestnik nie pamięta, są zerem - reszta to kod kafla plus jeden. */
function kafleZnane(level, mem) {
  const out = new Uint8Array(level.w * level.h);
  for (let i = 0; i < out.length; i++) if (mem[i] === 1) out[i] = level.tiles[i] + 1;
  return out;
}

/** Widoczne pola jako mapa bitowa - krócej niż lista napisów i tanio się czyta. */
function bityWidoczne(level, visible) {
  const out = new Uint8Array(level.w * level.h);
  for (const key of visible) {
    const [x, y] = key.split(',').map(Number);
    if (x >= 0 && y >= 0 && x < level.w && y < level.h) out[level.idx(x, y)] = 1;
  }
  return out;
}

/**
 * Migawka dla uczestnika `hero`.
 *
 * @param opts.dziennikOd numer pierwszego komunikatu, którego odbiorca jeszcze nie ma
 * @param opts.zKaflami czy dołączyć pamięć terenu (duża, więc wysyłana tylko gdy się zmieniła)
 */
export function widokDla(game, hero, opts = {}) {
  const depth = hero.depth;
  const wpis = game.levels.get(depth);
  const level = wpis.level;
  const mem = game.memoryOf(hero, depth);
  const widoczne = bityWidoczne(level, hero.visible);
  const od = opts.dziennikOd ?? 0;

  const w = {
    turn: game.turn,
    hid: hero.hid,
    poziom: { w: level.w, h: level.h, depth },
    widoczne: bytesToBase64(widoczne),
    // Potwory i przedmioty WYŁĄCZNIE z pól widzianych teraz. Tak samo rysuje
    // to gra jednoosobowa, więc migawka nie daje przewagi ani jej nie odbiera.
    potwory: wpis.monsters
      .filter(m => m.hp > 0 && widoczne[level.idx(m.x, m.y)])
      .map(m => ({
        id: m.id, type: m.type, name: m.name, x: m.x, y: m.y,
        hp: m.hp, maxHp: m.maxHp, asleep: !!m.asleep, boss: !!m.boss,
      })),
    przedmioty: wpis.items
      .filter(i => widoczne[level.idx(i.x, i.y)])
      .map(i => ({ ...i })),
    gracze: game.heroes
      .filter(o => o !== hero && o.status === 'playing' && o.depth === depth && widoczne[level.idx(o.x, o.y)])
      .map(o => ({ hid: o.hid, name: o.name, x: o.x, y: o.y, hp: o.hp, maxHp: o.maxHp })),
    ja: {
      hid: hero.hid, name: hero.name, x: hero.x, y: hero.y,
      hp: hero.hp, maxHp: hero.maxHp, str: hero.str, def: hero.def,
      level: hero.level, xp: hero.xp, hunger: hero.hunger, depth,
      kills: hero.kills, hasAmulet: hero.hasAmulet,
      zmeczenie: hero.zmeczenie || 0, progZmeczenia: PROG_ZMECZENIA,
      atak: game.playerAttack(hero), obrona: game.playerDefense(hero),
      maxDepth: game.maxDepth,
      status: hero.status, cause: hero.cause,
      // Ostatnie przegrane starcie z innym uczestnikiem. Klient pokazuje na to
      // osobny ekran, więc pole jedzie w migawce zamiast być odczytywane
      // z brzmienia komunikatu w dzienniku.
      przegrana: hero.przegrana || null, przegranaTura: hero.przegranaTura ?? null,
      inventory: hero.inventory.map(i => ({ ...i })),
      plecak: { ...hero.plecak },
      weapon: hero.weapon ? { ...hero.weapon } : null,
      armor: hero.armor ? { ...hero.armor } : null,
    },
    wyglady: game.appearances,
    rozpoznane: [...hero.identified],
    powachane: [...hero.sniffed],
    dziennik: hero.messages.slice(od).map(m => ({ ...m })),
    dziennikDo: hero.messages.length,
    kontakt: game.contacts(hero).map(o => ({ hid: o.hid, name: o.name })),
    // Kto wstrzymuje wspólną turę. Wypełnia to stół, bo sama gra nie wie nic
    // o deklaracjach ani o zegarze; przy grze jednoosobowej pola po prostu nie ma.
    tura: opts.tura ?? null,
    // Zaludnienie piętra: liczba ZBIORCZA, bez położeń i bez imion. Odpowiada na
    // pytanie „czy jest tu z kim walczyć", a nie „gdzie oni są" - więc nie daje
    // przewagi, której nie dałoby nadstawienie ucha w prawdziwym lochu.
    pietro: {
      potwory: wpis.monsters.filter(m => m.hp > 0).length,
      smialkowie: game.heroes.filter(o => o.status === 'playing' && o.depth === depth).length,
    },
  };
  if (opts.zKaflami !== false) w.kafle = bytesToBase64(kafleZnane(level, mem));
  return w;
}

/** Odwrotność `bityWidoczne` - używa jej atrapa w przeglądarce i testy. */
export function rozpakuj(b64) { return base64ToBytes(b64); }
