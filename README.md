# Roguelike

Gra roguelike w czystym Node. Osiem poziomów lochu, na dnie Smok Otchłani,
wygrywa ten, kto wyniesie Amulet na powierzchnię. Z Amuletem w ręku loch się
budzi: każde piętro w drodze na górę dostaje nowych, groźniejszych mieszkańców.

Dwie skóry na jednym silniku: **terminalowa** (znaki ANSI) i **graficzna**
(płótno w przeglądarce). Zasady, losowanie i zapisy są wspólne - to ten sam
`Game`, a nie dwie gry.

Zero zależności zewnętrznych. Nic do zainstalowania poza samym Node (>= 20).

```bash
npm run web                       # wersja graficzna: http://localhost:8080/web/

node bin/play.js                  # nowa gra
node bin/play.js --seed jaskinia  # ten sam loch za każdym razem
node bin/play.js --continue       # wznów zapis
node bin/play.js --lang pl        # po polsku (domyślnie po angielsku)

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
| obejrzyj rzecz pod nogami (bez podnoszenia) | `x` |
| wyrzuć | `d` |
| powąchaj miksturę | `w`, potem litera |
| zapis / wczytaj | `S` / `L` |
| księga zasad / wyjście | `?` / `Q` |
| minimapa (tylko przeglądarka) | `m` |
| nowa gra (tylko przeglądarka) | `Shift`+`N` |

Język: angielski domyślnie, polski do wyboru - w przeglądarce przełącznik EN | PL
na pasku stanu albo adres z `?lang=pl`, w terminalu `--lang pl`. Wybór zmienia
wyłącznie opis gry, nie jej przebieg; zapisy są wspólne dla obu języków.

Znaki: `@` ty, `!` mikstura, `?` zwój, `)` broń, `[` pancerz, `%` jedzenie,
`"` Amulet. Litery to potwory - małe słabsze, wielkie groźniejsze.

## Zasady

Pełne reguły - walka, rozwój, głód, przedmioty, rozpoznawanie mikstur, pole
widzenia - są w **[księdze zasad](docs/zasady.md)** (po angielsku: [rules.md](docs/rules.md)). Ta sama treść jest dostępna
w trakcie gry pod klawiszem `?`, w obu wersjach, i nie może się z plikiem
rozjechać: jedno źródło w [`src/rules.js`](src/rules.js), z którego plik jest
generowany przez `npm run zasady`. Liczby w tabelach nie są przepisane ręcznie -
liczą się z tych samych tablic, których gra używa w rozgrywce.

### Skąd wiedzieć, co robi mikstura

Rodzaje mikstur są stałe, ale ich **wygląd** jest losowany na każdą rozgrywkę:
„czarna mikstura" znaczy co innego w każdej partii, a to samo przez całą jedną
partię. Wiedzę zdobywa się czterema drogami, od najtańszej:

1. **Powąchaj** (`w`) - kosztuje jedną turę, nie kosztuje życia. Zapach dzieli
   mikstury na dwie pary i nigdy nie wskazuje jednej: mówi „to mnie nie zaboli"
   albo „to jest siła albo trucizna". Zapach zostaje przy nazwie w plecaku.
2. **Policz** - mikstura leczenia jest najczęstsza, więc barwa widywana raz na
   partię raczej nią nie jest.
3. **Wyklucz** - rodzaje są cztery, więc gdy znasz trzy, czwarta barwa jest
   przesądzona. Gdy przesądzona jest para zapachowa, wykluczenie robi sama gra.
4. **Zwój rozpoznania** - rozpoznaje na pewno wszystkie nieznane mikstury
   i zwoje, które masz w plecaku w tej chwili.

Rozpoznanie działa na **rodzaj, nie na sztukę**: gdy raz się dowiesz, czym jest
perlista mikstura, wszystkie perliste mikstury noszą już prawdziwą nazwę.

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
| [`src/serialize.js`](src/serialize.js) | serializacja stanu, **bez zależności od środowiska** |
| [`src/save.js`](src/save.js) | zapis do pliku, **odcisk stanu** (tylko Node) |
| [`src/bytes.js`](src/bytes.js) | base64 bez `Buffer` - wspólne dla terminala i przeglądarki |
| [`src/render.js`](src/render.js) | rysowanie w terminalu |
| [`src/bot.js`](src/bot.js) | gracz automatyczny (całkowicie deterministyczny) |
| [`web/draw.js`](web/draw.js) | rysowanie na płótnie: kafle, światło, sylwetki |
| [`web/view.js`](web/view.js) | stan wizualny - płynny ruch, błyski, liczby obrażeń |
| [`web/main.js`](web/main.js) | wejście, HUD, zapis w przeglądarce |
| [`src/rules.js`](src/rules.js) | księga zasad - jedno źródło dla gry i dla `docs/zasady.md` |
| [`src/i18n.js`](src/i18n.js), [`src/lang/`](src/lang/) | słowniki `pl` i `en`; tłumaczenie dzieje się przy pokazaniu, stan gry zna tylko polskie identyfikatory |
| [`tools/browser.js`](tools/browser.js) | sterownik przeglądarki po CDP - przyrząd, którym mierzone są twierdzenia o wersji graficznej |
| [`bin/serve.js`](bin/serve.js) | serwer plików statycznych, bez zależności |

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
**Sześć wad blokujących ukończenie gry** wyszło właśnie tak, nie z testów - w tym
dwie ostatnie dopiero przy odbiorze, a jedna z nich była wadą samego przyrządu
pomiarowego (patrz [`docs/przebieg.md`](docs/przebieg.md), W-5 i W-6).

Wynik ostatniej serii: **1000 partii, 318 zwycięstw (31,8%), 682 śmierci,
zero zakleszczeń, zero wywrotek**, średnio 4321 tur na partię, 552 s.

## Wersja graficzna

```bash
npm run web        # potem http://localhost:8080/web/
```

Serwer jest potrzebny wyłącznie dlatego, że moduły ES nie ładują się z `file://`.
Serwuje katalog projektu, bo `web/` importuje silnik wprost z `src/` - bez
budowania, bez pakowania, bez kopii kodu gry.

Sterowanie jest to samo co w terminalu, z dodatkami, które mają sens tylko przy
myszy i karcie przeglądarki: **kliknięcie w poznane pole** rusza marsz (zatrzymuje
się sam, gdy w polu widzenia pojawi się potwór, gdy spadną punkty życia albo gdy
pod nogami znajdzie się przedmiot), `m` włącza i wyłącza **minimapę**, a `Shift`+`N`
zaczyna nową grę.

**Minimapa** rysuje plan poziomu w prawym górnym rogu. Obowiązuje ją ten sam
warunek co planszę: pokazuje wyłącznie pola widoczne albo zapamiętane, a potwory
i przedmioty tylko wtedy, gdy są widoczne **teraz** - pamięć dotyczy kształtu
lochu, nie tego, kto po nim chodzi. Ramka na planie to wycinek widoczny na
ekranie; kliknięcie w plan zleca marsz tak samo jak kliknięcie w planszę.

**Autozapis.** Gra zapisuje się sama po każdej turze, więc odświeżenie strony,
zamknięcie karty ani przypadkowe `Ctrl+W` nie kosztują rozgrywki - po powrocie
stan jest ten sam co do tury i ziarna losowania. Autozapis siedzi pod osobnym
kluczem niż zapis ręczny (`S`), więc go nie nadpisuje: `S` zostaje świadomym
punktem kontrolnym, do którego wraca `L`. Po śmierci albo zwycięstwie autozapis
znika, żeby odświeżenie dawało nową grę, a nie wieczny ekran końcowy. Adres
z jawnym ziarnem (`?seed=...`) ma pierwszeństwo: wraca do autozapisu tylko wtedy,
gdy dotyczy tego samego ziarna.

Co rysunek mówi, a czego nie mówi:

- **Jasne i ciepłe** - widzisz teraz. **Zimne i przygaszone** - pamiętasz
  z wcześniej, więc ruchu potworów tam nie zobaczysz. **Czarne** - nieznane.
  To dokładnie ten sam podział co w terminalu; grafika nie daje przewagi.
- Barwa flaszki to jej **wygląd**, nie działanie. Ta sama barwa znaczy to samo
  przez całą rozgrywkę - ale co znaczy, trzeba sprawdzić. Ikona w plecaku jest
  rysowana tą samą funkcją co przedmiot na podłodze, więc nie da się ich rozjechać.
- Kamera idzie za graczem, gdy poziom nie mieści się na ekranie w czytelnej skali;
  na szerokim ekranie pokazuje cały poziom naraz.

Zapisy są **wymienne między wersjami**: ten sam JSON, bajt w bajt. Wersja
terminalowa trzyma go w pliku (`~/.roguelike-save.json`), graficzna w pamięci
przeglądarki (`localStorage`).

## Wielu graczy w jednym lochu

```
npm run stol            # serwer partii, domyślnie port 8080
npm run stol -- --port 8099 --boty 5 --map 120x32
```

Potem `http://localhost:8080/web/wielu.html`. Loch jest zamieszkany od pierwszej
chwili: brakujące miejsca zajmują gracze automatyczni, ci sami, którymi mierzona
jest równowaga gry - więc przeciwnik jest porównywalny z człowiekiem, a nie
atrapą.

**Reguła tury.** Dopóki nikogo nie widzisz, chodzisz własnym tempem i nikt na
ciebie nie czeka. Gdy stajesz w polu widzenia innego gracza, wasza tura
rozstrzyga się **jednocześnie**: oboje zgłaszacie działanie w ślepo i oboje
działacie w tej samej turze. Nikt nie dostaje darmowej serii ciosów, więc
odskok jest zawsze wykonalny - ale i nikt nie ucieka darmowo, bo goniący też
się rusza.

**Stawka.** Przegrane starcie nie kończy partii. Gubisz cały dobytek na miejscu,
łącznie z Amuletem, i budzisz się piętro wyżej z resztką sił. Zwycięzca ma po
co bić, przegrany ma po co wracać.

**Co wspólne, a co własne.** Loch jest jeden: przedmiot podniesiony przez kogoś
innego już tam nie leży, a zabity potwór jest martwy dla wszystkich. Ale
odkryta mapa, dziennik zdarzeń i wiedza o miksturach są twoje własne - wejście
na cudzy poziom nie odsłania cudzych korytarzy. Wygląd mikstur jest wspólny na
całą partię, bo loch jest jeden.

Serwer trzyma stan i wysyła każdemu **osobną migawkę**: tylko jego pamięć
terenu, tylko potwory z pól, które właśnie widzi, tylko tych graczy, których
widać. Przeglądarka nie dostaje obiektu gry, więc czego nie ma w migawce, tego
nie ma na ekranie.

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

Ostatni pełny odbiór: **9/9 kryteriów**, na zestawie ziaren niezależnym od tego,
na którym strojono grę (1000 partii: 0 wywrotek, 1 partia bez rozstrzygnięcia,
29,3% zwycięstw).

Dziennik decyzji podjętych w trakcie: [`docs/decyzje.md`](docs/decyzje.md).
Przebieg prac i pomiary: [`docs/przebieg.md`](docs/przebieg.md).
