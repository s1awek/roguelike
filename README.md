# Roguelike

Terminalowa gra roguelike w czystym Node. Osiem poziomów lochu, na dnie Smok
Otchłani, wygrywa ten, kto wyniesie Amulet na powierzchnię.

Zero zależności zewnętrznych. Nic do zainstalowania poza samym Node (>= 20).

```bash
node bin/play.js                  # nowa gra
node bin/play.js --seed jaskinia  # ten sam loch za każdym razem
node bin/play.js --continue       # wznów zapis

node bin/bot.js --watch demo      # popatrz, jak gra komputer
node bin/bot.js --games 1000      # tysiąc partii, zbiorczy wynik
node bin/verify.js                # odbiór wg specyfikacji
npm test                          # testy jednostkowe
```

## Sterowanie

| | |
|---|---|
| ruch | strzałki, `hjkl` (bok), `yubn` (skos), klawiatura numeryczna |
| czekaj | `.` albo `5` |
| podnieś | `,` albo `g` |
| schody | `>` w dół, `<` w górę |
| ekwipunek | `i`, potem litera przedmiotu |
| wyrzuć | `d` |
| zapis / wczytaj | `S` / `L` |
| pomoc / wyjście | `?` / `Q` |

Znaki: `@` ty, `!` mikstura, `?` zwój, `)` broń, `[` pancerz, `%` jedzenie,
`"` Amulet. Litery to potwory - małe słabsze, wielkie groźniejsze.

Mikstury i zwoje mają w każdej rozgrywce **inny wygląd**. Czerwona mikstura raz
leczy, raz truje - dowiesz się, dopiero gdy wypijesz.

## Co jest w środku

| Plik | Rzecz |
|---|---|
| [`src/rng.js`](src/rng.js) | generator losowy xorshift128, zasiewany i **serializowalny** |
| [`src/map.js`](src/map.js) | generator lochu przez podział binarny, spójny z konstrukcji |
| [`src/fov.js`](src/fov.js) | pole widzenia - symetryczny shadowcasting na ułamkach całkowitych |
| [`src/path.js`](src/path.js) | A\* z heurystyką Czebyszewa, bez ścinania rogów, plus mapa odległości |
| [`src/items.js`](src/items.js) | przedmioty i losowanie wyglądów per rozgrywka |
| [`src/monsters.js`](src/monsters.js) | bestiariusz i przeciwnik ostateczny |
| [`src/game.js`](src/game.js) | silnik: tury, walka, głód, awanse, poziomy |
| [`src/save.js`](src/save.js) | zapis, wznowienie, **odcisk stanu** |
| [`src/render.js`](src/render.js) | rysowanie w terminalu |
| [`src/bot.js`](src/bot.js) | gracz automatyczny (całkowicie deterministyczny) |

## Trzy rzeczy zrobione inaczej, niż wyszłoby domyślnie

**Pole widzenia jest symetryczne.** Zwykły rekurencyjny shadowcasting potrafi
pokazać pole A z pola B, ale nie odwrotnie, bo rozstrzyga remisy nachyleń w jedną
stronę. Tu nachylenia liczone są na **ułamkach całkowitych**, więc jeśli widzisz
potwora, potwór widzi ciebie. Silnik z tego korzysta: budzenie potworów nie
wymaga liczenia pola widzenia każdemu z osobna.

**Zapis obejmuje stan generatora losowego.** Bez tego wznowiona gra wyglądałaby
identycznie, a toczyła się inaczej. Różnicy tego rodzaju nie widać okiem, więc
jedynym sposobem na jej złapanie jest odcisk całego stanu -
[`fingerprint()`](src/save.js).

**Gracz automatyczny zastępuje testera.** Tysiąc partii bez wywrotki to co innego
niż tysiąc asercji: bot chodzi po ścieżkach, których nikt nie wymyślił.
Cztery wady blokujące ukończenie gry wyszły właśnie tak, nie z testów.

## Odbiór

Specyfikacja: [`docs/acceptance-spec.md`](docs/acceptance-spec.md) - zamrożona
przed pierwszą linią kodu, opisuje zachowanie, nie rozwiązanie.

`node bin/verify.js` sprawdza po kolei każde z dziewięciu kryteriów i **wypisuje
liczbę, na której stoi**. Kryterium bez zmierzonej liczby raportowane jest jako
niesprawdzone, nie jako spełnione.

Osobno warta uwagi jest reguła, której gra pilnuje sama u siebie: **każda kontrola
ma przypadek znany-zły**. Test spójności lochu dostaje poziom z zamurowaną
kieszenią, kontrola wzajemności widzenia dostaje celowo niesymetryczne pole
widzenia, porównanie tras dostaje trasę o krok za długą. Kontrola, która nigdy
niczego nie zgłasza, jest nieodróżnialna od zepsutej.

Dziennik decyzji podjętych w trakcie: [`docs/decyzje.md`](docs/decyzje.md).
Przebieg prac i pomiary: [`docs/przebieg.md`](docs/przebieg.md).
