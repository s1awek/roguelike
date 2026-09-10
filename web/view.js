// Stan wizualny, którego silnik NIE zna i znać nie musi.
//
// Gra jest turowa i skokowa: po `act()` postać stoi już na nowym polu. Oko tego
// nie lubi, więc każdy byt ma tu swojego "ducha" - pozycję rysowaną, która goni
// pozycję logiczną. Dzięki temu warstwa graficzna nie wymaga ani jednej zmiany
// w silniku i nie może go zepsuć: czyta stan, nigdy go nie zapisuje.
//
// Obrażenia wykrywane są przez PORÓWNANIE PUNKTÓW ŻYCIA między turami, a nie
// przez czytanie komunikatów. Parsowanie polskich zdań z dziennika psułoby się
// przy każdej zmianie brzmienia tekstu.

const EASE_TIME = 0.055;   // sekundy do pokonania większości dystansu
const FLASH_TIME = 0.28;
const FLOAT_TIME = 0.9;
const PUFF_TIME = 0.38;

export class View {
  constructor() {
    this.sprites = new Map();   // id -> duch bytu
    this.floaters = [];         // ulatujące liczby obrażeń
    this.puffs = [];            // obłoczki po zabitych
    this.shake = 0;
    this.time = 0;
    this.depth = null;
    this.lastPlayerHp = null;
    this.facing = { dx: 0, dy: 1 };
    this.lastPlayerPos = null;
  }

  reset() {
    this.sprites.clear();
    this.floaters.length = 0;
    this.puffs.length = 0;
    this.shake = 0;
  }

  sprite(id, x, y) {
    let s = this.sprites.get(id);
    if (!s) {
      s = { id, x, y, tx: x, ty: y, flash: 0, hp: null };
      this.sprites.set(id, s);
    }
    return s;
  }

  floater(x, y, text, color) {
    this.floaters.push({ x, y, text, color, t: 0 });
  }

  /** Wywoływane po KAŻDEJ turze. Porównuje świat z poprzednim odczytem. */
  sync(game) {
    // Zmiana poziomu to inny świat - duchy ze starego poziomu nie mają dokąd lecieć.
    if (this.depth !== game.depth) {
      this.reset();
      this.depth = game.depth;
      this.lastPlayerHp = game.player.hp;
    }

    const p = game.player;
    const ps = this.sprite('@', p.x, p.y);
    if (this.lastPlayerPos && (this.lastPlayerPos.x !== p.x || this.lastPlayerPos.y !== p.y)) {
      const dx = Math.sign(p.x - this.lastPlayerPos.x);
      const dy = Math.sign(p.y - this.lastPlayerPos.y);
      if (dx || dy) this.facing = { dx, dy };
    }
    this.lastPlayerPos = { x: p.x, y: p.y };
    ps.tx = p.x; ps.ty = p.y;

    if (this.lastPlayerHp !== null && p.hp !== this.lastPlayerHp) {
      const d = p.hp - this.lastPlayerHp;
      if (d < 0) {
        ps.flash = FLASH_TIME;
        this.floater(p.x, p.y, String(d), '#ff5f6d');
        this.shake = Math.min(1, 0.35 + Math.abs(d) / p.maxHp * 2.2);
      } else {
        this.floater(p.x, p.y, `+${d}`, '#6ee7a8');
      }
    }
    this.lastPlayerHp = p.hp;

    // Potwory: nowe dostają ducha na miejscu, ranne migają, zabite zostawiają obłoczek.
    const alive = new Set(['@']);
    for (const m of game.monsters) {
      if (m.hp <= 0) continue;
      const id = `m${m.id}`;
      alive.add(id);
      const s = this.sprite(id, m.x, m.y);
      s.tx = m.x; s.ty = m.y;
      // Potwór poruszający się poza polem widzenia nie może "przelecieć" przez
      // ekran w chwili, gdy gracz go zobaczy - stąd przyklejenie ducha do celu.
      if (!game.isVisible(m.x, m.y)) { s.x = m.x; s.y = m.y; }
      if (s.hp !== null && m.hp < s.hp) {
        s.flash = FLASH_TIME;
        if (game.isVisible(m.x, m.y)) this.floater(m.x, m.y, String(m.hp - s.hp), '#ffd166');
      }
      s.hp = m.hp;
    }

    for (const [id, s] of this.sprites) {
      if (alive.has(id)) continue;
      this.puffs.push({ x: s.x, y: s.y, t: 0 });
      this.sprites.delete(id);
    }
  }

  /** Wywoływane w każdej klatce, niezależnie od tur. */
  step(dt) {
    this.time += dt;
    const k = 1 - Math.exp(-dt / EASE_TIME);
    for (const s of this.sprites.values()) {
      s.x += (s.tx - s.x) * k;
      s.y += (s.ty - s.y) * k;
      if (Math.abs(s.tx - s.x) < 0.004) s.x = s.tx;
      if (Math.abs(s.ty - s.y) < 0.004) s.y = s.ty;
      if (s.flash > 0) s.flash = Math.max(0, s.flash - dt);
    }
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter(f => f.t < FLOAT_TIME);
    for (const q of this.puffs) q.t += dt;
    this.puffs = this.puffs.filter(q => q.t < PUFF_TIME);
    this.shake = Math.max(0, this.shake - dt * 3.5);
  }

  floatProgress(f) { return f.t / FLOAT_TIME; }
  puffProgress(q) { return q.t / PUFF_TIME; }
  flashAlpha(s) { return s.flash / FLASH_TIME; }
}
