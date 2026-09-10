// Atrapa gry złożona z migawki przysłanej przez serwer.
//
// Rysownik (`web/draw.js`) czyta z obiektu gry zadziwiająco mało: rozmiar
// poziomu i rodzaj kafla, położenie własnej postaci, widoczne potwory
// i przedmioty, wyglądy mikstur oraz dwa pytania - czy pole jest widoczne
// i czy zapamiętane. Atrapa odpowiada dokładnie na to, więc TEN SAM rysownik
// obsługuje grę jednoosobową (gdzie dostaje prawdziwy silnik) i wieloosobową
// (gdzie silnik siedzi na serwerze i nigdy nie trafia do przeglądarki).
//
// To jest też granica uczciwości partii: czego nie ma w migawce, tego nie ma
// w przeglądarce - i żadna sztuczka w konsoli tego nie odsłoni.

import { base64ToBytes } from '../src/bytes.js';

export class Cien {
  constructor() {
    this.poziom = null;
    this.kafle = null;        // 0 = nieznane, w przeciwnym razie kod kafla + 1
    this.widoczne = null;
    this.items = [];
    this.monsters = [];
    this.gracze = [];
    this.ja = null;
    this.appearances = { potion: {}, scroll: {} };
    this.identified = new Set();
    this.sniffed = new Set();
    this.messages = [];
    this.kontakt = [];
    // Kto wstrzymuje wspólną turę. Starszy serwer tego nie przysyła i wtedy
    // zostaje `null` - pasek tury jest wtedy uboższy, a nie zepsuty.
    this.tura = null;
    this.pietro = { potwory: 0, smialkowie: 0 };
    this.turn = 0;
    this.hid = null;

    const cien = this;
    // `level` udaje obiekt poziomu z `src/map.js` w zakresie, jakiego wymaga
    // rysownik: szerokość, wysokość i rodzaj kafla pod współrzędnymi.
    this.level = {
      get w() { return cien.poziom ? cien.poziom.w : 0; },
      get h() { return cien.poziom ? cien.poziom.h : 0; },
      at(x, y) {
        if (!cien.kafle || x < 0 || y < 0 || x >= cien.level.w || y >= cien.level.h) return 0;
        const v = cien.kafle[y * cien.level.w + x];
        return v === 0 ? 0 : v - 1;   // nieznane pole wygląda jak lita skała
      },
      idx(x, y) { return y * cien.level.w + x; },
      inBounds(x, y) { return x >= 0 && y >= 0 && x < cien.level.w && y < cien.level.h; },
      isWalkable(x, y) { return cien.level.at(x, y) !== 0 && cien.znane(x, y); },
    };
  }

  get player() { return this.ja; }

  /** Warstwa animacji (`web/view.js`) pyta o głębokość wprost - to ten sam widok. */
  get depth() { return this.poziom ? this.poziom.depth : 0; }
  get maxDepth() { return this.ja ? this.ja.maxDepth : 8; }

  znane(x, y) {
    return !!this.kafle && this.level.inBounds(x, y) && this.kafle[y * this.level.w + x] !== 0;
  }

  isVisible(x, y) {
    return !!this.widoczne && this.level.inBounds(x, y) && this.widoczne[y * this.level.w + x] === 1;
  }

  isRemembered(x, y) { return this.znane(x, y); }

  /** Wchłania migawkę. Kafle przychodzą rzadziej niż reszta, więc brak = bez zmian. */
  wchlon(w) {
    const zmianaPoziomu = !this.poziom || this.poziom.depth !== w.poziom.depth;
    this.poziom = w.poziom;
    if (w.kafle) this.kafle = base64ToBytes(w.kafle);
    else if (zmianaPoziomu) this.kafle = null;   // nowy poziom bez kafli: czekamy na nie
    this.widoczne = base64ToBytes(w.widoczne);
    this.monsters = w.potwory;
    this.items = w.przedmioty;
    this.gracze = w.gracze;
    this.ja = w.ja;
    this.appearances = w.wyglady;
    this.identified = new Set(w.rozpoznane);
    this.sniffed = new Set(w.powachane);
    this.kontakt = w.kontakt;
    this.tura = w.tura ?? null;
    if (w.pietro) this.pietro = w.pietro;
    this.turn = w.turn;
    this.hid = w.hid;
    for (const m of w.dziennik) this.messages.push(m);
    if (this.messages.length > 200) this.messages.splice(0, this.messages.length - 200);
    return this;
  }
}
