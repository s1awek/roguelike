# Przebieg prac i pomiary

Dokument opisuje, co zostało zmierzone i czym. Liczby pochodzą z przebiegów
opisanych przy nich; twierdzenia bez pomiaru są oznaczone jako hipotezy.

## Warunki brzegowe

Praca prowadzona bez nadzoru człowieka, w jednym ciągu, z zamrożoną specyfikacją
(`docs/acceptance-spec.md`) napisaną przed pierwszą linią kodu. Decyzje, które
normalnie trafiłyby do konsultacji, są w `docs/decyzje.md`.

## Cztery wady blokujące ukończenie gry

Wszystkie cztery znalazł **gracz automatyczny**, nie testy jednostkowe. Każda
objawiała się tak samo - partia bez rozstrzygnięcia - i każda miała inną przyczynę.
To jest argument za odbiorem przez rozegranie, a nie przez asercje: testy sprawdzają
to, co autor pomyślał, że może się zepsuć.

**W-1. Gra nie do wygrania z powodu braku regeneracji.**
`[ustalone - 30 partii, 0 zwycięstw, śmierć na poziomach 5-7]` Postać nie
odzyskiwała życia w żaden sposób poza miksturami. Napraw: D-005.

**W-2. Pełny plecak na Amulecie zamykał grę na amen.**
`[ustalone - ziarno s4, tura 3556, poziom 8, smok zabity, Amulet pod nogami,
plecak 16/16]` Podniesienie odrzucone przez limit, odłożenie odrzucone przez
zajęte pole. Bot czekał do końca limitu tur. Napraw: D-006 plus porzucanie
balastu po stronie bota.

**W-3. Granica eksploracji nie wyczerpywała się nigdy.**
`[ustalone - ziarno s0, 14 pól granicy utrzymujących się w nieskończoność]`
Pole sąsiadujące z niewidzianą litą skałą liczyło się jako granica na zawsze,
bo skała nigdy nie zostanie zapamiętana. Bot krążył po zbadanym poziomie zamiast
zejść niżej. Napraw: zbiór pól wyczerpanych plus budżet czasu na poziom.

**W-4. Pętla porzuć-podnieś.**
`[ustalone - ziarno s0, tura 3803-3812, naprzemiennie drop i pickup w tym samym
miejscu]` Podnoszenie nie miało progu wartości, więc bot natychmiast brał z
powrotem to, co przed chwilą odłożył jako balast. Napraw: D-008.

## W-5. Piąta wada: przyrząd mierzył co innego niż narzędzie

`[ustalone - pomiar 150 partii przy limicie 20000 tur, 09.09 ok. 18:57]`
Znaleziona na samym końcu, przy pierwszym uruchomieniu pełnego zestawu testów.

Limit tur na partię miał **trzy różne wartości domyślne w trzech miejscach**:
4000 w `src/bot.js` (biblioteka), 8000 w `bin/bot.js` (CLI serii), a `bin/verify.js`
dziedziczył 4000, bo wołał `playOut` bez opcji. Seria 1000 partii chodziła więc
na 8000, a odbiór akceptacyjny i testy jednostkowe na 4000.

Skutek jest ostrzejszy, niż wygląda: **najkrótsza wygrana partia trwa 4068 tur**,
czyli limit 4000 leżał PONIŻEJ progu przechodniości gry. Przy nim odsetek zwycięstw
wychodził zerowy niezależnie od równowagi - zmierzone na trzech niezależnych
zestawach ziaren (`grywalnosc-` 0/120, `rozstrzygniecie-` 0/120, `bot-` 0/60).
Kryteria 6-8 spec-a poszłyby na FAIL z powodu, który nie ma nic wspólnego z grą.

**Co to unieważnia w tym dokumencie.** Zapisane wcześniej „partie bez rozstrzygnięcia"
(26 na 1000, 2,6%) **nie były zakleszczeniami**, tylko obcięciami limitem. Przy limicie
20000 partii nierozstrzygniętych jest **zero na 150**, a ziarna `s22` i `s142`,
figurujące na liście zakleszczeń serii, rozstrzygają się normalnie. Hipotezy o
blokujących potworach i granicy eksploracji dotyczyły zjawiska, które w znacznej
części generował mój własny limit.

Naprawa: jedna eksportowana stała (D-010) plus kontrola przyrządu w
`test/bot.test.js` - test przechodzi tylko wtedy, gdy ta sama partia przy limicie
4000 zostaje ucięta, a przy limicie produkcyjnym się rozstrzyga. Bez tej drugiej
połowy asercja nie mierzyłaby niczego.

## W-6. Szósta wada: lekarstwo na W-4 stworzyło własne zakleszczenie

`[ustalone - instrumentacja partii `grywalnosc-0`, 09.09 ok. 19:08]`
Znaleziona przez kontrolę przyrządu dopisaną przy naprawie W-5 - test miał
tylko ilustrować wpływ limitu tur, a wywrócił się na partii, która nie kończy
się przy ŻADNYM limicie (sprawdzone: 4000, 12000, 30000, 80000 - zawsze postój
na turze 4096, głębokość 7, pełne HP).

Ślad z instrumentacji: przez ostatnie 400 tur bot wykonuje dokładnie dwa ruchy
naprzemiennie, `(43,6) -> (44,5) -> (43,6)`, z celem `item`. Stan: plecak pełny
(16/16), pod nogami zwój, cztery przedmioty w zbiorze `dropped`.

Mechanizm to zderzenie dwóch kroków drabiny decyzyjnej:
- **krok 5** (`src/bot.js`, „przedmiot pod nogami") nie podnosi, bo plecak pełny,
  i nie wymienia, bo leżący zwój jest wart mniej niż najgorszy noszony - **nie robi
  nic i przepuszcza dalej**;
- **krok 8** („idź po przedmiot") obiera ten sam zwój za cel, bo nie jest w
  `dropped` i jest wart więcej niż próg - i każe do niego iść, mimo że bot **na
  nim stoi**.

Bot wychodzi o jedno pole i natychmiast wraca, bo znów jest najbliższy.

Wada jest o tyle pouczająca, że **zrodziło ją lekarstwo na W-4**: zbiór `dropped`
(D-008) powstał po to, żeby bot nie podnosił z powrotem tego, co przed chwilą
porzucił. Skutkiem ubocznym jest stan, w którym wszystkie porzucalne przedmioty
są już w zbiorze, więc żaden nie nadaje się na wymianę - i pułapka się zatrzaskuje.

Naprawa dotyka obu stron pętli: przedmiot, którego nie da się ani podnieść, ani
wymienić, trafia do `dropped` (przestaje być celem), a krok 8 nie obiera za cel
pola, na którym bot już stoi. Po naprawie `grywalnosc-0` kończy się śmiercią
na turze 4041, a partie `grywalnosc-5`, `s22` i `s142` kończą się zwycięstwem
z identyczną liczbą tur co przed naprawą.

## Fałszywa diagnoza, którą zapisano zamiast usunąć

Pierwsza hipoteza dla W-3 brzmiała: „śpiący potwór blokuje korytarz, więc cel jest
nieosiągalny". Poprawka została napisana i wdrożona - **i wynik serii nie zmienił
się ani o jedną partię** (24 zwycięstwa, 9 partii bez rozstrzygnięcia, przed i po).
Dopiero to obaliło hipotezę i skierowało diagnozę na granicę eksploracji.

Poprawka została w kodzie, bo sama w sobie jest sensowna (plan awaryjny trasy),
ale **nie była naprawą tej wady**. Zapisane tutaj, żeby nikt nie odtwarzał
rozumowania od zera i nie uznał jej za dowód czegokolwiek.

## Strojenie równowagi

Kryterium 7 spec-a jest **przedziałem** 5-60%, nie minimum. Kolejne pomiary
(40-60 partii na przebieg):

| Stan | Zwycięstwa | Uwaga |
|---|---|---|
| przed regeneracją | 0% | gra nie do przejścia |
| po regeneracji, przed naprawą W-2..W-4 | 0-60% | zdominowane przez partie bez rozstrzygnięcia |
| po naprawach, przed strojeniem w górę trudności | **83%** | gra trywialna, ODPADA na kryterium 7 |
| po strojeniu (wolniejsza regeneracja, więcej i mocniejszych potworów, mocniejszy smok) | **23%** | wewnątrz przedziału |

## Wydajność

`[ustalone - pomiar na tej maszynie]` Około 0,5 s na partię, czyli seria tysiąca
partii zajmuje 8-9 minut. Dwie decyzje, bez których byłoby wielokrotnie wolniej:
potwory schodzą po jednej mapie odległości zamiast liczyć A\* każdy z osobna,
a bot zapamiętuje trasę między turami zamiast wyznaczać ją od nowa.

## Wynik końcowy: trzy serie po 1000 partii

Rozdzielenie wpływu obu ostatnich napraw. Ta sama gra, te same ziarna `s0..s999`:

| seria | limit tur | naprawa W-6 | zwycięstwa | zakleszczenia | wywrotki |
|---|---|---|---|---|---|
| v1 | 8000 | nie | 300 (30,0%) | 26 (2,6%) | 0 |
| v2 | 12000 | nie | 319 (31,9%) | 6 (0,6%) | 0 |
| v3 | 12000 | tak | **318 (31,8%)** | **0** | 0 |

Czyta się to tak: **20 z 26 „zakleszczeń" było obcięciami limitu** (znikają po
samym podniesieniu limitu, przy niezmienionym kodzie gry), a pozostałe 6 to była
jedna wada - W-6. Wszystkie sześć ziaren rozstrzyga się po naprawie: `s436`,
`s627`, `s809`, `s984` zwycięstwem, `s673` i `s695` śmiercią.

Odsetek zwycięstw nie drgnął między v2 a v3 (31,9% -> 31,8%), co jest oczekiwane:
naprawa dotyczy sytuacji występującej w 6 partiach na 1000 i nie zmienia równowagi.

**Odbiór końcowy poszedł na innym zestawie ziaren** (`odb-bot-0..999`) niż ten,
na którym strojono grę - 9/9 kryteriów, 29,3% zwycięstw, 0 wywrotek. Została tam
**1 partia bez rozstrzygnięcia na 1000 (0,1%)**, czyli przypadek, którego naprawa
W-6 nie obejmuje. `[hipoteza]` to kolejna odmiana tej samej rodziny pułapek
decyzyjnych bota; nie diagnozowana, bo wyszła po granicy czasu przyjętej dla
tego przebiegu. **Nie twierdzę, że zakleszczenia są wyeliminowane** - twierdzę,
że zeszły z 2,6% do rzędu 0,1%.

## Czego NIE sprawdzono

- `[hipoteza]` Zachowanie na terminalu węższym niż 80 kolumn. Układ zakłada 80x24
  i wyśrodkowuje się na szerszym; węższe okno nie było testowane.
- `[hipoteza]` Zachowanie przy oknie zmienianym w trakcie rozgrywki - obsługa
  zdarzenia `resize` istnieje, ale nie została zmierzona.
- Rozgrywka z udziałem człowieka była uruchamiana wyłącznie jako kontrola startu
  (`--help`, odmowa startu bez terminala). Sterowanie klawiaturą **nie zostało
  przeklikane przez człowieka** - to jedyne miejsce, gdzie odbiór opiera się na
  lekturze kodu, a nie na przebiegu.

## Wersja graficzna (2026-09-10)

Silnik dał się przenieść do przeglądarki bez zmiany zasad: `src/game.js` i cała
jego rodzina nie importowały niczego z `node:`. Rozcięcia wymagał wyłącznie
`src/save.js`, który mieszał czystą serializację z dostępem do dysku - część
czysta wyjechała do `src/serialize.js`, plikowa została.

Odbiór szedł **przez prowadzenie prawdziwej przeglądarki**, nie przez lekturę
kodu: sterownik po protokole debugowania Chrome (`bin`-owo nieobecny, plik roboczy
poza repozytorium, ~90 linii, zero zależności - Node 22 ma wbudowanego klienta
WebSocket) wciskał klawisze, klikał, zmieniał rozmiar okna, robił zrzuty i zbierał
konsolę. Sceny do oglądania budował bot: partie prowadzone do stanu „poziom 3,
dwa potwory w polu widzenia, niepełne życie" i „poziom 8, smok w polu widzenia".

### W-7: `Buffer is not defined` przy wczytywaniu zapisu

`[ustalone - komunikat odczytany ze zrzutu ekranu, poziom nie drgnął z 1]`
Cztery miejsca w `src/game.js` i `src/map.js` kodowały tablice bajtów przez
`Buffer.from(...).toString('base64')`. W Node działa, w przeglądarce `Buffer`
nie istnieje. Wada była **niewidoczna z poziomu kodu w Node** - tam wszystkie
34 testy przechodziły - i **niewidoczna w konsoli przeglądarki**, bo `loadFromString`
łapie każdy wyjątek i zamienia go w komunikat dla gracza (spec §7). Wyszła dopiero
z odczytania paska komunikatu na zrzucie.

Naprawa: `src/bytes.js` na `btoa`/`atob`. Kontrola: zapis wytworzony jeszcze
starym kodem wczytuje się nowym i serializuje z powrotem do **identycznego**
napisu, więc odciski stanu i zapisy z terminala pozostają ważne.

### W-8: układ potrafił rosnąć, ale nigdy maleć

`[ustalone - trzy pomiary szerokości płótna: 2560 -> 560 -> 1024]`
Płótno ma jawną szerokość w pikselach. Jako zwykły element siatki wymuszało przez
to minimalną szerokość rodzica, więc po zmniejszeniu okna pomiar `#stage`
zwracał **starą, większą wartość** i przeliczenie kafli dostawało nieprawdziwe
wejście. Objaw: po powiększeniu okna i zmniejszeniu go z powrotem gracz znikał
poza kadrem, a widok pokazywał losowy fragment mapy.

Wada nie zgłasza się jako błąd - konsola była czysta przez cały czas. Naprawa:
płótno wyjęte z przepływu (`position: absolute`) plus `min-width/min-height: 0`.

### W-9: wczytanie skończonej partii nie pokazywało ekranu końcowego

`[ustalone - stan `dead` po wczytaniu, brak nakładki]` Ekran końcowy pokazywał
wyłącznie `act()`. Zapis zrobiony tuż przed śmiercią wczytywał się więc do
planszy, na której nic nie reaguje i nic tego nie tłumaczy.

### Pułapka przyrządu, nie gry

`[ustalone - nasłuch `keydown` wypisał odebrane nazwy klawiszy]` Sterownik
wysyłał wielkie litery bez bitu Shift, więc do strony docierało `l` zamiast `L` -
czyli „ruch w prawo" zamiast „wczytaj". Wyglądało to jak wada wczytywania i przez
jedną rundę było diagnozowane jako wada gry. Rozstrzygnęło dopiero zapytanie
strony wprost, co odbiera, zamiast wnioskowania z zachowania.

### Co sprawdzone przebiegiem, a nie lekturą

| Rzecz | Dowód |
|---|---|
| ruch klawiszami | tura 0 -> 6 po 9 wciśnięciach (3 zablokowane ścianą) |
| ekwipunek, pomoc, wyjście z nakładek | tryb `map` -> `inventory` -> `map` |
| marsz po kliknięciu | gracz (27,12) -> (22,12), 5 tur, zatrzymał się sam |
| zapis i wznowienie w przeglądarce | tura 23 -> zapis -> 26 -> wczytanie -> 23 |
| śmierć i ekran końcowy | HP 5 -> ataki -> status `dead`, tryb `over` |
| liczby obrażeń i błysk trafienia | zrzut z `-5` nad trollem i `-4` nad graczem |
| zgodność zapisów z wersją terminalową | ponowna serializacja identyczna z oryginałem |
| okno 2560, 1440, 1024, 560 px | płótno przelicza się w obie strony |
| konsola przeglądarki | zero błędów i wyjątków w każdym przebiegu |

### Czego nadal NIE sprawdzono

- `[niezweryfikowane]` Rozgrywka z udziałem **człowieka** - w obu wersjach.
  Klawisze były wciskane przez sterownik, nie przez palce.
- `[niezweryfikowane]` Zachowanie na urządzeniu dotykowym. Marsz po kliknięciu
  powinien działać, ale nie ma sterowania gestami ani przycisków ekranowych.
- `[niezweryfikowane]` Przeglądarki inne niż oparte na Chromium.
- `[hipoteza]` Wydajność przy bardzo dużym oknie. Rysowanie jest ograniczane do
  kafli mieszczących się na ekranie, więc nie powinno rosnąć z rozmiarem mapy -
  ale liczby klatek nie mierzono.

### W-10 (WYCOFANE jako wada, zostaje jako utwardzenie): „<" wchodziło do gry jako przecinek

`[ustalone - zgłoszenie właściciela plus odtworzenie zdarzenia klawiatury]`
Zgłoszenie brzmiało: „naciskam `<`, a widzę »Nie ma tu nic do podniesienia«".
Ten komunikat pochodzi **wyłącznie** z `pickUp()` ([`src/game.js`](../src/game.js));
wejście po schodach mówi „Nie ma tu schodów w górę." albo „Nie wrócisz z pustymi
rękami.". To wystarczyło, żeby wykluczyć wadę w samym wchodzeniu i zawęzić rzecz
do warstwy wejścia: do gry docierał przecinek, nie `<`.

Przyczyna leży w tym, że `e.key` niesie **znak**, a znak zależy od układu
klawiatury. Na części układów Shift nie zmienia zgłaszanego znaku, więc pod
klawiszem przecinka gra widzi przecinek niezależnie od tego, czy Shift jest
wciśnięty. Wersji terminalowej to nie dotyczy - tam przychodzi gotowy bajt `<`.

Naprawa: gdy Shift jest wciśnięty, o znaczeniu rozstrzyga `e.code`, czyli
**położenie klawisza**, niezależne od układu (`SHIFTED_BY_CODE`
w [`web/main.js`](../web/main.js)). Objęte: `<` `>` `?` `S` `L` `Q`.

Kontrola przyrządu - trzy przypadki, wszystkie zmierzone przez odtworzenie
zdarzenia klawiatury w przeglądarce:

| Przypadek | Co wysłano | Oczekiwane | Zmierzone |
|---|---|---|---|
| układ gubi Shift | `key: ','`, `code: Comma`, Shift | wejście w górę | „Wracasz na poziom 1." |
| układ zwraca znak | `key: '<'`, `code: Comma`, Shift | wejście w górę | „Wracasz na poziom 1." |
| **kontrola, znany-dobry** | `key: ','`, `code: Comma`, bez Shift | podniesienie | „Nie ma tu nic do podniesienia." |

Ten trzeci wiersz jest tu po to, żeby naprawa nie zjadła zwykłego przecinka.
Analogicznie sprawdzone: Shift+kropka schodzi w dół, sama kropka czeka,
Shift+ukośnik otwiera pomoc, Shift+s zapisuje, `i` otwiera plecak.

Przy okazji doszedł dziennik ostatnich klawiszy pod `roguelike.keys` - do
odczytania w konsoli przeglądarki, gdy sterowanie znów zachowa się nie tak.
Notuje `key`, `code`, stan Shiftu i to, jak gra ostatecznie klawisz zrozumiała.

**SPROSTOWANIE, ten sam dzień, w godzinę po powyższym.** Właściciel zgłosił, że
z wciśniętym Shiftem dostaje „Nie wrócisz z pustymi rękami. Amulet czeka w głębi.",
czyli komunikat prawidłowy dla schodów w górę na poziomie 1. **To obala hipotezę
o układzie klawiatury gubiącym Shift na jego maszynie**: gdyby Shift ginął, ten
komunikat nie miałby jak się pojawić.

Wynika z tego, że pierwotne naciśnięcie było **samym przecinkiem, bez Shiftu** -
a więc `[obalone]` „gra źle interpretuje `<`". Wady w grze nie było; był rozjazd
między tym, co gracz chciał nacisnąć, a tym, co nacisnął.

Zmiana zostaje, ale **przekwalifikowana z naprawy wady na utwardzenie**: obsługuje
układy, na których Shift faktycznie nie zmienia zgłaszanego znaku, i jest poparta
kontrolą znanego-dobrego przypadku. Nie wolno jej cytować jako „naprawy zgłoszenia
z 10.09" - zgłoszenie miało inną przyczynę.

Wniosek metodyczny, bo powtarzalny: **komunikat gry wskazał warstwę (do gry doszedł
przecinek) i to było `[ustalone]`, ale POWÓD, dla którego doszedł przecinek, wziąłem
z hipotezy o układzie klawiatury i zacząłem pod nią budować naprawę, zamiast najpierw
zapytać, czy Shift w ogóle był wciśnięty.** Tańsze pytanie stało przed droższą
naprawą i zostało pominięte.

## Wątek 4: czytelność, minimapa, autozapis (2026-09-10)

Trzy zgłoszenia właściciela po pierwszej dłuższej rozgrywce w przeglądarce:
tekst panelu za mały i za szary, brak minimapy, odświeżenie strony resetuje grę.
Żadne z nich nie było wadą działania - to były braki. Zmiany siedzą wyłącznie
w `web/`; `src/` nie zostało tknięte, więc wersja terminalowa i bot mierzą
dokładnie tę samą grę co przed nimi (`git diff --stat` pokazuje cztery pliki,
wszystkie w `web/`).

### Warstwa sieciowa: trzy warstwy, każda sprawdzalna osobno

Silnik został po przebudowie czystą funkcją stanu i ziarna, i taki ma zostać -
kryterium 1 pierwotnej specyfikacji na tym stoi. Zegar ścienny jest źródłem
nieodtwarzalności, więc trafił do warstwy nad silnikiem:

- **`src/stol.js`** - rozjemca tury. Wie, kiedy uczestnik idzie własnym tempem,
  a kiedy tura jest wspólna, i jak długo czekać na kogoś, kto nie odpowiada.
  Zegar jest w nim podstawialny, więc dziewięć testów tej warstwy nie śpi ani
  sekundy - w tym test kryterium 18, którego przedtem nic nie pilnowało.
- **`src/widok.js`** - migawka dla jednego uczestnika. To ona jest granicą
  uczciwości partii: `[ustalone - próba na dwóch klientach]` migawka Anki nie
  niesie nawet imienia Bolka, dopóki go nie widzi.
- **`bin/server.js`** - serwer. Strumień serwera do przeglądarki, POST z
  powrotem (D-027).
- **`web/cien.js`** - atrapa po stronie przeglądarki. Rysownik czyta z obiektu
  gry tylko rozmiar poziomu, rodzaj kafla, własne położenie, widoczne byty
  i dwa pytania o widoczność - więc **ten sam rysownik** obsługuje obie wersje
  gry. Gdyby czytał więcej, trzeba by drugiego.

`[ustalone - dwóch klientów przez sieć, bez przeglądarki, `.workspace/klient-proba.mjs`]`
Dwoje ludzi dosiadło, zobaczyło się, wymieniło ciosy, każdy dostał własny
dziennik; boty grały same (jeden zginął w trakcie próby); zgłoszenie z obcym
znakiem miejsca odbite kodem 403.

`[ustalone - sterownik przeglądarki, `.workspace/proba-przegladarka.log`]`
Wejście do lochu przez pole imienia, sześć kroków w prawo (tura 167 -> 180,
położenie przesunięte), spotkanie z botem wraz ze znacznikiem „widzisz:
Automat 2", plecak, jedenaście rozdziałów księgi zasad, sześć pozycji przy
stole, **zero błędów konsoli**. Zrzuty: `.workspace/roguelike-wielu-obrazy.md`.

**Wada znaleziona tym przebiegiem, nie lekturą kodu:** klient nigdy nie wołał
`renderer.resize()`, bo w grze jednoosobowej robi to kod startowy mający już
gotowy silnik. Wymiary poziomu przychodzą tu dopiero z pierwszą migawką, więc
płótno liczyło na wartościach domyślnych i szerokość wychodziła nieokreślona -
`createRadialGradient` przy rysowaniu pochodni dostawał `NaN`. W konsoli był
wyjątek na każdą klatkę, a na ekranie mimo to coś się rysowało, więc lektura
kodu tego nie znalazłaby.

### Co zostało zmierzone, a nie przeczytane z kodu

Odbiór przeszedł przez prawdziwą przeglądarkę prowadzoną po protokole debugowania
(Chrome bez okna, zdarzenia klawiatury wysyłane do strony). Wyniki:

- `[ustalone - dwa odczyty stanu przez uchwyt `roguelike.game`]` Stan po
  odświeżeniu jest identyczny: tura 17, pozycja `19,9`, punkty życia 29, ziarno
  `ui-test` - przed i po. Autozapis waży 6921 znaków.
- `[ustalone - trzy warianty adresu]` Adres bez ziarna wraca do autozapisu;
  adres z **tym samym** ziarnem też (tura 12, pozycja 15); adres z **innym**
  ziarnem daje nową grę od tury 0. Ostatni przypadek nadpisuje autozapis
  poprzedniej rozgrywki - świadomie, bo jawne ziarno w adresie jest prośbą
  o konkretną grę.
- `[ustalone - porównanie długości wpisu przed i po pięciu turach]` Zapis ręczny
  (`S`) nie jest ruszany przez autozapis.
- `[ustalone - śmierć z głodu wywołana normalnymi turami]` Po śmierci autozapis
  znika, ekran końcowy pada, a odświeżenie daje nową grę (tura 0, stan `playing`).
- `[ustalone - kontrola znanego-dobrego przypadku]` Przecinek bez Shiftu nadal
  znaczy „podnieś" („Nie ma tu nic do podniesienia."), czyli utwardzenie z W-10
  nie zjadło zwykłego przecinka po dołożeniu `KeyN` do tablicy.
- `[ustalone - konsola przeglądarki pusta we wszystkich czterech przebiegach]`
  Zero błędów i zero wyjątków.

### Dwie rzeczy wyszły dopiero ze zrzutu ekranu, nie z kodu

1. Komunikat „Wznowiono grę z autozapisu" wpisywał się do **dziennika gry**,
   a dziennik jest częścią zapisanego stanu - więc na zrzucie stał dwa razy pod
   rząd, po dwóch odświeżeniach. Przeniesiony na płótno (znika po 2,6 s).
2. Adres z ziarnem kasował trwającą rozgrywkę bez ostrzeżenia. Teraz wraca do
   autozapisu, jeśli ziarno się zgadza.

Obie wychwycone przez oglądanie wyniku, nie przez czytanie własnego kodu -
i obie były niewidoczne dla testów, bo testy nie patrzą na dziennik ani na adres.

### Czego nadal nie sprawdzono

- `[niezweryfikowane]` Rozgrywka z udziałem **człowieka**. Klawisze wciskał
  sterownik. To ta sama luka co w wątku 2.
- `[niezweryfikowane]` Przeglądarki spoza rodziny Chromium i urządzenia dotykowe.
  Minimapa reaguje na kliknięcie, ale nie na dotyk odrębnie.
- `[niezweryfikowane]` Zachowanie przy zapełnionej pamięci przeglądarki. Kod ma
  gałąź na odmowę zapisu (znacznik zmienia się na „bez autozapisu"), ale nie
  została wywołana na prawdziwym przepełnieniu - tylko przeczytana.

## Wątek 5: rozpoznawanie mikstur i księga zasad (2026-09-10)

Zgłoszenie właściciela: dotąd jedyną drogą do wiedzy, co robi mikstura, było jej
wypicie, a trucizna zabiera stałą liczbę punktów życia. Każda nieznana flaszka
była zakładem o pełnej stawce. Do tego brakowało miejsca, w którym gracz mógłby
doczytać reguły bez wychodzenia z gry.

Spec zamrożona **przed pierwszą linią kodu**, świadomie bez nazw plików, funkcji
i klawiszy: `.workspace/mikstury-acceptance-spec.md`, 24 kryteria w czterech
grupach. Zbudowane: zapach dzielący mikstury na dwie pary (D-019), zwój
rozpoznania jako piąty rodzaj zwoju (D-020) oraz księga zasad z jednego źródła,
`src/rules.js` (D-021).

### Pomiar równowagi: podejrzenie o piąty zwój okazało się fałszywe

Dołożenie piątego rodzaju zwoju rozcieńcza pulę pozostałych: `identify` ma wagę
10 przy sumie wag 48, więc zwój przeniesienia i oba zwoje ulepszające wypadają
rzadziej niż wcześniej. Pierwsza seria po zmianie dała **26,8% zwycięstw**
(268/1000, ziarna `mikst-v4-`, zero wywrotek, zero zakleszczeń) wobec 31,8%
w serii v3 z wątku 1. Pięć punktów procentowych w dół wygląda jak skutek zmiany.

Nie jest. `[ustalone - seria kontrolna na TYCH SAMYCH ziarnach]` Kopia silnika
z jedyną różnicą w postaci usuniętego zwoju rozpoznania dała **28,0%**
(280/1000, `.workspace/seria-kontrola.json`). Różnica między wersją z nowym
zwojem a bez niego to **1,2 punktu procentowego na tych samych ziarnach**, przy
błędzie standardowym odsetka rzędu 1,4 punktu. Nieodróżnialne od szumu.

Cała reszta rozjazdu wobec 31,8% siedzi więc w **doborze ziaren**, nie w zmianie.
Seria v3 i seria v4 to dwa różne zestawy tysiąca partii, a odsetek zwycięstw
waha się między zestawami o kilka punktów. Porównywanie serii na różnych ziarnach
jako pomiaru skutku zmiany jest błędem pomiaru, nie wynikiem.

Warunek, który to umożliwił: losowanie ważone zużywa **jedną** liczbę z generatora
niezależnie od długości listy, a `makeAppearances` tasuje pełne listy wyglądów
bez względu na liczbę rodzajów. Usunięcie jednego zwoju z tablicy nie przesuwa
więc strumienia losowego - loch, potwory i rozkład przedmiotów zostają te same,
a różni się wyłącznie to, który zwój wypadł. To jest para, nie dwa niezależne
pomiary, i dlatego 1,2 punktu wolno tu w ogóle porównywać.

`[ustalone - .workspace/verify-v4.log]` Pełny odbiór na zestawie ziaren
niezależnym od strojenia: **9/9 kryteriów**, 28,3% zwycięstw na 1000 partii,
zero wywrotek, zero partii bez rozstrzygnięcia, 9 kontroli przyrządu przeszło.

### Co wyszło z pomiaru, a nie z lektury kodu

1. **Kolumna udziałów w księdze sumowała się do 101%.** Każdy wiersz zaokrąglany
   osobno przez `Math.round` daje sumę, która nie musi być całością. Naprawione
   metodą największych reszt; test pilnuje sumy dla wszystkich trzech tabel.
2. **Pierwszy test wąchania mierzył nie to, co trzeba.** Asercja „punkty życia
   się nie zmieniły" padła na 29 wobec 30 - bo w mijającej turze ugryzł szczur.
   Wąchanie nie miało z tym nic wspólnego. Zastąpione kontrolą: dwie gry z tego
   samego ziarna, w jednej gracz wącha, w drugiej czeka, i porównywany jest stan
   generatora, głód, życie oraz położenia wszystkich potworów. Pomiar bez kontroli
   mierzył szum i nazywał go wynikiem.
3. **Asercja na ostatnim komunikacie dziennika jest krucha z tego samego powodu**:
   po działaniu gracza odzywa się świat, więc na końcu dziennika stoi „Szczur
   trafia Ciebie", a nie odpowiedź na działanie. Testy sprawdzają kilka ostatnich
   wpisów sklejonych razem.

### Czego NIE sprawdzono

- `[niezweryfikowane]` Faza 3, czyli niezależny odbiór spec-a przez
  `acceptance-verifier`. Wymaga zgody właściciela, zgody nie było. Spec leży
  gotowa i jest napisana tak, żeby dała się oddać komuś, kto nie widział kodu.
- `[niezweryfikowane]` Gra z udziałem **człowieka** - nadal, w obu wersjach.
  Klawisze wciskał sterownik CDP.
- `[hipoteza]` Jedna partia bez rozstrzygnięcia w serii kontrolnej
  (`mikst-v4-727`, brak w serii z nowym zwojem) to najpewniej ta sama odmiana
  pułapki decyzyjnej bota co przy W-6. Nie diagnozowana. Rozstrzygnęłaby ją ta
  sama instrumentacja.

## Wątek 6: wielu graczy w jednym lochu - silnik i reguła tury (2026-09-10)

Zgłoszenie właściciela: dwóch albo więcej graczy niezależnie eksplorujących ten sam
poziom, a gdy się zobaczą - tura wspólna, tak żeby spotkanie nie kończyło się
automatyczną śmiercią jednego z nich, ale i nie ciągnęło się w nieskończoność.
Zakres tego wątku to **wyłącznie silnik i reguła tury**. Warstwy sieciowej,
serwera ani interfejsu jeszcze nie ma - graczami są tu programy sterujące.

### Kształt przebudowy: liczba pojedyncza jako WIDOK na mnogą

Silnik miał 76 miejsc mówiących `game.player`, `game.depth`, `game.messages`.
Dwa oczywiste wyjścia były oba złe. Przepisanie wszystkich 76 miejsc na jawny
uczestnik znaczy dużą, ryzykowną łatkę bez żadnego zysku dla gry jednoosobowej.
Osobna klasa na grę wieloosobową znaczy dwie ścieżki kodu, które rozjadą się przy
pierwszym strojeniu równowagi.

Wybrane trzecie: `this.heroes` to lista, `this.player` to **czytnik** na
`heroes[active]`, a każde pole osobiste (`depth`, `visible`, `messages`,
`identified`, `sniffed`, `status`) ma czytnik i zapisywacz kierujący do
uczestnika czynnego. Wszystkie 76 miejsc działa bez zmiany, a gra jednoosobowa
to po prostu lista o jednym elemencie - **ta sama ścieżka kodu**, nie zgodność
wstecz.

### Odcisk zachowania jako osobny przyrząd

Ta przebudowa zmieniała format zapisu, więc `fingerprint()` z `src/save.js` nie
mógł niczego pilnować: on liczy skrót z serializacji, a serializacja miała się
zmienić celowo. Kryterium 1 spec-a (powtarzalność z ziarna) też nie łapie
regresji, bo nowy kod jest powtarzalny wewnętrznie i po prostu powtarza coś
innego.

Stąd osobny przyrząd, zrobiony **przed** pierwszą zmianą w silniku:
`.workspace/odcisk-zachowania.mjs` rozgrywa 60 pełnych partii botem i liczy
skrót z przebiegu - wynik, tura, głębokość, położenie, życie, poziom, głód,
stan losowania, zawartość plecaka, rozpoznane rodzaje, potwory, liczba
komunikatów. `[ustalone]` Odcisk `dcd469162d5390df` przed przebudową i po całej
przebudowie. Kontrola przyrządu: na celowo zepsutej kopii silnika odcisk się
przesuwa, więc przyrząd nie jest ślepy.

### Dwa razy zgłosił zmianę i dwa razy miał rację

`[ustalone - odcisk 60 partii]` **Krok pierwszy zmienił zachowanie na wszystkich
60 ziarnach.** Nie w silniku: `countExplored()` w `src/bot.js` i test zapisu
czytały `game.here.memory`, które przestało istnieć. Bot dostawał więc puste
pole i chodził inaczej. Naprawa jednolinijkowa (`game.memoryOf(game.player)`),
odcisk wrócił.

`[ustalone - ślad pole-po-polu dla ziarna `odcisk-0`]` **Krok drugi zmienił
zachowanie ponownie.** Tu zamiast zgadywać wypakowałem poprzedni commit obok
(`git archive HEAD | tar -x`) i porównałem surowy ślad tury po turze. Jedyna
różnica: `glod=560` wobec `glod=561`. Przyczyna: stary `act()` przeliczał
regenerację, głód i pole widzenia **także w turze, w której gracz zginął albo
wygrał**, a nowy filtr `status === 'playing'` tę turę pomijał. Naprawa: skład
uczestników tury ustala się **przed** działaniami i jedzie dalej jako argument;
stanem pilnowane jest już tylko samo umieranie. Różnica o jedną jednostkę głodu
- dokładnie ten rodzaj rozbieżności, który wygląda na zaokrąglenie i przechodzi
bez sprawdzenia.

### Reguła tury: dlaczego nie bloki po pięć ruchów

Propozycja właściciela (blok trzech albo pięciu ruchów na przemian) została
odrzucona rachunkiem, nie gustem: przy życiu 30-45 i ciosie 4-10 blok pięciu
ruchów daje drugiemu w kolejności pięć darmowych ciosów. Spotkanie rozstrzyga
wtedy kolejność, a nie decyzja. Zamiast tego tura wspólna rozstrzyga się
jednocześnie - patrz D-023.

`[ustalone - 200 partii, `bin/duel.js`, dwóch graczy automatycznych]`

| miara | wartość |
|---|---|
| partie | 200, z tego rozstrzygnięte 200 |
| wywrotki | 0 |
| partie bez rozstrzygnięcia | 0 |
| spotkania | 2699 |
| rozejścia | 2699 |
| ciosy między graczami | 8182 |
| przegrane starcia | 1879 (9,4 na partię) |
| tury uczestników w kontakcie | 105 494 z 1 127 176, czyli 9,4% |
| tury wspólne | 52 747, czyli 4,7% tur uczestników |
| partie bez ani jednego spotkania | 10 |

Liczba rozejść równa liczbie spotkań jest tu wynikiem mocnym: **każde spotkanie
się skończyło**, żadne nie utknęło w zabawie w kotka i myszkę do końca partii.
Osiem tysięcy ciosów przy niecałych dwóch tysiącach przegranych starć znaczy,
że wymiana ciosów zwykle kończy się odskokiem, a nie rozstrzygnięciem.

### Pułapka miary, złapana przed postawieniem wniosku

`spotkania` i `rozejscia` liczą **przejścia stanu globalnego** „ktokolwiek jest
w kontakcie" na „nikt nie jest". Przy dwóch graczach to jest dobra miara. Przy
dziesięciu **nasyca się i zaczyna kłamać w drugą stronę**: im więcej kontaktu,
tym rzadziej zdarza się chwila, w której nikt nikogo nie widzi, więc licznik
spotkań SPADA, choć kontaktu jest więcej. Miara niewrażliwa na liczbę
uczestników to `turyUczestnikowWKontakcie / turyUczestnikow`, i ona weszła do
przyrządu. Wniosek o wpływie rozmiaru mapy był już postawiony na tej pierwszej
i został wycofany przed zapisaniem.

`[obalone - ta sama seria po naprawie zawężenia tury]` Pierwszy pomiar rozmiaru
mapy dał udział tur w kontakcie ROSNĄCY z powierzchnią (32,8% -> 38,2% -> 44,0%)
i został zapisany jako wynik przeciwny do intuicji, z zastrzeżeniem, że
mechanizmu nie ustalono. Był artefaktem wady w przyrządzie, nie własnością gry
- patrz niżej.

**Wada w samym przyrządzie, znaleziona przy budowie rozjemcy tury.**
`resolveTurn` rozstrzygał turę dla WSZYSTKICH żywych uczestników, także tych
poza kontaktem, a pętla dawała im potem ich własną turę jeszcze raz. Przy dwóch
graczach było to niewidoczne, bo grupa w kontakcie jest wtedy całą listą; przy
dziesięciu ośmiu pozostałym świat ruszał się dwa razy na jedno ich działanie -
czyli głód i potwory szły dwa razy szybciej niż powinny. Druga wada w tym samym
miejscu: grupowanie brało „ja plus moje kontakty" bez domknięcia przechodniego,
więc w łańcuchu A-B-C uczestnik C rozstrzygał turę osobno, przeciw B, który już
się ruszył. Oba naprawione, oba mają teraz test.

`[ustalone - 30 partii na rozmiar, 10 graczy, PO naprawie]`

| mapa | udział tur w kontakcie | tury wspólne | przegrane starcia na partię |
|---|---|---|---|
| 76x20 | 57,4% | 17,2% | 57,1 |
| 120x32 | 53,4% | 16,0% | 36,5 |
| 160x44 | 45,1% | 14,3% | 49,0 |

Kierunek udziału kontaktu jest teraz zgodny z intuicją: więcej miejsca, mniej
kontaktu. Kolumna przegranych starć **nie jest monotoniczna** i przy trzydziestu
partiach na rozmiar nie wolno z niej czytać kierunku - `[niezweryfikowane]`.
Zaplątana zmienna zostaje: liczba potworów i przedmiotów zależy w tej grze od
głębokości, nie od powierzchni, więc większa mapa jest jednocześnie pustsza.

**Nauka metodyczna.** Pierwszy wniosek był podany z zastrzeżeniem „mechanizmu
nie ustalono" i to zastrzeżenie okazało się jedyną rzeczą, która go trzymała
przy życiu. Wynik przeciwny do intuicji jest sygnałem do sprawdzenia PRZYRZĄDU,
nie do szukania ciekawego wyjaśnienia. Znalazło się dopiero wtedy, gdy pisałem
warstwę korzystającą z tej samej funkcji do czegoś innego.

### Co zostało zmierzone, a nie przeczytane z kodu

- odcisk zachowania 60 partii przed i po przebudowie, plus kontrola przyrządu
  na zepsutej kopii silnika
- 200 partii dwóch graczy automatycznych, liczby w tabeli wyżej
- 26 nowych testów jednostkowych do kryteriów spec-a, w tym cztery kontrole
  przyrządu (śmierć z głodu nie jest przegranym starciem; odmowa poza kontaktem
  nie kosztuje tury; deklaracja od uczestnika po partii jest odrzucana;
  wąchanie poza zakresem plecaka nie wywraca gry)
- pełny odbiór dziewięciu kryteriów pierwotnej specyfikacji na stanie po całej
  przebudowie: **9/9**, 1000 partii w 699 s, 283 zwycięstwa (28,3%), zero
  wywrotek, zero partii bez rozstrzygnięcia
- partia przez sieć: dwóch klientów bez przeglądarki, potem klient prowadzony
  prawdziwą przeglądarką
- wczytanie PRAWDZIWEGO zapisu w formacie 1, wyprodukowanego przed przebudową
  (po niej nie da się go już wytworzyć)

### Serwer pod obciążeniem

Warstwa serwera nie miała żadnego pomiaru, więc dostała własny:
`.workspace/proba-obciazenie.mjs` sadza ośmiu klientów naraz przy stole z
czterema botami, każdy z własnym strumieniem, i zgłasza ruchy przez 45 sekund.
W połowie próby jeden klient **zrywa połączenie bez pożegnania**, w trakcie
tury wspólnej - bo to jest ten przypadek, który realnie psuje serwer chodzący
bez opieki.

`[ustalone - `.workspace/proba-obciazenie.mjs`, 12 uczestników, mapa 120x32]`

| miara | wartość |
|---|---|
| uczestników przy stole | 12 (8 ludzi, 4 boty) |
| zgłoszeń działania | 2922 |
| odmów serwera | 0 |
| migawek na klienta | 499 przy 366 rundach |
| tura po próbie | 1527 |
| klienci bez migawki dłużej niż 8 s | 0 |
| urwane połączenie zatrzymało resztę | nie - tura szła dalej |

Największa liczba graczy widzianych naraz przez jednego klienta: 3. Jeden
klient zginął od potworów w trakcie próby, co nie przeszkodziło pozostałym.
Po próbie serwer nadal odpowiada na pytanie o stan stołu.

Czego ta próba NIE pokazuje: zachowania przy wystawieniu do sieci publicznej.
Nie ma ograniczenia liczby żądań ani szyfrowania połączenia, a klienci byli tu
życzliwi - nikt nie próbował zgłaszać po tysiąc działań na sekundę ani podawać
tysiącznakowego imienia.

### Czy ktoś już to ma: rozpoznanie w sieci

Pytanie właściciela z rozmowy: czy są gdzieś takie wersje jak nasza, webowe,
gdzie wchodzi się i gra z człowiekiem albo z botem. `[ustalone - trzy
wyszukiwania, wrzesień 2026]` na tyle, na ile trzy wyszukiwania ustalają:

- **Wieloosobowe roguelike'i z trwałym, wspólnym lochem istnieją od dawna
  i poszły w zegar rzeczywisty, nie w tury.** MAngband, TomeNET i pochodna
  Tangaria to gry z klientem do zainstalowania, z systemem energii zamiast
  ścisłych tur; w TomeNET czas płynie wolniej na głębszych poziomach, żeby
  wyrównać przewagę szybkości. To potwierdza rachunek, na którym stoi D-023:
  ścisła turowość dla wszystkich naraz nie skaluje się i nikt jej nie utrzymał.
- **Stawka śmierci w MAngbandzie jest bardzo bliska naszej D-022:** zabity gracz
  zmienia się w ducha i wraca do świątyni, tracąc wszystkie przedmioty. Doszliśmy
  do tego rachunkiem, nie zapożyczeniem, ale zbieżność z rozwiązaniem sprawdzonym
  przez dwie dekady jest argumentem na rzecz tej stawki.
- **W przeglądarce jest co innego.** Rogule daje wszystkim ten sam loch na dany
  dzień i jedno podejście - to współzawodnictwo o wynik, nie wspólny świat.
  Webowy klient Dungeon Crawl Stone Soup jest jednoosobowy.
- `[hipoteza - NIE do wpisania w portfolio jako fakt]` Połączenie „przeglądarka
  bez instalowania + jeden wspólny loch + tury + człowiek albo bot" wygląda na
  nieobsadzone. Trzy wyszukiwania nie są przeglądem rynku, a itch.io ma tysiące
  pozycji, których w ten sposób się nie przeszuka. Zdanie w portfolio ma brzmieć
  „zrobione tak i tak", a nie „pierwsze takie".

### Czego NIE sprawdzono

- `[niezweryfikowane]` Rozgrywka z udziałem CZŁOWIEKA. Klawisze wciskał
  sterownik przeglądarki, nie palce, a drugim uczestnikiem był bot. Dwie osoby
  przy jednym stole naraz nie zostały sprawdzone ani razu - to jest największa
  luka odbioru i nie da się jej zamknąć bez dwóch ludzi.
- `[niezweryfikowane]` Zachowanie serwera pod obciążeniem: dwunastu uczestników
  naraz, zerwane połączenia w trakcie tury wspólnej, wiele przeglądarek na
  jednym adresie. Limit miejsc i przejmowanie miejsca po rozłączeniu mają
  testy ręczne, nie serię.
- `[niezweryfikowane]` Wystawienie serwera do sieci publicznej. Nie ma
  ograniczenia liczby żądań, nie ma szyfrowania połączenia, a nazwa uczestnika
  jest jedynym tekstem od użytkownika (czyszczona wzorcem, ale nie sprawdzona
  adwersaryjnie).
- `[niezweryfikowane]` Zachowanie przy wielu uczestnikach na RÓŻNYCH poziomach
  jednocześnie mierzone było tylko ubocznie, bez osobnej serii.
- `[niezweryfikowane]` Czy 25% życia i utrata dobytku to stawka dobrze wyważona
  w odczuciu człowieka. Liczby mówią, że spotkania się kończą; nie mówią, czy
  kara jest sprawiedliwa.
- `[hipoteza]` Bot pojedynkowy (`decydujWPojedynku`) atakuje powyżej 45% życia,
  a poniżej odskakuje. Ten próg nie był strojony, wzięty z pierwszego strzału.
  Wpływ na powyższe liczby nie jest zmierzony.
