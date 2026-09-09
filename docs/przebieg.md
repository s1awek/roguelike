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

## Czego NIE sprawdzono

- `[hipoteza]` Zachowanie na terminalu węższym niż 80 kolumn. Układ zakłada 80x24
  i wyśrodkowuje się na szerszym; węższe okno nie było testowane.
- `[hipoteza]` Zachowanie przy oknie zmienianym w trakcie rozgrywki - obsługa
  zdarzenia `resize` istnieje, ale nie została zmierzona.
- Rozgrywka z udziałem człowieka była uruchamiana wyłącznie jako kontrola startu
  (`--help`, odmowa startu bez terminala). Sterowanie klawiaturą **nie zostało
  przeklikane przez człowieka** - to jedyne miejsce, gdzie odbiór opiera się na
  lekturze kodu, a nie na przebiegu.
