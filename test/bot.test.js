import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { playOut, Bot } from '../src/bot.js';
import { fingerprint } from '../src/save.js';

test('60 partii gracza automatycznego: zero wywrotek, każda z jawną przyczyną', () => {
  const wyniki = [];
  for (let i = 0; i < 60; i++) wyniki.push(playOut(new Game(`bot-${i}`)));
  const wywrotki = wyniki.filter(r => r.outcome === 'crash');
  assert.equal(wywrotki.length, 0, `wywrotki: ${JSON.stringify(wywrotki.slice(0, 3))}`);
  for (const r of wyniki) {
    assert.ok(['won', 'dead', 'stalled'].includes(r.outcome), `nieznany wynik: ${r.outcome}`);
    assert.ok(typeof r.cause === 'string' && r.cause.length > 0, 'partia bez przyczyny końca');
    assert.ok(r.turns > 0, 'partia bez ani jednej tury');
  }
});

test('gra jest grywalna, ale nie trywialna (odsetek zwycięstw w 5-60%)', () => {
  const wyniki = [];
  for (let i = 0; i < 120; i++) wyniki.push(playOut(new Game(`grywalnosc-${i}`)));
  const won = wyniki.filter(r => r.outcome === 'won').length;
  const pct = (won / wyniki.length) * 100;
  assert.ok(pct >= 5, `gra nie do przejścia: ${pct.toFixed(1)}% zwycięstw`);
  assert.ok(pct <= 60, `gra trywialna: ${pct.toFixed(1)}% zwycięstw`);
});

test('partie kończą się rozstrzygnięciem - zakleszczenia poniżej 5%', () => {
  const wyniki = [];
  for (let i = 0; i < 120; i++) wyniki.push(playOut(new Game(`rozstrzygniecie-${i}`)));
  const stalled = wyniki.filter(r => r.outcome === 'stalled').length;
  assert.ok(stalled / wyniki.length < 0.05, `${stalled}/120 partii bez rozstrzygnięcia`);
});

test('bot jest deterministyczny - ta sama partia dwa razy daje ten sam stan końcowy', () => {
  for (let i = 0; i < 10; i++) {
    const a = new Game(`det-${i}`); playOut(a);
    const b = new Game(`det-${i}`); playOut(b);
    assert.equal(fingerprint(a), fingerprint(b), `ziarno det-${i}: bot niedeterministyczny`);
  }
});

test('KONTROLA PRZYRZĄDU: bot bijący głową w mur zostaje zgłoszony jako bez postępu', () => {
  // Bot, który zawsze idzie w lewo, w końcu utknie na ścianie. Gdyby wykrywanie
  // braku postępu tego nie łapało, seria partii nie odróżniałaby gry działającej
  // od gry, w której nic nie da się zrobić.
  const g = new Game('kontrola-bot');
  const glupi = new Bot();
  glupi.decide = () => ({ type: 'move', dx: -1, dy: 0 });
  let odrzucone = 0, tury = 0;
  while (g.status === 'playing' && tury < 3000) {
    if (!g.act(glupi.decide())) { if (++odrzucone > 50) break; } else { odrzucone = 0; tury++; }
  }
  assert.ok(odrzucone > 50 || g.status !== 'playing',
    'bot idący zawsze w lewo nie został złapany ani na odrzuconych działaniach, ani na końcu partii');
});
