// Stół: rozjemca tury dla partii z wieloma uczestnikami.
//
// Silnik (`src/game.js`) umie dwie rzeczy: wykonać działanie JEDNEGO uczestnika
// (`act`) i rozstrzygnąć turę WSPÓLNĄ dla grupy (`resolveTurn`). Nie wie
// natomiast, kiedy zastosować którą, ani jak długo czekać na kogoś, kto nie
// odpowiada. To wie stół - i tylko on dotyka zegara.
//
// Dlaczego to osobna warstwa, a nie część silnika: silnik ma zostać czystą,
// powtarzalną funkcją stanu i ziarna (kryterium 1 specyfikacji). Zegar ścienny
// jest źródłem nieodtwarzalności, więc siedzi po tej stronie granicy, gdzie da
// się go podstawić.

import { Bot, decydujWPojedynku, grupyWKontakcie } from './bot.js';

export const CZAS_NA_DEKLARACJE_MS = 12000;
export const TEMPO_BOTA_MS = 400;

export class Stol {
  /**
   * @param game silnik z co najmniej jednym uczestnikiem
   * @param opts.czasNaDeklaracjeMs ile czekać na milczącego uczestnika w turze wspólnej
   * @param opts.tempoBotaMs najkrótsza przerwa między działaniami gracza automatycznego
   * @param opts.teraz źródło czasu; podstawialne, żeby testy nie musiały spać
   */
  constructor(game, opts = {}) {
    this.game = game;
    this.czasNaDeklaracjeMs = opts.czasNaDeklaracjeMs ?? CZAS_NA_DEKLARACJE_MS;
    this.tempoBotaMs = opts.tempoBotaMs ?? TEMPO_BOTA_MS;
    this.teraz = opts.teraz ?? (() => Date.now());

    this.miejsca = new Map();   // hid -> miejsce
    this.terminy = new Map();   // klucz grupy -> chwila, po której grupa rusza bez milczących
    this.zdarzenia = [];        // dziennik stołu, do podglądu i do testów
    for (const h of game.heroes) this.zajmij(h, { rodzaj: 'czlowiek' });
  }

  /** Przypisuje uczestnikowi miejsce przy stole. Bot dostaje własny rozum. */
  zajmij(hero, { rodzaj = 'czlowiek' } = {}) {
    const m = {
      hid: hero.hid, name: hero.name, rodzaj,
      deklaracja: null, odrzucone: 0, ostatnieDzialanie: 0,
      bot: rodzaj === 'bot' ? new Bot() : null,
    };
    this.miejsca.set(hero.hid, m);
    return m;
  }

  /** Nowy uczestnik w trakcie partii - wchodzi rozrzucony, nie na cudzych schodach. */
  dosiadz(name, { rodzaj = 'czlowiek', depth = 1 } = {}) {
    const hero = this.game.addHero(name, depth);
    return { hero, miejsce: this.zajmij(hero, { rodzaj }) };
  }

  /**
   * Zgłoszenie działania. Deklaracja jest NIEJAWNA: leży w miejscu uczestnika
   * i nikt jej nie czyta aż do rozstrzygnięcia tury (kryterium 17).
   */
  zadeklaruj(hid, action) {
    const m = this.miejsca.get(hid);
    if (!m) return { ok: false, powod: 'nie ma takiego miejsca' };
    const hero = this.game.heroes[hid];
    if (!hero || hero.status !== 'playing') return { ok: false, powod: 'partia tego uczestnika skończona' };
    m.deklaracja = action;
    return { ok: true };
  }

  /**
   * Przełożenie rzeczy w plecaku. To NIE jest działanie w świecie: nie kosztuje
   * tury, nie budzi potworów i nikt poza właścicielem plecaka tego nie widzi.
   * Dlatego idzie z pominięciem deklaracji i zegara - gdyby szło zwykłą drogą,
   * porządkowanie plecaka wstrzymywałoby turę wspólną komuś, kto stoi obok
   * i czeka na rozstrzygnięcie walki.
   */
  przeloz(hid, { index, x, y, obrot } = {}) {
    const m = this.miejsca.get(hid);
    if (!m) return { ok: false, powod: 'nie ma takiego miejsca' };
    const hero = this.game.heroes[hid];
    if (!hero || hero.status !== 'playing') return { ok: false, powod: 'partia tego uczestnika skończona' };
    const ok = this.game.przelozWPlecaku(hero, Number(index), Number(x), Number(y), Number(obrot) || 0);
    return ok ? { ok: true } : { ok: false, powod: 'tam się nie mieści' };
  }

  /** Uczestnicy pogrupowani po kontakcie; grupa dłuższa niż jeden idzie turą wspólną. */
  grupy() {
    const zywi = this.game.heroes.filter(h => h.status === 'playing');
    return grupyWKontakcie(this.game, zywi);
  }

  /**
   * Popycha partię tak daleko, jak pozwalają zgłoszone deklaracje i zegar.
   *
   * Jedno wywołanie to najwyżej JEDNO działanie na uczestnika. Bez tego
   * ograniczenia gracz automatyczny przebiegłby cały loch w jednej pętli,
   * a człowiek stojący obok nie zdążyłby nawet zobaczyć, co się stało.
   */
  tick() {
    const t = this.teraz();
    const wynik = { wykonane: [], czekaja: [], odrzucone: [] };
    const zywe = new Set();

    for (const grupa of this.grupy()) {
      const klucz = grupa.map(h => h.hid).sort((a, b) => a - b).join(',');
      zywe.add(klucz);

      if (grupa.length === 1) {
        this.terminy.delete(klucz);
        const hero = grupa[0];
        const m = this.miejsca.get(hero.hid);
        const akcja = this.wezDeklaracje(m, hero, t);
        if (!akcja) { wynik.czekaja.push({ hid: hero.hid, na: 'wlasna deklaracja' }); continue; }
        m.deklaracja = null;
        const prev = this.game.active;
        this.game.active = hero.hid;
        const spent = this.game.act(akcja);
        this.game.active = prev;
        if (spent) {
          m.ostatnieDzialanie = t;
          wynik.wykonane.push({ hid: hero.hid, wspolna: false });
        } else {
          // Odmowa nie kosztuje tury (ta sama reguła co w grze jednoosobowej),
          // ale bota trzeba wybudzić z planu, który przestał być wykonalny.
          m.odrzucone++;
          if (m.bot) m.bot.invalidate();
          wynik.odrzucone.push({ hid: hero.hid, akcja });
        }
        continue;
      }

      // Tura wspólna. Deklaracje zbierane WSZYSTKIE naraz, przed jakimkolwiek
      // skutkiem - inaczej ostatni w kolejce grałby z odkrytymi kartami.
      const akcje = new Map();
      const milczacy = [];
      for (const hero of grupa) {
        const m = this.miejsca.get(hero.hid);
        const akcja = this.wezDeklaracje(m, hero, t);
        if (akcja) akcje.set(hero.hid, akcja);
        else milczacy.push(hero.hid);
      }

      if (milczacy.length) {
        const termin = this.terminy.get(klucz) ?? (t + this.czasNaDeklaracjeMs);
        this.terminy.set(klucz, termin);
        if (t < termin) {
          wynik.czekaja.push({ hid: grupa.map(h => h.hid), na: 'deklaracje', milczacy, termin });
          continue;
        }
        // Termin minął: milczący STOI BEZCZYNNIE, a partia idzie dalej
        // (kryterium 18). Brak deklaracji nie może zatrzymać cudzej gry.
        this.zdarzenia.push({ t, co: 'termin', grupa: klucz, milczacy });
      }

      for (const hero of grupa) this.miejsca.get(hero.hid).deklaracja = null;
      this.terminy.delete(klucz);
      const spent = this.game.resolveTurn(akcje, grupa);
      for (const [hid, ok] of spent) {
        const m = this.miejsca.get(hid);
        m.ostatnieDzialanie = t;
        if (ok) wynik.wykonane.push({ hid, wspolna: true });
        else {
          m.odrzucone++;
          if (m.bot) m.bot.invalidate();
          wynik.odrzucone.push({ hid, akcja: akcje.get(hid) ?? null });
        }
      }
    }

    for (const klucz of [...this.terminy.keys()]) if (!zywe.has(klucz)) this.terminy.delete(klucz);
    return wynik;
  }

  /**
   * Deklaracja uczestnika albo `null`, gdy jej nie ma.
   *
   * Bot deklaruje sam, ale nie częściej niż `tempoBotaMs` - gra jest turowa
   * i nie ma w niej zegara, więc bez tego dławienia bot wykonywałby setki tur
   * na jedno naciśnięcie klawisza przez człowieka.
   */
  wezDeklaracje(m, hero, t) {
    if (m.deklaracja) return m.deklaracja;
    if (!m.bot) return null;
    if (t - m.ostatnieDzialanie < this.tempoBotaMs) return null;
    const prev = this.game.active;
    this.game.active = hero.hid;
    const akcja = decydujWPojedynku(this.game, hero, m.bot);
    this.game.active = prev;
    return akcja;
  }

  /** Krótki stan dla podglądu: kto siedzi, gdzie jest, czy na kogoś czeka. */
  stan() {
    return {
      turn: this.game.turn,
      uczestnicy: [...this.miejsca.values()].map(m => {
        const h = this.game.heroes[m.hid];
        return {
          hid: m.hid, name: m.name, rodzaj: m.rodzaj, status: h.status,
          depth: h.depth, hp: h.hp, maxHp: h.maxHp, level: h.level,
          wKontakcie: this.game.contacts(h).map(o => o.hid),
          zadeklarowal: m.deklaracja !== null,
        };
      }),
    };
  }
}
