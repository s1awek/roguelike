// Rysowanie lochu na płótnie. Zero plików graficznych - każdy kafel, potwór
// i przedmiot jest wektorem liczonym z kodu.
//
// Trzy reguły, z których wynika cała reszta:
//   1. Rysujemy DOKŁADNIE to, co widzi wersja terminalowa: pole widoczne, pole
//      tylko pamiętane, pole nieznane. Grafika nie może dawać przewagi.
//   2. Jasność kafla liczy się z odległości od gracza, więc krąg światła powstaje
//      sam z siebie, bez nakładki przyciemniającej ekran.
//   3. Kolory składane są z HSL i buforowane po skwantowanej jasności - inaczej
//      przy 76x20 kaflach i 60 klatkach szłoby ~90 tys. sklejeń napisów na sekundę.

import { WALL, FLOOR, STAIRS_DOWN, STAIRS_UP } from '../src/map.js';
import { FOV_RADIUS } from '../src/game.js';

const BG = '#06070b';
const LIGHT_STEPS = 40;
const PREF_TILE = 30;   // rozmiar kafla, przy którym sylwetki są czytelne
const MAX_TILE = 44;

const P = {
  wall:      { h: 226, s: 16, l: 26 },
  wallTop:   { h: 32,  s: 16, l: 42 },
  wallDark:  { h: 228, s: 22, l: 7 },
  floor:     { h: 30,  s: 10, l: 36 },
  floorGrid: { h: 228, s: 14, l: 20 },
  stairsD:   { h: 268, s: 34, l: 40 },
  stairsU:   { h: 186, s: 30, l: 40 },
};

// Pola pamiętane, ale niewidoczne, są nie tylko ciemniejsze - są ZIMNE.
// Ciepło ma wyłącznie to, co gracz widzi teraz.
const MEMORY_FLOOR = 0.34;
const MEMORY_WALL = 0.30;
const MEMORY_SAT = 0.30;

function hash2(x, y) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}

/** Bufor kolorów: klucz to nazwa barwy + krok jasności + czy zimna. */
const colorCache = new Map();
function tone(name, light, cold) {
  const step = Math.max(0, Math.min(LIGHT_STEPS, Math.round(light * LIGHT_STEPS)));
  const key = `${name}${step}${cold ? 'c' : 'w'}`;
  let c = colorCache.get(key);
  if (c) return c;
  const base = P[name];
  const f = step / LIGHT_STEPS;
  const sat = cold ? base.s * MEMORY_SAT : base.s;
  const hue = cold ? 218 : base.h;
  c = `hsl(${hue.toFixed(0)} ${sat.toFixed(0)}% ${(base.l * f).toFixed(1)}%)`;
  colorCache.set(key, c);
  return c;
}

const MONSTER_COLOR = {
  rat: '#8b8f9a', bat: '#b57edc', kobold: '#c9a227', goblin: '#5fa855',
  skeleton: '#e8e6df', orc: '#7ec850', ogre: '#e0b341', troll: '#4fc3c7',
  wraith: '#9a7bd0', dragon: '#ff4d4d',
};

// Barwa mikstury bierze się z jej WYGLĄDU, nie z działania - dokładnie tak,
// jak w mechanice: dopóki gracz nie spróbuje, kolor nic nie zdradza.
const POTION_COLOR = {
  'czerwona': '#e0413f', 'błękitna': '#4fa8e0', 'zielona': '#4fb35e',
  'perlista': '#e8e4dc', 'mętna': '#8a8757', 'bursztynowa': '#e0952b',
  'srebrzysta': '#c3ccd6', 'czarna': '#2b2b33',
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tile = 20;
    this.ox = 0;
    this.oy = 0;
    this.dpr = 1;
    this.follow = false;
    this.camX = null;
    this.camY = 0;
    this.minimap = true;
    this.miniRect = null;   // ustawiane przy rysowaniu; potrzebne do trafien myszy
  }

  /** Dopasowuje płótno do kontenera. Cały poziom mieści się bez przewijania. */
  resize(game) {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(200, Math.floor(rect.height));
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.dpr = dpr;
    this.cssW = w;
    this.cssH = h;

    const L = game.level;
    const fit = Math.min(w / L.w, h / L.h);
    // Poziom ma 76 kolumn na 20 wierszy. Zmieszczenie go w całości daje na
    // typowym ekranie kafle po ~18 px i grę tonącą w czerni - poniżej progu
    // czytelności przełączamy się na kamerę idącą za graczem. Nic to nie
    // odsłania: kamera pokazuje wyłącznie to, co i tak jest widoczne albo
    // zapamiętane, więc wersja graficzna nie daje przewagi nad terminalową.
    this.follow = fit < PREF_TILE;
    this.tile = this.follow ? PREF_TILE : Math.max(9, Math.floor(Math.min(fit, MAX_TILE)));
    this.camX = null;   // pierwsza klatka po zmianie rozmiaru ustawia się bez animacji
  }

  /** Przesunięcie rysunku wobec płótna. Liczone co klatkę, bo kamera płynie. */
  updateCamera(game, ps, dt) {
    const L = game.level;
    const t = this.tile;
    const mapW = L.w * t;
    const mapH = L.h * t;
    let tx, ty;
    if (this.follow && mapW > this.cssW) {
      tx = Math.min(0, Math.max(this.cssW - mapW, this.cssW / 2 - (ps.x + 0.5) * t));
    } else tx = (this.cssW - mapW) / 2;
    if (this.follow && mapH > this.cssH) {
      ty = Math.min(0, Math.max(this.cssH - mapH, this.cssH / 2 - (ps.y + 0.5) * t));
    } else ty = (this.cssH - mapH) / 2;

    if (this.camX === null) { this.camX = tx; this.camY = ty; }
    else {
      const k = 1 - Math.exp(-dt / 0.09);
      this.camX += (tx - this.camX) * k;
      this.camY += (ty - this.camY) * k;
    }
    this.ox = Math.round(this.camX);
    this.oy = Math.round(this.camY);
  }

  /** Pole mapy pod punktem ekranu - potrzebne przy sterowaniu myszą. */
  tileAt(px, py) {
    const x = Math.floor((px - this.ox) / this.tile);
    const y = Math.floor((py - this.oy) / this.tile);
    return { x, y };
  }

  draw(game, view, dt = 0.016) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    if (view.shake > 0.001) {
      const a = view.shake * 5;
      ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
    }

    const flicker = 1 + 0.030 * Math.sin(view.time * 7.3) + 0.018 * Math.sin(view.time * 3.1 + 1.4);
    const ps = view.sprites.get('@') || { x: game.player.x, y: game.player.y };
    this.updateCamera(game, ps, dt);

    this.drawTiles(game, ps, flicker);
    this.drawItems(game, ps, flicker, view);
    this.drawMonsters(game, view, ps, flicker);
    this.drawPlayer(game, view, ps);
    this.drawOthers(game, view);
    this.drawEffects(view);

    // Minimapa rysuje sie PO zdjeciu wstrzasu - inaczej trzeslaby sie razem
    // z lochem, a jest elementem panelu, nie swiata.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawMinimap(game, view);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  lightAt(x, y, ps, flicker) {
    const d = Math.hypot(x - ps.x, y - ps.y);
    const f = 1 - d / (FOV_RADIUS + 2.2);
    return Math.max(0.30, Math.min(1, 0.32 + f * 0.88)) * flicker;
  }

  // ---------- minimapa ----------

  /**
   * Plan poziomu w rogu ekranu. Pokazuje WYLACZNIE to, co gracz widzi teraz albo
   * pamieta z wczesniej - dokladnie ten sam warunek, co przy rysowaniu kafli.
   * Gdyby rysowala caly poziom, bylaby wykrywaczem korytarzy i wersja graficzna
   * dawalaby przewage nad terminalowa.
   *
   * Ruchome byty (potwory, przedmioty) trafiaja na plan tylko wtedy, gdy sa
   * WIDOCZNE. Pamiec dotyczy uksztaltowania lochu, nie tego, kto po nim chodzi.
   */
  drawMinimap(game, view) {
    if (!this.minimap) { this.miniRect = null; return; }
    const L = game.level;
    const s = Math.max(2, Math.min(5, Math.floor((this.cssW * 0.30) / L.w)));
    const pad = 6;
    const w = L.w * s + pad * 2;
    const h = L.h * s + pad * 2;
    // Przy waskim oknie plan zjadlby polowe planszy - wtedy go nie ma.
    if (w > this.cssW * 0.62 || h > this.cssH * 0.5) { this.miniRect = null; return; }
    const x0 = Math.round(this.cssW - w - 12);
    const y0 = 12;
    this.miniRect = { x: x0, y: y0, w, h, s, pad };

    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,16,.82)';
    ctx.strokeStyle = 'rgba(46,53,72,.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1, 7);
    ctx.fill();
    ctx.stroke();

    // Kafle skladane w jedna sciezke na kolor. Naiwne fillRect z osobnym
    // ustawieniem koloru to przy 1520 kaflach i 60 klatkach ~90 tys. zmian
    // stanu plotna na sekunde.
    const groups = new Map();
    const put = (col, x, y) => {
      let a = groups.get(col);
      if (!a) { a = []; groups.set(col, a); }
      a.push(x, y);
    };
    for (let y = 0; y < L.h; y++) {
      for (let x = 0; x < L.w; x++) {
        const vis = game.isVisible(x, y);
        if (!vis && !game.isRemembered(x, y)) continue;
        const t = L.at(x, y);
        let col;
        if (t === STAIRS_DOWN) col = vis ? '#c08cff' : '#7b5ba8';
        else if (t === STAIRS_UP) col = vis ? '#6fe0e8' : '#468f95';
        else if (t === WALL) col = vis ? '#3c4460' : '#242a3a';
        else col = vis ? '#7a8298' : '#3d4457';
        put(col, x, y);
      }
    }
    for (const [col, pts] of groups) {
      ctx.fillStyle = col;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) {
        ctx.rect(x0 + pad + pts[i] * s, y0 + pad + pts[i + 1] * s, s, s);
      }
      ctx.fill();
    }

    // Wycinek planszy widoczny na ekranie - zeby bylo wiadomo, gdzie sie jest
    // wobec calosci. Rysowany tylko wtedy, gdy kamera faktycznie kadruje.
    if (this.follow) {
      const vx = Math.max(0, -this.ox / this.tile);
      const vy = Math.max(0, -this.oy / this.tile);
      const vw = Math.min(L.w - vx, this.cssW / this.tile);
      const vh = Math.min(L.h - vy, this.cssH / this.tile);
      ctx.strokeStyle = 'rgba(255,205,130,.30)';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        Math.round(x0 + pad + vx * s) + 0.5, Math.round(y0 + pad + vy * s) + 0.5,
        Math.round(vw * s), Math.round(vh * s));
    }

    const dot = (x, y, col, k) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x0 + pad + (x + 0.5) * s, y0 + pad + (y + 0.5) * s, Math.max(1.2, s * k), 0, Math.PI * 2);
      ctx.fill();
    };

    for (const it of game.items) {
      if (game.isVisible(it.x, it.y)) dot(it.x, it.y, '#ffd666', 0.42);
    }
    for (const m of game.monsters) {
      if (m.hp > 0 && game.isVisible(m.x, m.y)) dot(m.x, m.y, '#ff5f6d', 0.55);
    }

    const p = game.player;
    const pulse = 0.75 + 0.25 * Math.sin(view.time * 3.4);
    ctx.strokeStyle = `rgba(255,205,130,${0.85 * pulse})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x0 + pad + (p.x + 0.5) * s, y0 + pad + (p.y + 0.5) * s, Math.max(2.6, s * 1.25), 0, Math.PI * 2);
    ctx.stroke();
    dot(p.x, p.y, '#f6f4ee', 0.5);

    ctx.restore();
  }

  /** Czy punkt ekranu trafia w minimape (klikniecie ma tam znaczyc co innego). */
  inMinimap(px, py) {
    const r = this.miniRect;
    return !!r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  /** Pole lochu pod punktem minimapy - marsz da sie zlecic takze z planu. */
  minimapTileAt(px, py) {
    const r = this.miniRect;
    if (!r) return null;
    return {
      x: Math.floor((px - r.x - r.pad) / r.s),
      y: Math.floor((py - r.y - r.pad) / r.s),
    };
  }

  // ---------- podłoże ----------

  drawTiles(game, ps, flicker) {
    const ctx = this.ctx;
    const L = game.level;
    const t = this.tile;

    const x0 = Math.max(0, Math.floor(-this.ox / t) - 1);
    const x1 = Math.min(L.w - 1, Math.ceil((this.cssW - this.ox) / t));
    const y0 = Math.max(0, Math.floor(-this.oy / t) - 1);
    const y1 = Math.min(L.h - 1, Math.ceil((this.cssH - this.oy) / t));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const vis = game.isVisible(x, y);
        const mem = game.isRemembered(x, y);
        if (!vis && !mem) continue;

        const isWall = L.at(x, y) === WALL;
        const light = vis ? this.lightAt(x, y, ps, flicker) : (isWall ? MEMORY_WALL : MEMORY_FLOOR);
        const cold = !vis;
        const px = this.ox + x * t;
        const py = this.oy + y * t;
        const tt = L.at(x, y);
        const n = hash2(x, y);

        if (isWall) {
          this.drawWall(px, py, t, light * (0.9 + n * 0.2), cold, n, L, x, y, game);
        } else {
          ctx.fillStyle = tone('floor', light * (0.86 + n * 0.28), cold);
          ctx.fillRect(px, py, t, t);
          if (vis && t >= 16) {
            ctx.strokeStyle = tone('floorGrid', light * 0.5, cold);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px + t - 0.5, py);
            ctx.lineTo(px + t - 0.5, py + t);
            ctx.moveTo(px, py + t - 0.5);
            ctx.lineTo(px + t, py + t - 0.5);
            ctx.stroke();
          }
          if (tt === STAIRS_DOWN) this.drawStairs(px, py, t, light, cold, true);
          else if (tt === STAIRS_UP) this.drawStairs(px, py, t, light, cold, false);
        }
      }
    }

    // Ściany rzucają cień na podłogę pod sobą. To jedyne miejsce, gdzie rysunek
    // wychodzi poza swój kafel - i jedyny powód, dla którego loch ma głębię.
    for (let y = y0; y <= Math.min(y1, L.h - 2); y++) {
      for (let x = x0; x <= x1; x++) {
        if (L.at(x, y) !== WALL) continue;
        if (L.at(x, y + 1) === WALL) continue;
        const vis = game.isVisible(x, y + 1);
        if (!vis && !game.isRemembered(x, y + 1)) continue;
        const px = this.ox + x * t;
        const py = this.oy + (y + 1) * t;
        const g = ctx.createLinearGradient(0, py, 0, py + t * 0.55);
        g.addColorStop(0, `rgba(0,0,0,${vis ? 0.45 : 0.3})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px, py, t, t * 0.55);
      }
    }
  }

  drawWall(px, py, t, light, cold, n, L, x, y, game) {
    const ctx = this.ctx;
    ctx.fillStyle = tone('wall', light, cold);
    ctx.fillRect(px, py, t, t);

    // Rozświetlone jest LICO ściany, czyli ta jej strona, która wychodzi na
    // podłogę - stąd sprawdzenie kafla POD ścianą, nie nad nią. Pierwsza wersja
    // patrzyła w górę i przez to w pokoju nie rozświetlała niczego: nad ścianą
    // pokoju stoi lita skała, więc warunek nigdy nie był spełniony, a pokoje
    // wyglądały jak ciepłe plamy bez ścian.
    const faceBelow = y + 1 < L.h && L.at(x, y + 1) !== WALL;
    if (faceBelow) {
      ctx.fillStyle = tone('wallTop', light, cold);
      ctx.fillRect(px, py + t - Math.max(3, t * 0.26), t, Math.max(3, t * 0.26));
    }
    // Ściana widziana z boku dostaje cieńszy pasek, żeby pokój miał obrys
    // także tam, gdzie lica nie widać.
    const sideL = x > 0 && L.at(x - 1, y) !== WALL;
    const sideR = x + 1 < L.w && L.at(x + 1, y) !== WALL;
    if (sideL || sideR) {
      ctx.fillStyle = tone('wallTop', light * 0.62, cold);
      if (sideL) ctx.fillRect(px, py, Math.max(2, t * 0.14), t);
      if (sideR) ctx.fillRect(px + t - Math.max(2, t * 0.14), py, Math.max(2, t * 0.14), t);
    }
    const faceAbove = y > 0 && L.at(x, y - 1) !== WALL;
    if (faceAbove) {
      ctx.fillStyle = tone('wallDark', light, cold);
      ctx.fillRect(px, py, t, Math.max(2, t * 0.14));
    }

    if (t >= 18 && n > 0.88) {
      ctx.strokeStyle = tone('wallDark', light * 1.15, cold);
      ctx.lineWidth = 1;
      ctx.beginPath();
      const sx = px + t * (0.3 + n * 0.25);
      ctx.moveTo(sx, py + t * 0.38);
      ctx.lineTo(sx + t * 0.12, py + t * 0.6);
      ctx.stroke();
    }
  }

  drawStairs(px, py, t, light, cold, down) {
    const ctx = this.ctx;
    const name = down ? 'stairsD' : 'stairsU';
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const f = i / steps;
      const inset = t * 0.10 + f * t * 0.14;
      const l = down ? light * (1 - f * 0.75) : light * (0.45 + f * 0.85);
      ctx.fillStyle = tone(name, l, cold);
      ctx.fillRect(px + inset, py + inset, t - inset * 2, t - inset * 2);
    }
  }

  // ---------- przedmioty ----------

  drawItems(game, ps, flicker, view) {
    const ctx = this.ctx;
    const t = this.tile;
    for (const it of game.items) {
      if (!game.isVisible(it.x, it.y)) continue;
      const light = this.lightAt(it.x, it.y, ps, flicker);
      const cx = this.ox + it.x * t + t / 2;
      const cy = this.oy + it.y * t + t / 2;
      ctx.save();
      ctx.globalAlpha = Math.min(1, 0.45 + light * 0.7);
      this.drawItemShape(ctx, it, cx, cy, t, game, view);
      ctx.restore();
    }
  }

  drawItemShape(ctx, it, cx, cy, t, game, view) {
    const r = t * 0.5;
    switch (it.kind) {
      case 'potion': {
        const look = game.appearances.potion[it.type];
        const col = POTION_COLOR[look] || '#c04';
        ctx.fillStyle = '#cdd3dd';
        ctx.fillRect(cx - r * 0.16, cy - r * 0.72, r * 0.32, r * 0.34);
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.20, cy - r * 0.42);
        ctx.quadraticCurveTo(cx - r * 0.62, cy - r * 0.05, cx - r * 0.44, cy + r * 0.5);
        ctx.lineTo(cx + r * 0.44, cy + r * 0.5);
        ctx.quadraticCurveTo(cx + r * 0.62, cy - r * 0.05, cx + r * 0.20, cy - r * 0.42);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(cx - r * 0.30, cy - r * 0.05, r * 0.12, r * 0.4);
        break;
      }
      case 'scroll': {
        const look = game.appearances.scroll[it.type] || it.type;
        const seal = `hsl(${Math.floor(hashStr(look) * 360)} 62% 52%)`;
        ctx.fillStyle = '#ddd6c2';
        ctx.fillRect(cx - r * 0.5, cy - r * 0.42, r, r * 0.84);
        ctx.fillStyle = '#b6ad95';
        ctx.fillRect(cx - r * 0.62, cy - r * 0.5, r * 0.18, r);
        ctx.fillRect(cx + r * 0.44, cy - r * 0.5, r * 0.18, r);
        ctx.fillStyle = seal;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.18, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'weapon': {
        ctx.strokeStyle = '#9fd8e8';
        ctx.lineWidth = Math.max(1.5, r * 0.18);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.42, cy + r * 0.5);
        ctx.lineTo(cx + r * 0.42, cy - r * 0.52);
        ctx.stroke();
        ctx.strokeStyle = '#6d7a86';
        ctx.lineWidth = Math.max(1.5, r * 0.16);
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.38, cy - r * 0.04);
        ctx.lineTo(cx + r * 0.10, cy + r * 0.36);
        ctx.stroke();
        break;
      }
      case 'armor': {
        ctx.fillStyle = '#5b86c4';
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.5, cy - r * 0.42);
        ctx.lineTo(cx + r * 0.5, cy - r * 0.42);
        ctx.lineTo(cx + r * 0.38, cy + r * 0.34);
        ctx.quadraticCurveTo(cx, cy + r * 0.68, cx - r * 0.38, cy + r * 0.34);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.42);
        ctx.lineTo(cx, cy + r * 0.5);
        ctx.stroke();
        break;
      }
      case 'food': {
        if (it.type === 'apple') {
          ctx.fillStyle = '#cf4b3a';
          ctx.beginPath();
          ctx.arc(cx, cy + r * 0.08, r * 0.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#6a4a2a';
          ctx.lineWidth = Math.max(1, r * 0.1);
          ctx.beginPath();
          ctx.moveTo(cx, cy - r * 0.3);
          ctx.lineTo(cx + r * 0.16, cy - r * 0.56);
          ctx.stroke();
        } else {
          ctx.fillStyle = '#b98b4a';
          ctx.fillRect(cx - r * 0.46, cy - r * 0.3, r * 0.92, r * 0.62);
          ctx.strokeStyle = '#e2c58e';
          ctx.lineWidth = Math.max(1, r * 0.12);
          ctx.beginPath();
          ctx.moveTo(cx - r * 0.46, cy);
          ctx.lineTo(cx + r * 0.46, cy);
          ctx.stroke();
        }
        break;
      }
      case 'amulet': {
        const pulse = 0.7 + 0.3 * Math.sin(view.time * 3);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.9);
        g.addColorStop(0, `rgba(255,214,102,${0.5 * pulse})`);
        g.addColorStop(1, 'rgba(255,214,102,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
        ctx.strokeStyle = '#f0d27a';
        ctx.lineWidth = Math.max(1.2, r * 0.13);
        ctx.beginPath();
        ctx.arc(cx, cy - r * 0.12, r * 0.42, Math.PI * 0.15, Math.PI * 0.85, true);
        ctx.stroke();
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath();
        ctx.moveTo(cx, cy + r * 0.14);
        ctx.lineTo(cx + r * 0.24, cy + r * 0.42);
        ctx.lineTo(cx, cy + r * 0.68);
        ctx.lineTo(cx - r * 0.24, cy + r * 0.42);
        ctx.closePath();
        ctx.fill();
        break;
      }
      default: {
        ctx.fillStyle = '#ccc';
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---------- potwory ----------

  drawMonsters(game, view, ps, flicker) {
    const ctx = this.ctx;
    const t = this.tile;
    for (const m of game.monsters) {
      if (m.hp <= 0) continue;
      if (!game.isVisible(m.x, m.y)) continue;
      const s = view.sprites.get(`m${m.id}`) || { x: m.x, y: m.y, flash: 0 };
      const cx = this.ox + s.x * t + t / 2;
      const cy = this.oy + s.y * t + t / 2;
      const light = this.lightAt(m.x, m.y, ps, flicker);
      const col = MONSTER_COLOR[m.type] || '#d05';

      const scale = m.boss ? 1.5 : 1;

      // Cień pod nogami. Bez niego sylwetka wygląda, jakby wisiała nad podłogą.
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(cx, cy + t * 0.40 * scale, t * 0.30 * scale, t * 0.10 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = m.asleep ? 0.55 : Math.min(1, 0.55 + light * 0.6);
      this.scaled(cx, cy, scale * 1.18, () => {
        // Ciemna kopia sylwetki pod spodem robi obrys jednym pociągnięciem -
        // taniej i pewniej niż obrysowywanie każdej ścieżki z osobna.
        this.drawMonsterShape(ctx, m, cx, cy, t, '#05060a', view, { silhouette: true });
      });
      this.scaled(cx, cy, scale, () => this.drawMonsterShape(ctx, m, cx, cy, t, col, view));
      ctx.restore();

      if (view.flashAlpha(s) > 0) {
        ctx.save();
        ctx.globalAlpha = view.flashAlpha(s) * 0.85;
        ctx.globalCompositeOperation = 'lighter';
        this.scaled(cx, cy, scale, () => this.drawMonsterShape(ctx, m, cx, cy, t, '#ffffff', view, { silhouette: true }));
        ctx.restore();
      }

      if (m.hp < m.maxHp) this.drawHpPip(cx, cy - t * 0.52 * scale, t * 0.72 * scale, m.hp / m.maxHp);
      if (m.asleep && t >= 14) {
        ctx.fillStyle = 'rgba(200,215,255,0.75)';
        ctx.font = `${Math.round(t * 0.42)}px ui-monospace, monospace`;
        ctx.textAlign = 'left';
        ctx.fillText('z', cx + t * 0.26, cy - t * 0.26);
      }
    }
  }

  /** Rysuje `fn` powiększone wokół punktu (cx, cy). */
  scaled(cx, cy, k, fn) {
    if (k === 1) return fn();
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(k, k);
    ctx.translate(-cx, -cy);
    fn();
    ctx.restore();
  }

  drawHpPip(cx, cy, w, frac) {
    const ctx = this.ctx;
    const h = Math.max(2, this.tile * 0.09);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(cx - w / 2, cy, w, h);
    ctx.fillStyle = frac > 0.5 ? '#6ee7a8' : frac > 0.25 ? '#ffd166' : '#ff5f6d';
    ctx.fillRect(cx - w / 2, cy, w * frac, h);
  }

  drawMonsterShape(ctx, m, cx, cy, t, col, view, opts = {}) {
    const r = t * 0.5;
    // W trybie sylwetki cała bryła ma jeden kolor - to ona robi obrys.
    const detail = (c) => (opts.silhouette ? col : c);
    ctx.fillStyle = col;
    ctx.strokeStyle = col;

    switch (m.type) {
      case 'rat':
        ctx.beginPath();
        ctx.ellipse(cx - r * 0.05, cy + r * 0.14, r * 0.46, r * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + r * 0.38, cy + r * 0.02, r * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = Math.max(1, r * 0.1);
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.48, cy + r * 0.14);
        ctx.quadraticCurveTo(cx - r * 0.9, cy + r * 0.1, cx - r * 0.78, cy - r * 0.3);
        ctx.stroke();
        break;

      case 'bat': {
        const flap = Math.sin(view.time * 9 + m.id) * 0.28;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx - r * 0.9, cy - r * (0.1 + flap));
        ctx.lineTo(cx - r * 0.32, cy + r * 0.34);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + r * 0.9, cy - r * (0.1 + flap));
        ctx.lineTo(cx + r * 0.32, cy + r * 0.34);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'kobold':
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.62);
        ctx.lineTo(cx + r * 0.4, cy + r * 0.52);
        ctx.lineTo(cx - r * 0.4, cy + r * 0.52);
        ctx.closePath();
        ctx.fill();
        break;

      case 'goblin':
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.56);
        ctx.lineTo(cx + r * 0.54, cy + r * 0.5);
        ctx.lineTo(cx - r * 0.54, cy + r * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.3, cy - r * 0.1);
        ctx.lineTo(cx - r * 0.72, cy - r * 0.4);
        ctx.lineTo(cx - r * 0.26, cy + r * 0.1);
        ctx.closePath();
        ctx.moveTo(cx + r * 0.3, cy - r * 0.1);
        ctx.lineTo(cx + r * 0.72, cy - r * 0.4);
        ctx.lineTo(cx + r * 0.26, cy + r * 0.1);
        ctx.closePath();
        ctx.fill();
        break;

      case 'skeleton':
        ctx.beginPath();
        ctx.arc(cx, cy - r * 0.08, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(cx - r * 0.26, cy + r * 0.3, r * 0.52, r * 0.24);
        ctx.fillStyle = detail('#14161c');
        ctx.beginPath();
        ctx.arc(cx - r * 0.16, cy - r * 0.12, r * 0.12, 0, Math.PI * 2);
        ctx.arc(cx + r * 0.16, cy - r * 0.12, r * 0.12, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'orc':
      case 'ogre': {
        const big = m.type === 'ogre' ? 1.16 : 1;
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.5 * big, cy + r * 0.56);
        ctx.lineTo(cx - r * 0.56 * big, cy - r * 0.18);
        ctx.quadraticCurveTo(cx, cy - r * 0.72 * big, cx + r * 0.56 * big, cy - r * 0.18);
        ctx.lineTo(cx + r * 0.5 * big, cy + r * 0.56);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = detail('#f2f0e8');
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.22, cy + r * 0.16);
        ctx.lineTo(cx - r * 0.12, cy + r * 0.44);
        ctx.lineTo(cx - r * 0.04, cy + r * 0.16);
        ctx.closePath();
        ctx.moveTo(cx + r * 0.22, cy + r * 0.16);
        ctx.lineTo(cx + r * 0.12, cy + r * 0.44);
        ctx.lineTo(cx + r * 0.04, cy + r * 0.16);
        ctx.closePath();
        ctx.fill();
        break;
      }

      case 'troll':
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.62, cy + r * 0.58);
        ctx.lineTo(cx - r * 0.5, cy - r * 0.24);
        ctx.lineTo(cx - r * 0.24, cy - r * 0.6);
        ctx.lineTo(cx - r * 0.02, cy - r * 0.3);
        ctx.lineTo(cx + r * 0.24, cy - r * 0.66);
        ctx.lineTo(cx + r * 0.5, cy - r * 0.2);
        ctx.lineTo(cx + r * 0.62, cy + r * 0.58);
        ctx.closePath();
        ctx.fill();
        break;

      case 'wraith': {
        const drift = Math.sin(view.time * 2 + m.id) * r * 0.06;
        ctx.globalAlpha *= 0.82;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.68 + drift);
        ctx.quadraticCurveTo(cx + r * 0.62, cy - r * 0.1, cx + r * 0.42, cy + r * 0.6);
        ctx.quadraticCurveTo(cx, cy + r * 0.32, cx - r * 0.42, cy + r * 0.6);
        ctx.quadraticCurveTo(cx - r * 0.62, cy - r * 0.1, cx, cy - r * 0.68 + drift);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = detail('#fff');
        ctx.beginPath();
        ctx.arc(cx - r * 0.16, cy - r * 0.16 + drift, r * 0.08, 0, Math.PI * 2);
        ctx.arc(cx + r * 0.16, cy - r * 0.16 + drift, r * 0.08, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'dragon': {
        if (!opts.silhouette) {
          const pulse = 0.75 + 0.25 * Math.sin(view.time * 2.6);
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.8);
          g.addColorStop(0, `rgba(255,86,58,${0.5 * pulse})`);
          g.addColorStop(1, 'rgba(255,86,58,0)');
          ctx.fillStyle = g;
          ctx.fillRect(cx - r * 3, cy - r * 3, r * 6, r * 6);
        }
        ctx.fillStyle = col;
        const flap = Math.sin(view.time * 3.2) * 0.2;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.1);
        ctx.lineTo(cx - r * 1.05, cy - r * (0.5 + flap));
        ctx.lineTo(cx - r * 0.34, cy + r * 0.34);
        ctx.closePath();
        ctx.moveTo(cx, cy - r * 0.1);
        ctx.lineTo(cx + r * 1.05, cy - r * (0.5 + flap));
        ctx.lineTo(cx + r * 0.34, cy + r * 0.34);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.72);
        ctx.lineTo(cx + r * 0.42, cy);
        ctx.lineTo(cx, cy + r * 0.74);
        ctx.lineTo(cx - r * 0.42, cy);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = detail('#fff2b0');
        ctx.beginPath();
        ctx.arc(cx - r * 0.14, cy - r * 0.18, r * 0.09, 0, Math.PI * 2);
        ctx.arc(cx + r * 0.14, cy - r * 0.18, r * 0.09, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      default:
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
    }
  }

  // ---------- gracz ----------

  /**
   * Pozostali GRACZE - ci, ktorych widac teraz.
   *
   * Rysownik sam z siebie zna tylko potwory, wiec bez tego wejscia spotkanie
   * z drugim czlowiekiem bylo niewidoczne. Barwa jest zimna, przeciwnie do
   * cieplej obwodki wlasnej postaci, i kazdy niesie imie nad glowa: gracz musi
   * wiedzieć, z kim ma do czynienia, zanim zdecyduje, czy uderzyc, czy odejsc.
   *
   * W grze jednoosobowej `game.gracze` nie istnieje, wiec metoda nic nie robi.
   */
  drawOthers(game, view) {
    const inni = game.gracze;
    if (!inni || !inni.length) return;
    const ctx = this.ctx;
    const t = this.tile;
    const r = t * 0.5;
    for (const o of inni) {
      const cx = this.ox + o.x * t + t / 2;
      const cy = this.oy + o.y * t + t / 2;

      ctx.fillStyle = '#dfe7f4';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.44, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(130,190,255,0.95)';
      ctx.lineWidth = Math.max(1.2, r * 0.14);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.66, 0, Math.PI * 2);
      ctx.stroke();

      // Pasek zycia, zeby dalo sie przeliczyc sily przed starciem. Bez niego
      // decyzja "uderzyc czy odejsc" jest rzutem monetą.
      const frac = Math.max(0, Math.min(1, o.hp / o.maxHp));
      const bw = t * 0.66, bh = Math.max(2, t * 0.07);
      const bx = cx - bw / 2, by = cy - r * 0.95;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = frac > 0.5 ? '#7fd48b' : frac > 0.25 ? '#ffcd82' : '#ff5f6d';
      ctx.fillRect(bx, by, bw * frac, bh);

      const label = String(o.name || '').slice(0, 12);
      if (label) {
        ctx.font = `${Math.max(9, Math.round(t * 0.26))}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(6,7,11,0.85)';
        ctx.strokeText(label, cx, by - 2);
        ctx.fillStyle = '#cfe0f7';
        ctx.fillText(label, cx, by - 2);
      }
    }
  }

  drawPlayer(game, view, ps) {
    const ctx = this.ctx;
    const t = this.tile;
    const p = game.player;
    const cx = this.ox + ps.x * t + t / 2;
    const cy = this.oy + ps.y * t + t / 2;
    const r = t * 0.5;
    const s = view.sprites.get('@') || { flash: 0 };

    // Krąg światła pochodni. Rysowany DODAWANIEM, więc rozjaśnia to, co pod nim,
    // zamiast zamalowywać - loch zachowuje swoje kolory.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const rad = t * (FOV_RADIUS * 0.55);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, 'rgba(255,186,104,0.22)');
    g.addColorStop(0.45, 'rgba(255,168,88,0.09)');
    g.addColorStop(1, 'rgba(255,160,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    ctx.restore();

    if (p.hasAmulet) {
      const pulse = 0.6 + 0.4 * Math.sin(view.time * 3);
      const ag = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
      ag.addColorStop(0, `rgba(255,214,102,${0.45 * pulse})`);
      ag.addColorStop(1, 'rgba(255,214,102,0)');
      ctx.fillStyle = ag;
      ctx.fillRect(cx - r * 2.2, cy - r * 2.2, r * 4.4, r * 4.4);
    }

    const hurt = view.flashAlpha(s);
    ctx.fillStyle = hurt > 0 ? `rgb(255,${Math.round(255 - hurt * 170)},${Math.round(255 - hurt * 170)})` : '#f6f4ee';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.44, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,205,130,0.9)';
    ctx.lineWidth = Math.max(1.2, r * 0.14);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.66, 0, Math.PI * 2);
    ctx.stroke();

    // Znacznik zwrotu - jedyna rzecz, której wersja terminalowa nie pokazuje,
    // a która nic nie zdradza: mówi tylko, skąd gracz przyszedł.
    const f = view.facing;
    if (f.dx || f.dy) {
      const len = Math.hypot(f.dx, f.dy);
      ctx.fillStyle = 'rgba(255,225,170,0.95)';
      ctx.beginPath();
      ctx.arc(cx + (f.dx / len) * r * 0.66, cy + (f.dy / len) * r * 0.66, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- efekty ----------

  drawEffects(view) {
    const ctx = this.ctx;
    const t = this.tile;

    for (const q of view.puffs) {
      const f = view.puffProgress(q);
      const cx = this.ox + q.x * t + t / 2;
      const cy = this.oy + q.y * t + t / 2;
      ctx.save();
      ctx.globalAlpha = (1 - f) * 0.7;
      ctx.strokeStyle = '#ffd9c0';
      ctx.lineWidth = Math.max(1, t * 0.07);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + f * 1.2;
        const d = t * (0.16 + f * 0.5);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * d * 0.6, cy + Math.sin(a) * d * 0.6);
        ctx.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (!view.floaters.length) return;
    ctx.save();
    ctx.font = `600 ${Math.round(Math.max(11, t * 0.62))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    for (const fl of view.floaters) {
      const f = view.floatProgress(fl);
      const cx = this.ox + fl.x * t + t / 2;
      const cy = this.oy + fl.y * t + t / 2 - f * t * 1.3;
      ctx.globalAlpha = Math.min(1, (1 - f) * 1.8);
      ctx.strokeText(fl.text, cx, cy);
      ctx.fillStyle = fl.color;
      ctx.fillText(fl.text, cx, cy);
    }
    ctx.restore();
  }
}
