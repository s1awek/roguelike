#!/usr/bin/env node
// Serwer partii wieloosobowej. Bez zależności, jak cała reszta (D-001).
//
// Zdarzenia idą do przeglądarki strumieniem serwera (SSE), a działania wracają
// zwykłym POST-em. Gniazda dwukierunkowe (WebSocket) byłyby tu wydatkiem bez
// pokrycia: własna obsługa ramek to około stu pięćdziesięciu linii kodu, który
// sam potrzebuje kontroli (maskowanie, fragmentacja, pingi, zamknięcie), a gra
// jest turowa - zdarzenia płyną w tempie ludzkiego naciskania klawiszy, nie
// klatek animacji. SSE jest wbudowane w przeglądarkę i wystarcza.
//
// Uruchomienie:  node bin/server.js [--port 8080] [--boty 3] [--map 120x32]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { Game } from '../src/game.js';
import { Stol } from '../src/stol.js';
import { Bot as BotKlasa } from '../src/bot.js';
import { widokDla } from '../src/widok.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg('--port', process.env.PORT || 8080));
const ILE_BOTOW = Number(arg('--boty', 3));
const MAPA = arg('--map', '120x32');
const ZIARNO = arg('--seed', `stol-${Date.now()}`);
const LIMIT_MIEJSC = Number(arg('--limit', 12));
const LASKA_MS = Number(arg('--laska', 60000));   // ile czekamy na powrót rozłączonego
const TICK_MS = 60;
const ZADAN_NA_SEKUNDE = Number(arg('--limit-zadan', 25));
const MIEJSC_NA_ADRES = Number(arg('--miejsc-na-adres', 2));
const STRUMIENI_NA_MIEJSCE = 3;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

// ---------- partia ----------

const [MW, MH] = MAPA.split('x').map(Number);
const game = new Game(ZIARNO, { name: 'Pierwszy', w: MW, h: MH });
// Pierwszy uczestnik powstaje razem z grą, więc trafia na schody. Rozrzucamy go
// tak samo jak wszystkich pozostałych - inaczej każda partia zaczynałaby się
// bijatyką przy wejściu.
game.scatterHero(game.heroes[0], 1);
const stol = new Stol(game);
// Miejsce, które powstaje razem z grą, obsadzamy botem. Pusty loch bez ani
// jednego mieszkańca jest dla kogoś, kto wchodzi pierwszy, nieodróżnialny od
// gry jednoosobowej - a wtedy nie ma po co było robić stołu.
stol.miejsca.get(0).rodzaj = 'bot';
stol.miejsca.get(0).bot = new BotKlasa();
for (let i = 1; i < ILE_BOTOW; i++) stol.dosiadz(`Automat ${i}`, { rodzaj: 'bot' });
let licznikBotow = ILE_BOTOW;

/** Miejsca zajęte przez ludzi: hid -> {token, strumienie, dziennikDo, ...} */
const ludzie = new Map();

const grajacy = () => [...stol.miejsca.values()]
  .filter(m => game.heroes[m.hid].status === 'playing').length;

/** Ile miejsc trzyma w tej chwili jeden adres. */
const miejscAdresu = (adres) => [...ludzie.values()].filter(w => w.adres === adres).length;

/**
 * Dosiadnięcie do stołu, z górnym pułapem miejsc NA JEDEN ADRES.
 *
 * Pułap nie jest ostrożnością na zapas - jest odpowiedzią na zmierzone
 * zdarzenie. Właściciel wszedł na stronę i w ciągu sześciu sekund zajął OSIEM
 * z dwunastu miejsc, bo każde kliknięcie w „Wejdź" prosiło o nowe miejsce,
 * a przeglądarka zamykała przy tym poprzedni strumień. Zostało jedno miejsce
 * grające i siedem porzuconych ciał, a stół zrobił się pełny, więc nikt inny
 * nie mógł już wejść. Porządki odzyskały te miejsca dopiero po okresie łaski.
 *
 * Zapora po stronie klienta (przycisk gaszony na czas dosiadania) usuwa
 * przypadek, ale nie wystarcza: przy grze wystawionej publicznie `/api/dosiadz`
 * woła kto chce i czym chce, a przydział żądań na sekundę przepuszcza
 * dwanaście wywołań w pół sekundy. Pułap na adres jest jedyną warstwą,
 * która działa bez zaufania do klienta.
 *
 * Dlaczego DWA, a nie jedno: za jednym adresem siedzi cała sieć domowa, biuro
 * albo operator komórkowy, więc pułap jeden odbijałby drugiego prawdziwego
 * gracza. Dwa przepuszczają domownika i drugą kartę, a nie przepuszczają serii
 * kliknięć. Miejsce zwolnione przez porządki przestaje się liczyć, bo wychodzi
 * ze zbioru ludzi.
 */
function dosiadz(name, adres = '?') {
  const czyste = String(name || '').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 16) || 'Gość';
  if (miejscAdresu(adres) >= MIEJSC_NA_ADRES) {
    log(`odmowa: adres ${adres} ma juz ${miejscAdresu(adres)} miejsc`);
    return { blad: `z tego adresu zajęte są już ${MIEJSC_NA_ADRES} miejsca - zamknij starą kartę albo poczekaj` };
  }
  if (grajacy() >= LIMIT_MIEJSC) return { blad: 'stół pełny, spróbuj za chwilę' };
  const m = stol.dosiadz(czyste, { rodzaj: 'czlowiek' }).miejsce;
  const token = randomBytes(12).toString('hex');
  ludzie.set(m.hid, { token, adres, strumienie: new Set(), dziennikDo: 0, kafelWyslany: null, rozlaczonyOd: null });
  log(`dosiadl ${czyste} (miejsce ${m.hid}), ludzi ${ludzie.size}, grajacych ${grajacy()}`);
  return { hid: m.hid, token, name: czyste };
}

/**
 * Porządki przy stole. Dwie rzeczy, bez których serwer chodzący bez opieki
 * przestaje być grywalny po godzinie:
 *
 * 1. Rozłączony człowiek. Jego postać stoi w lochu jako bezwolne ciało, a jeśli
 *    ktoś stanie obok, tura wspólna czeka na deklarację, której nie będzie -
 *    ratuje ją dopiero upływ czasu. Po okresie łaski miejsce przejmuje bot,
 *    więc postać zaczyna się bronić i chodzić. Odświeżenie strony mieści się
 *    w łasce, bo znak miejsca leży w `sessionStorage`.
 * 2. Wymarłe boty. Bot ginie od potworów jak każdy, a loch bez mieszkańców
 *    to znowu gra jednoosobowa - więc miejsce po nim dostaje nowy.
 */
function porzadki(t) {
  for (const [hid, w] of [...ludzie]) {
    if (w.strumienie.size) { w.rozlaczonyOd = null; continue; }
    if (w.rozlaczonyOd === null) { w.rozlaczonyOd = t; continue; }
    if (t - w.rozlaczonyOd < LASKA_MS) continue;
    const m = stol.miejsca.get(hid);
    m.rodzaj = 'bot';
    m.bot = new BotKlasa();
    ludzie.delete(hid);
    log(`miejsce ${hid} (${m.name}) przejete przez bota po rozlaczeniu`);
  }
  const zyweBoty = [...stol.miejsca.values()]
    .filter(m => m.rodzaj === 'bot' && game.heroes[m.hid].status === 'playing').length;
  if (zyweBoty < ILE_BOTOW && grajacy() < LIMIT_MIEJSC) {
    licznikBotow++;
    stol.dosiadz(`Automat ${licznikBotow}`, { rodzaj: 'bot' });
    log(`nowy bot na miejscu, zywych botow bylo ${zyweBoty}`);
  }
}

function uwierzytelnij(hid, token) {
  const w = ludzie.get(Number(hid));
  return w && token && w.token === token ? w : null;
}

// ---------- pętla stołu ----------

let ostatniStan = '';
let ostatniePorzadki = 0;
setInterval(() => {
  const t = Date.now();
  if (t - ostatniePorzadki > 3000) { ostatniePorzadki = t; try { porzadki(t); } catch (e) { log(`porzadki: ${e.message}`); } }
  try {
    stol.tick();
  } catch (e) {
    log(`WYWROTKA w turze: ${e.stack}`);
    return;
  }
  for (const [hid, w] of ludzie) {
    if (!w.strumienie.size) continue;
    const hero = game.heroes[hid];
    const klucz = `${hero.depth}:${[...hero.visible].length}:${game.turn}:${hero.messages.length}`;
    if (w.ostatniKlucz === klucz) continue;
    w.ostatniKlucz = klucz;
    wyslijWidok(hid, w);
  }
  const s = JSON.stringify(stol.stan().uczestnicy.map(u => [u.hid, u.status, u.depth]));
  if (s !== ostatniStan) { ostatniStan = s; }
}, TICK_MS);

function wyslijWidok(hid, w) {
  const hero = game.heroes[hid];
  // Pamięć terenu jest największą częścią migawki, a zmienia się rzadko -
  // wysyłamy ją, gdy uczestnik zmienił poziom albo odsłonił nowe pola.
  const pamiec = game.memoryOf(hero, hero.depth);
  let znane = 0;
  for (let i = 0; i < pamiec.length; i++) znane += pamiec[i];
  const znak = `${hero.depth}:${znane}`;
  const zKaflami = w.kafelWyslany !== znak || game.turn % 25 === 0;
  const widok = widokDla(game, hero, { dziennikOd: w.dziennikDo, zKaflami });
  w.dziennikDo = widok.dziennikDo;
  if (zKaflami) w.kafelWyslany = znak;
  const dane = `data: ${JSON.stringify(widok)}\n\n`;
  for (const res of w.strumienie) { try { res.write(dane); } catch { /* zamknięty */ } }
}

// ---------- HTTP ----------

/**
 * Prosty przydział żądań na adres - wiadro z żetonami.
 *
 * Gra turowa nie potrzebuje więcej niż kilku żądań na sekundę od jednego
 * gracza: jedno na naciśnięcie klawisza. Bez tego ogranicznika pojedynczy
 * klient w pętli zajmuje procesor pętli stołu i psuje partię wszystkim
 * pozostałym - a przy grze wystawionej publicznie nie ma powodu zakładać,
 * że każdy klient jest życzliwy.
 *
 * Świadomie NIE jest to zabezpieczenie przed napastnikiem z wielu adresów.
 * Takie rzeczy załatwia warstwa przed serwerem, nie ten plik.
 */
const wiadra = new Map();   // adres -> {zetony, kiedy}
function przepusc(adres) {
  const t = Date.now();
  let w = wiadra.get(adres);
  if (!w) { w = { zetony: ZADAN_NA_SEKUNDE, kiedy: t }; wiadra.set(adres, w); }
  w.zetony = Math.min(ZADAN_NA_SEKUNDE, w.zetony + (t - w.kiedy) * ZADAN_NA_SEKUNDE / 1000);
  w.kiedy = t;
  if (w.zetony < 1) return false;
  w.zetony -= 1;
  return true;
}
// Wiadra po adresach, których dawno nie było, nie mogą rosnąć bez końca.
setInterval(() => {
  const t = Date.now();
  for (const [a, w] of wiadra) if (t - w.kiedy > 300000) wiadra.delete(a);
}, 60000).unref?.();

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function cialo(req) {
  return new Promise((resolve, reject) => {
    let s = '', n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > 8192) { reject(new Error('zbyt duże żądanie')); req.destroy(); return; }
      s += c;
    });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const path = decodeURIComponent(u.pathname);
  const adres = req.socket.remoteAddress || '?';

  if (path.startsWith('/api/') && !przepusc(adres)) {
    return json(res, 429, { blad: 'za dużo żądań, zwolnij' });
  }

  if (path === '/api/stol') {
    return json(res, 200, {
      ziarno: ZIARNO, mapa: MAPA, turn: game.turn,
      limit: LIMIT_MIEJSC, grajacych: grajacy(),
      uczestnicy: stol.stan().uczestnicy.map(u2 => ({
        hid: u2.hid, name: u2.name, rodzaj: u2.rodzaj, status: u2.status,
        depth: u2.depth, level: u2.level,
      })),
    });
  }

  if (path === '/api/dosiadz' && req.method === 'POST') {
    try {
      const b = await cialo(req);
      const r = dosiadz(b.name, adres);
      return json(res, r.blad ? 503 : 200, r);
    } catch (e) { return json(res, 400, { blad: e.message }); }
  }

  if (path === '/api/dzialanie' && req.method === 'POST') {
    try {
      const b = await cialo(req);
      const w = uwierzytelnij(b.hid, b.token);
      if (!w) return json(res, 403, { blad: 'nie twoje miejsce' });
      return json(res, 200, stol.zadeklaruj(Number(b.hid), b.action));
    } catch (e) { return json(res, 400, { blad: e.message }); }
  }

  /**
   * Czy zapamiętane miejsce jeszcze istnieje.
   *
   * Przeglądarka trzyma znak miejsca w `sessionStorage`, który przeżywa nie tylko
   * odświeżenie strony, ale i RESTART SERWERA - a po restarcie żaden stary znak
   * nie jest już ważny, bo stół zaczyna się od nowa. Bez tego pytania klient
   * dobijał się strumieniem do nieistniejącego miejsca i dostawał 403 w pętli,
   * nie mając jak wrócić do lobby.
   */
  if (path === '/api/moje') {
    const w = uwierzytelnij(Number(u.searchParams.get('hid')), u.searchParams.get('token'));
    return json(res, w ? 200 : 403, w ? { ok: true } : { blad: 'miejsce już nie istnieje' });
  }

  if (path === '/api/strumien') {
    const hid = Number(u.searchParams.get('hid'));
    const w = uwierzytelnij(hid, u.searchParams.get('token'));
    if (!w) return json(res, 403, { blad: 'nie twoje miejsce' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      // Bez tego pośrednik buforujący trzymałby strumień do końca partii.
      'X-Accel-Buffering': 'no',
    });
    // Kilka kart tej samej osoby to normalne, ale nie kilkadziesiąt: każdy
    // strumień to kopia migawki na każdą turę.
    if (w.strumienie.size >= STRUMIENI_NA_MIEJSCE) {
      const najstarszy = w.strumienie.values().next().value;
      w.strumienie.delete(najstarszy);
      try { najstarszy.end(); } catch { /* już zamknięty */ }
    }
    res.write(': otwarte\n\n');
    w.strumienie.add(res);
    w.dziennikDo = 0;
    w.kafelWyslany = null;
    w.ostatniKlucz = null;
    req.on('close', () => { w.strumienie.delete(res); });
    return;
  }

  // ---------- pliki ----------
  let p = path;
  if (p === '/') { res.writeHead(302, { Location: '/web/' }); return res.end(); }
  if (p.endsWith('/')) p += 'index.html';
  const full = normalize(join(ROOT, p));
  if (!full.startsWith(ROOT)) { res.writeHead(403); return res.end('403'); }
  try {
    const s = await stat(full);
    if (s.isDirectory()) { res.writeHead(302, { Location: `${p}/` }); return res.end(); }
    const body = await readFile(full);
    res.writeHead(200, { 'Content-Type': TYPES[extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 - nie ma takiego pliku');
  }
});

/**
 * Znacznik czasu wpisu: czas LOKALNY maszyny, zawsze z offsetem przy liczbie.
 *
 * Stało tu `toISOString().slice(11,19)`, czyli godzina UTC podana nago. Log
 * twierdził wtedy, że stół wstał o 09:28, gdy zegar stanowiska wskazywał 11:28.
 * To gorszy rodzaj usterki niż brak znacznika, bo wygląda na poprawny pomiar:
 * kosztowało śledztwo „dlaczego proces ma sześć minut, a jego własny log dwie
 * godziny". Przy korelowaniu zgłoszenia gracza („wywaliło mnie koło południa")
 * z tym logiem kosztowałoby więcej, a różnica zmienia się dwa razy w roku,
 * więc nie da się jej nadrobić stałą poprawką w głowie.
 */
function log(t) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const minuty = -d.getTimezoneOffset();
  const znak = minuty < 0 ? '-' : '+';
  const offset = `${znak}${p(Math.floor(Math.abs(minuty) / 60))}:${p(Math.abs(minuty) % 60)}`;
  console.log(`[${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${offset}] ${t}`);
}

server.listen(PORT, () => {
  log(`stol otwarty na http://localhost:${PORT}/web/wielu.html`);
  log(`ziarno ${ZIARNO}, mapa ${MAPA}, boty ${ILE_BOTOW}`);
});
