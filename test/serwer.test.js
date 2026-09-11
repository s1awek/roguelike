// Serwer stołu po HTTP: pułap miejsc na jeden adres.
//
// Ten plik istnieje z powodu zdarzenia, nie z przewidywania: jedno wejście na
// stronę zajęło osiem z dwunastu miejsc, bo każde kliknięcie prosiło o nowe.
// Zapora po stronie przeglądarki usuwa przypadek, ale serwer nie może wierzyć
// klientowi - dlatego pułap sprawdzamy tam, gdzie działa bez zaufania.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

/** Uruchamia prawdziwy serwer i czeka, aż ogłosi otwarcie stołu. */
async function serwer(args = []) {
  const port = 8100 + Math.floor(Math.random() * 800);
  const p = spawn(process.execPath, ['bin/server.js', '--port', String(port), '--boty', '2',
    '--map', '80x24', '--seed', 'test-serwer', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  const log = [];
  p.stdout.on('data', (c) => log.push(String(c)));
  p.stderr.on('data', (c) => log.push(String(c)));
  const t0 = Date.now();
  while (Date.now() - t0 < 10000) {
    if (log.join('').includes('stol otwarty')) break;
    await new Promise(r => setTimeout(r, 100));
  }
  const baza = `http://127.0.0.1:${port}`;
  return {
    baza, log,
    dosiadz: async (name) => {
      const r = await fetch(`${baza}/api/dosiadz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      return { code: r.status, body: await r.json() };
    },
    stol: async () => (await fetch(`${baza}/api/stol`)).json(),
    moje: async (hid, token) =>
      (await fetch(`${baza}/api/moje?hid=${hid}&token=${encodeURIComponent(token)}`)).status,
    mojeCiało: async (hid, token) => {
      const r = await fetch(`${baza}/api/moje?hid=${hid}&token=${encodeURIComponent(token)}`);
      return { code: r.status, body: await r.json().catch(() => ({})) };
    },
    koniec: () => p.kill(),
  };
}

test('jedno dosiadnięcie daje jedno miejsce', async () => {
  const s = await serwer();
  try {
    const r = await s.dosiadz('Halina');
    assert.equal(r.code, 200, `odmowa przy pierwszym wejściu: ${JSON.stringify(r.body)}`);
    assert.equal(typeof r.body.hid, 'number');
    assert.equal(r.body.name, 'Halina');
    const st = await s.stol();
    assert.equal(st.uczestnicy.filter(u => u.rodzaj === 'czlowiek').length, 1);
  } finally { s.koniec(); }
});

test('seria żądań z jednego adresu nie zajmuje więcej miejsc niż pułap', async () => {
  const s = await serwer(['--miejsc-na-adres', '2']);
  try {
    const wyniki = [];
    for (let i = 0; i < 6; i++) wyniki.push(await s.dosiadz(`Klikacz ${i}`));
    const przyjete = wyniki.filter(r => r.code === 200).length;
    assert.equal(przyjete, 2, `pułap 2, a przyjęto ${przyjete} - stół daje się zapełnić z jednego adresu`);

    const st = await s.stol();
    const ludzi = st.uczestnicy.filter(u => u.rodzaj === 'czlowiek').length;
    assert.equal(ludzi, 2, `przy stole siedzi ${ludzi} ludzi z jednego adresu`);

    // Odmowa musi mówić PRAWDĘ o przyczynie. „Stół pełny" przy stole na dwanaście
    // miejsc i dwóch graczach byłoby komunikatem mylącym gracza.
    const odmowa = wyniki.find(r => r.code !== 200);
    assert.equal(odmowa.code, 503);
    // Przyczyna po kodzie, nie po treści: treść jest w języku gracza (D-051).
    assert.equal(odmowa.body.kod, 'serwer.adresPelny',
      `odmowa podaje inną przyczynę niż pułap adresu: ${odmowa.body.blad}`);
    assert.ok(odmowa.body.blad, 'starszy klient zna tylko gotowe zdanie - musi przyjść');
  } finally { s.koniec(); }
});

test('KONTROLA PRZYRZĄDU: przy podniesionym pułapie ta sama seria zajmuje więcej miejsc', async () => {
  // Bez tej kontroli test wyżej przechodziłby także wtedy, gdyby miejsca
  // odbijało cokolwiek innego - limit stołu, przydział żądań, błąd w ciele
  // żądania. Tu widać, że mierzony jest DOKŁADNIE pułap na adres.
  const s = await serwer(['--miejsc-na-adres', '5']);
  try {
    const wyniki = [];
    for (let i = 0; i < 6; i++) wyniki.push(await s.dosiadz(`Klikacz ${i}`));
    const przyjete = wyniki.filter(r => r.code === 200).length;
    assert.equal(przyjete, 5,
      `pułap 5 przyjął ${przyjete} - test nie mierzy pułapu, tylko coś innego`);
  } finally { s.koniec(); }
});

test('stół potrafi powiedzieć, czy zapamiętane miejsce jeszcze istnieje', async () => {
  // Znak miejsca leży w `sessionStorage` przeglądarki i przeżywa RESTART serwera,
  // po którym nie znaczy już nic. Bez tego pytania klient dobijał się strumieniem
  // do nieistniejącego miejsca, dostawał 403 w pętli i nie miał jak wrócić
  // do ekranu wejścia - a zapora „mam już miejsce" nie pozwalała mu wejść od nowa.
  const s = await serwer();
  try {
    const r = await s.dosiadz('Wracacz');
    assert.equal(await s.moje(r.body.hid, r.body.token), 200, 'ważne miejsce uznane za nieistniejące');
    assert.equal(await s.moje(r.body.hid, 'nie-ten-znak'), 403, 'obcy znak przyjęty jako własny');
    assert.equal(await s.moje(999, r.body.token), 403, 'miejsce spoza stołu uznane za istniejące');
  } finally { s.koniec(); }
});

test('porzucone miejsce zwalnia pułap adresu, żywe i nigdy niepodłączone go zajmują', async () => {
  // Powód tego testu: lokalnie KAŻDE połączenie przychodzi z tego samego adresu,
  // więc pułap z D-031 zamykał wejście po zamknięciu karty - własne porzucone
  // miejsce blokowało właściciela do końca okresu łaski.
  //
  // Pierwsza wersja tego rozróżnienia szła po znaczniku rozłączenia i BYŁA ZŁA:
  // porządki oznaczają rozłączenie już przy pierwszym tiku, więc miejsce z serii
  // kliknięć przestawało się liczyć po sekundach. Test to wykrył, gdy tik wypadł
  // w środku serii - dlatego mierzymy tu oba bieguny naraz.
  const s = await serwer(['--miejsc-na-adres', '2']);
  const przerwij = [];
  /** Otwiera prawdziwy strumień i czeka, aż serwer go zarejestruje. */
  const strumien = async (m) => {
    const sterowanie = new AbortController();
    przerwij.push(sterowanie);
    const r = await fetch(`${s.baza}/api/strumien?hid=${m.hid}&token=${m.token}`,
      { signal: sterowanie.signal });
    assert.equal(r.status, 200, 'strumień odrzucony - dalszy pomiar byłby bez sensu');
    await r.body.getReader().read();       // pierwsza migawka = połączenie stoi
    return sterowanie;
  };
  try {
    const a = (await s.dosiadz('Siedzi A')).body;
    const stA = await strumien(a);
    const b = (await s.dosiadz('Siedzi B')).body;
    await strumien(b);

    // KONTROLA PRZYRZĄDU nr 1: przy dwóch żywych miejscach pułap ma bronić.
    const odbity = await s.dosiadz('Trzeci przy dwóch żywych');
    assert.equal(odbity.code, 503, `pułap nie bronił przed żywym trzecim: ${JSON.stringify(odbity.body)}`);

    stA.abort();                            // tyle, co zamknięcie karty
    let wrocilo = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 5000) {
      const r = await s.dosiadz('Wracam');
      if (r.code === 200) { wrocilo = r; break; }
      await new Promise(r => setTimeout(r, 200));
    }
    assert.ok(wrocilo, 'po zamknięciu karty adres nadal nie mógł wejść - pułap liczy trupy');

    // KONTROLA PRZYRZĄDU nr 2: miejsce, które strumienia NIGDY nie otworzyło,
    // liczy się w całości - inaczej seria kliknięć z W-12 znów by przeszła.
    const seria = await s.dosiadz('Klikacz bez strumienia');
    assert.equal(seria.code, 503,
      `miejsce bez strumienia nie liczy się do pułapu - obrona z W-12 padła: ${JSON.stringify(seria.body)}`);
  } finally {
    for (const c of przerwij) { try { c.abort(); } catch { /* juz przerwany */ } }
    s.koniec();
  }
});


// ---------- czy miejsce nadaje się do powrotu ----------

test('miejsce mówi nie tylko CZY istnieje, ale i czy bohater jeszcze gra', async () => {
  // Przeglądarka wraca na zapamiętane miejsce po odświeżeniu strony. Samo
  // „istnieje" nie wystarcza do tej decyzji: miejsce po zmarłym też istnieje,
  // a powrót na nie daje wyłącznie ekran końca, z którego nie ma wyjścia -
  // ekran wejścia mignie i zniknie. Zgłoszone przez właściciela 10.09.2026.
  const s = await serwer();
  try {
    const { body } = await s.dosiadz('Wracający');
    const { code, body: b } = await s.mojeCiało(body.hid, body.token);
    assert.equal(code, 200);
    assert.equal(b.ok, true);
    assert.equal(b.status, 'playing', 'żywe miejsce ma się przedstawiać jako grające');

    // KONTROLA PRZYRZĄDU: obcy znak nadal odbija się o 403, więc odpowiedź
    // „playing" nie bierze się stąd, że punkt końcowy zgadza się na wszystko.
    const zle = await s.mojeCiało(body.hid, 'nie-ten-znak');
    assert.equal(zle.code, 403);
    assert.notEqual(zle.body.status, 'playing');
  } finally { s.koniec(); }
});
