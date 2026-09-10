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
  const p = spawn('node', ['bin/server.js', '--port', String(port), '--boty', '2',
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
    assert.match(odmowa.body.blad, /z tego adresu/,
      `odmowa podaje inną przyczynę niż pułap adresu: ${odmowa.body.blad}`);
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
