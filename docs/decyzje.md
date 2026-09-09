# Dziennik decyzji podjętych bez pytania właściciela

Tryb autonomiczny: każda decyzja, którą normalnie bym skonsultował, ląduje tutaj
z uzasadnieniem, żeby dała się później zakwestionować.

| # | Decyzja | Uzasadnienie |
|---|---|---|
| D-001 | Czysty Node, ZERO zależności npm | Uprawnienie do npm jest, ale zależność to ryzyko w biegu bez nadzoru (instalacja pada, wersja się zmienia). Rysowanie terminala i testy robi sam Node. Odwracalne. |
| D-002 | Testy na wbudowanym `node:test` | Wbudowane, brak instalacji, `node --test` działa od razu u obcego (kryterium 9). |
| D-003 | ESM (`"type": "module"`) | Spójne z resztą stanowiska, brak transpilacji. |
| D-004 | PRNG: xorshift128 własny, nie `Math.random` | Kryterium 1 wymaga powtarzalności z ziarna. `Math.random` nie da się zasiać. |
