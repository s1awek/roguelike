# Dziennik decyzji podjętych bez pytania właściciela

Tryb autonomiczny: każda decyzja, którą normalnie bym skonsultował, ląduje tutaj
z uzasadnieniem, żeby dała się później zakwestionować.

| # | Decyzja | Uzasadnienie |
|---|---|---|
| D-001 | Czysty Node, ZERO zależności npm | Uprawnienie do npm jest, ale zależność to ryzyko w biegu bez nadzoru (instalacja pada, wersja się zmienia). Rysowanie terminala i testy robi sam Node. Odwracalne. |
| D-002 | Testy na wbudowanym `node:test` | Wbudowane, brak instalacji, `node --test` działa od razu u obcego (kryterium 9). |
| D-003 | ESM (`"type": "module"`) | Spójne z resztą stanowiska, brak transpilacji. |
| D-004 | PRNG: xorshift128 własny, nie `Math.random` | Kryterium 1 wymaga powtarzalności z ziarna. `Math.random` nie da się zasiać. |
| D-005 | Powolna regeneracja życia gracza (1 pkt co `max(8, 24-poziom)` tur) | Bez niej partia jest ciągiem strat bez odbicia. Zmierzone: 30 partii, 0 zwycięstw, śmierć na poziomie 5-7. To zmiana ZASAD GRY, nie strojenie liczb, więc idzie do dziennika. |
| D-006 | Przedmioty mogą leżeć w stosie na jednym polu | Zakaz odkładania na zajęte pole wyglądał na porządkujący, a czynił grę nieukończalną: z pełnym plecakiem stojąc na Amulecie nie dało się zrobić NICZEGO. Zmierzone na ziarnie `s4`. |
| D-007 | Odbiór końcowy = seria 1000 partii bota, nie agent `acceptance-verifier` | Zgody właściciela na fazę 3 nie ma, a projekt jest zabawowy. Bot przeszedł ścieżki, których nie wymyśliłby żaden test jednostkowy - znalazł 4 wady blokujące ukończenie gry. |
| D-008 | Bot ma pamięć porzuconych przedmiotów i próg wartości przy podnoszeniu | Bez tego wpadał w pętlę porzuć-podnieś i partia nie kończyła się nigdy. Wada wyglądała jak zakleszczenie gry, a była wadą przyrządu pomiarowego. |
| D-009 | Równowaga strojona DWUKROTNIE, w obie strony | Po pierwszym strojeniu 83% zwycięstw, czyli powyżej progu 60% ze spec-a. Gra trywialna jest zepsuta tak samo jak gra nie do przejścia; kryterium 7 jest przedziałem, nie minimum. |
| D-010 | Limit tur na partię: JEDNA stała `MAX_TURNS = 12000` w `src/bot.js`, używana przez CLI, odbiór i testy | Ten sam parametr miał trzy różne wartości domyślne w trzech miejscach (4000 w bibliotece, 8000 w CLI, 4000 w odbiorze przez dziedziczenie). Wartość wynika z pomiaru przy limicie 20000: najkrótsza wygrana 4068 tur, mediana 6444, najdłuższa 8448, zero partii nierozstrzygniętych na 150. 12000 leży 1,4x powyżej najdłuższej zaobserwowanej wygranej, czyli nie jest czynnikiem wiążącym wynik. |
| D-011 | Przedmiot niemożliwy do podniesienia ani wymiany trafia do zbioru `dropped`; pole pod nogami nie jest celem podróży | Naprawa W-6. Zbiór `dropped` z D-008 rozwiązywał oscylację porzuć-podnieś, ale tworzył stan bez wyjścia: pełny plecak plus wszystkie porzucalne przedmioty już w zbiorze = bot krąży wokół przedmiotu, którego nie może wziąć. Wąska, lokalna zmiana - partie kontrolne kończą się identycznie co przed nią. |
