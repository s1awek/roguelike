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
