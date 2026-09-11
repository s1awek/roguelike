# Księga zasad

English version: [rules.md](rules.md).

Ten plik jest **generowany** z `src/rules.js` poleceniem `npm run zasady`.
Nie edytuj go ręcznie - poprawki nanoś w `src/rules.js`, żeby zmiana trafiła
jednocześnie tutaj, do gry w terminalu (`?`) i do gry w przeglądarce (`?`).

Liczby w tabelach nie są przepisane - liczą się z tych samych tablic, których
gra używa w czasie rozgrywki.

## Cel gry

Zejdź na poziom 8, pokonaj przeciwnika ostatecznego - Smok Otchłani - zabierz Amulet Otchłani i wróć z nim schodami w górę aż na powierzchnię.

Schody w górę na poziomie 1 są wyjściem z lochu. Bez Amuletu nie da się nimi wyjść: gra nie pozwoli wrócić z pustymi rękami.

Z Amuletem w ręku loch się budzi. Piętro, na którym go wziąłeś, i każde piętro, na które wejdziesz w drodze na powierzchnię, dostaje nowych mieszkańców - tylu, ilu miało na starcie, ale groźniejszych, jakby leżało dwa piętra głębiej. Część z nich od razu czuwa. Pojawiają się poza Twoim polem widzenia i tylko raz na piętro; mapa, rzeczy na podłodze i schody zostają takie, jakie pamiętasz.

Loch jest generowany z ziarna. Ta sama gra z tego samego ziarna przebiega dokładnie tak samo - to samo rozmieszczenie, te same losowania, ten sam wygląd mikstur.

## Stopnie trudności

Trzy stopnie. Normalny jest wzorcem - na nim strojono równowagę i tak gra się bez wyboru. Łatwy ma mniej pięter, słabsze potwory i sytsze jedzenie; trudny odwrotnie. Rodzaje potworów rozkładają się po piętrach proporcjonalnie do ich liczby, więc najgroźniejsze stwory czekają zawsze przy dnie, a przeciwnik ostateczny i Amulet - na ostatnim piętrze.

| stopień | pięter | życie i siła potworów | sytość z jedzenia i na start |
|---|---|---|---|
| łatwy | 6 | 80% | 125% |
| normalny | 8 | 100% | 100% |
| trudny | 10 | 110% | 90% |

W przeglądarce: Shift+N albo ?difficulty=easy|normal|hard w adresie; w terminalu: --difficulty easy|normal|hard; przy stole: flaga serwera --difficulty, jeden stopień dla całego stołu. Stopień jest zapisany razem z partią.

## Sterowanie

| klawisz | co robi |
|---|---|
| strzałki, hjkl, yubn, klawiatura numeryczna | ruch i atak - wejście na potwora to cios |
| . albo 5 | czekaj jedną turę |
| , albo g | podnieś to, co leży pod nogami |
| x | obejrzyj to, co leży pod nogami - skutek, różnica wobec noszonego, miejsce w plecaku; nie kosztuje tury |
| > / <  (czyli Shift+. / Shift+,) | schody w dół / w górę - na planszy to te same znaki |
| i | ekwipunek: litera używa albo zakłada |
| d | wyrzuć przedmiot |
| w | powąchaj miksturę - kosztuje turę, nie kosztuje życia |
| ? | ta księga |
| S / L | zapisz / wczytaj |
| Q | wyjście z gry (tylko terminal) |
| kliknięcie w poznane pole | marsz - zatrzymuje się na widok potwora, przy stracie życia i nad przedmiotem (tylko wersja graficzna) |
| m | minimapa - włącz i wyłącz (tylko wersja graficzna) |
| Shift+N | nowa gra - z wyborem stopnia trudności (tylko wersja graficzna) |

Działanie odrzucone - ruch w ścianę, podnoszenie z pustego pola, powąchanie czegoś, co nie jest miksturą - NIE kosztuje tury. Świat rusza się tylko wtedy, gdy Ty coś zrobisz.

## Co widać, a czego nie

Widzisz w promieniu 8 pól i tylko to, co nie jest zasłonięte. Pole widzenia jest symetryczne: jeśli Ty widzisz potwora, potwór widzi Ciebie.

Pola raz zobaczone zostają w pamięci i są rysowane przygaszone. Pamięć dotyczy WYŁĄCZNIE kształtu lochu - potworów i przedmiotów poza polem widzenia nie zobaczysz, choćbyś stał tam przed chwilą.

Potwory śpią, dopóki ich nie obudzisz. Obudzony potwór idzie za Tobą, a nietoperz porusza się nieprzewidywalnie.

## Walka

Wejście na pole potwora to atak. Nie ma osobnego klawisza ciosu.

Obrażenia liczą się tak: losujesz od 1 do swojego ataku, a obrońca losuje od 0 do swojej obrony i odejmuje. Wynik zero albo mniej to chybienie. Silny pancerz nie zmniejsza więc obrażeń o stałą wartość - on ZWIĘKSZA SZANSĘ, że cios w ogóle nie przejdzie.

| wielkość | z czego się składa |
|---|---|
| Twój atak | siła + premia broni + ostrzenie |
| Twoja obrona | zręczność + premia pancerza + wzmocnienie |
| atak potwora | jego siła |
| obrona potwora | jego obrona |

Ta sama zasada obowiązuje w obie strony, więc każdy cios może chybić - także cios Smoka.

Za zabicie przeciwnika odzyskujesz część sił - tym więcej, im groźniejszy był. Zwrot nigdy nie podnosi życia powyżej pełni, więc nie da się nim nadrobić dowolnych obrażeń stojąc w drzwiach i zbierając drobnicę. Opłaca się jednak bić, a nie omijać: drobny przeciwnik też oddaje coś, czego nie oddaje ominięcie go łukiem.

| przeciwnik | zwrot sił za zabicie |
|---|---|
| szczur | +2 |
| nietoperz | +2 |
| kobold | +2 |
| goblin | +3 |
| szkielet | +4 |
| ork | +5 |
| ogr | +7 |
| troll | +10 |
| zjawa | +8 |
| Smok Otchłani | +26 |

## Starcia z innymi śmiałkami

Dopóki nikogo nie widzisz, chodzisz własnym tempem. Gdy inny śmiałek wejdzie w Twoje pole widzenia, wasza tura rozstrzyga się JEDNOCZEŚNIE: oboje deklarujecie ruch w ślepo i oboje działacie w tej samej turze. Dlatego plansza czeka wtedy na drugą stronę - to nie zawieszenie gry. Nikt nie dostaje darmowej serii ciosów, więc odskok jest zawsze wykonalny.

Przegrane starcie NIE kończy partii. Gubisz cały dobytek na miejscu i budzisz się piętro wyżej z resztką sił. Amulet też wypada, więc odebranie go komuś jest realnym sposobem wygrania wyścigu.

Odwrót nie jest darmowy. Kto stał twarzą w twarz i odskoczył, dostaje cios w plecy od tego, kto został - o połowie zwykłej siły. Gdy obie strony rozchodzą się w tej samej turze, nikt nie zbiera nic.

Cofać się można 6 razy pod rząd. Potem brakuje tchu i najbliższa próba odwrotu kończy się przystankiem na oddech - stoisz jedną turę, a przeciwnik nie. Licznik schodzi, gdy staniesz albo natrzesz. Zasada obowiązuje obie strony jednakowo: dlatego ucieczka bez końca jest niemożliwa i silniejszy może doprowadzić starcie do rozstrzygnięcia.

## Rozwój postaci

Za pokonane potwory dostajesz doświadczenie. Awans daje +10 do maksimum życia (i tyle samo od ręki), +1 do siły, a co drugi poziom +1 do zręczności.

| poziom | potrzebne doświadczenie |
|---|---|
| 2 | 10 |
| 3 | 36 |
| 4 | 76 |
| 5 | 129 |
| 6 | 196 |
| 7 | 275 |
| 8 | 365 |

Życie odnawia się samo BARDZO wolno: 1 punkt co 69 tur na pierwszym poziomie postaci i co 48 na ósmym. Głodujący nie regeneruje się wcale. Odsypianie ran jest więc drogą kosztowną - podstawowym źródłem sił jest WALKA, bo każde zabicie oddaje ich część.

## Głód

Zaczynasz z sytością 1200 i tracisz 1 punkt na turę. Jedzenie podnosi ją do najwyżej 2000.

| sytość | stan | co się dzieje |
|---|---|---|
| powyżej 700 | syty | nic, poza tym że zegar tyka |
| 301-700 | podjadłbyś | nic, poza tym że zegar tyka |
| 101-300 | głodny | ostrzeżenie w dzienniku: „Robisz się głodny." |
| 1-100 | słabniesz z głodu | ostrzeżenie w dzienniku: „Jesteś bardzo głodny!" |
| 0 | GŁODUJESZ | głodujesz: tracisz 1 życie co trzecią turę i nie regenerujesz się |

| jedzenie | sytość | jak często |
|---|---|---|
| racja żywnościowa | 800 | 63% |
| jabłko | 250 | 37% |

Głód jest zegarem całej wyprawy: to on karze zwlekanie i nadmierne krążenie po odkrytych już poziomach.

## Mikstury: skąd wiedzieć, co pijesz

Rodzaje mikstur są zawsze te same i zawsze działają tak samo. Zmienia się WYGLĄD: na początku każdej rozgrywki barwy są losowo przypisywane do rodzajów. „Czarna mikstura" znaczy co innego w każdej partii, ale w obrębie jednej partii znaczy zawsze to samo.

| mikstura | co robi | jak często | zapach |
|---|---|---|---|
| mikstura leczenia | leczy 12 punktów życia | 44% | łagodny |
| mikstura pełni sił | leczy 30 punktów życia | 22% | łagodny |
| mikstura siły | +1 do siły, na stałe | 17% | ostry |
| mikstura trucizny | odbiera 8 punktów życia | 17% | ostry |

Powąchanie (klawisz w) kosztuje jedną turę i nie kosztuje życia. Zapach dzieli mikstury na dwie pary i NIGDY nie wskazuje jednej: „łagodny" to mikstura leczenia albo mikstura pełni sił, „ostry" to mikstura siły albo mikstura trucizny. Odpowiada więc na pytanie „czy to mnie zaboli", a nie „co to dokładnie jest".

Zapach zostaje przy nazwie mikstury w plecaku, więc nie trzeba go pamiętać. Jeśli drugi rodzaj z pary jest już rozpoznany, powąchanie rozstrzyga na pewno - to wykluczenie gra robi za Ciebie.

> Cztery sposoby, żeby wiedzieć więcej, uszeregowane od najtańszego: (1) powąchaj - koszt jednej tury; (2) policz, jak często widujesz daną barwę - mikstura leczenia jest najczęstsza; (3) wyklucz - rodzaje są cztery, więc gdy znasz trzy, czwarta barwa jest już przesądzona; (4) wypij przy pełnym życiu i bez potwora w zasięgu wzroku - trucizna zabiera stałą liczbę punktów, więc taka próba nie może zabić, ale marnuje miksturę leczenia.

Rozpoznanie działa na RODZAJ, nie na sztukę: gdy raz dowiesz się, czym jest perlista mikstura, wszystkie perliste mikstury - w plecaku, na podłodze, znalezione później - noszą już prawdziwą nazwę.

## Zwoje

Zwoje działają tak samo jak mikstury: rodzaj jest stały, napis na zwoju jest losowany na całą rozgrywkę. Zwojów nie da się powąchać - jedyna tania droga do wiedzy o nich to zwój rozpoznania.

| zwój | co robi | jak często |
|---|---|---|
| zwój rozpoznania | rozpoznaje wszystkie nieznane mikstury i zwoje, które masz przy sobie | 21% |
| zwój odkrycia | odsłania plan całego poziomu (bez potworów i przedmiotów) | 21% |
| zwój przeniesienia | przenosi w losowe wolne miejsce na tym samym poziomie | 25% |
| zwój ostrzenia | +1 do trzymanej broni, na stałe | 17% |
| zwój wzmocnienia | +1 do noszonego pancerza, na stałe | 16% |

Zwój rozpoznania rozpoznaje wszystko nieznane, co masz przy sobie W TEJ CHWILI - więc opłaca się zbierać zagadki i przeczytać go, gdy plecak jest ich pełny.

## Broń i pancerz

Broń i pancerz są widoczne od razu - tu nie ma zagadki. Głębsze poziomy dają lepszy sprzęt; płytkie nie dają go wcale.

| broń | premia do ataku | miejsce w plecaku | od poziomu |
|---|---|---|---|
| sztylet | +1 | 1x2 | 1 |
| krótki miecz | +2 | 1x3 | 1 |
| buzdygan | +3 | 2x2 | 2 |
| długi miecz | +4 | 1x4 | 4 |
| topór bojowy | +6 | 2x3 | 5 |

| pancerz | premia do obrony | miejsce w plecaku | od poziomu |
|---|---|---|---|
| kurta skórzana | +1 | 2x2 | 1 |
| kurta ćwiekowana | +2 | 2x2 | 1 |
| kolczuga | +3 | 2x3 | 3 |
| zbroja płytowa | +5 | 3x3 | 5 |

Plecak sam podaje skutek każdej rzeczy i to, co się zmieni po założeniu: „obrona +2, gorsze o 1" znaczy, że kurta jest słabsza od noszonej kolczugi. Tych liczb nie trzeba przepisywać z tej tabeli ani pamiętać - stoją przy przedmiocie. Mikstury i zwoje pokazują działanie dopiero po rozpoznaniu.

## Plecak

Plecak ma 5x4 pól, a rzeczy zajmują różną ich ilość: mikstura czy zwój jedno pole, długi miecz cztery, zbroja płytowa dziewięć. Miejsce liczy się więc powierzchnią, a nie liczbą sztuk.

Rzeczy da się przeciągać myszą, a trzymając spację obrócić o ćwierć obrotu. Podświetlenie w trakcie przeciągania pokazuje, czy rzecz się tam zmieści.

Rzeczy nierozróżnialne dla Ciebie układają się w stos: do 4 mikstur albo zwojów na jedno pole, do 2 porcji jedzenia. Dwie mikstury o RÓŻNYM wyglądzie nigdy nie wpadną na wspólne pole - inaczej samo złączenie zdradzałoby, że są tym samym.

| plecak | pola | od poziomu |
|---|---|---|
| plecak podróżny | 6x4 | 3 |
| wielki plecak | 6x5 | 5 |

Podniesienie rzeczy, która się nie mieści, jest odmawiane i NIE kosztuje tury - nic przy tym nie ginie. Wyrzucać (klawisz d) można zawsze, także z pełnego plecaka.

## Potwory

| potwór | znak | życie | siła | obrona | doświadczenie | poziomy |
|---|---|---|---|---|---|---|
| szczur | r | 5 | 3 | 0 | 2 | 1-3 |
| nietoperz | b | 6 | 3 | 1 | 3 | 1-4 |
| kobold | k | 9 | 4 | 1 | 5 | 1-5 |
| goblin | g | 13 | 5 | 2 | 8 | 2-6 |
| szkielet | s | 18 | 6 | 3 | 13 | 3-7 |
| ork | o | 24 | 8 | 4 | 20 | 4-8 |
| ogr | O | 36 | 13 | 6 | 32 | 5-8 |
| troll | T | 48 | 15 | 7 | 55 | 6-8 |
| zjawa | W | 40 | 17 | 8 | 70 | 7-8 |

| przeciwnik ostateczny | znak | życie | siła | obrona | doświadczenie | poziom |
|---|---|---|---|---|---|---|
| Smok Otchłani | D | 130 | 19 | 10 | 400 | 8 |

Troll regeneruje się w trakcie walki, nietoperz porusza się chaotycznie i trudno go trafić przewidywaniem, a zjawa bije mocniej niż wskazuje jej wygląd.

## Zapis stanu

Zapis obejmuje wszystko, łącznie ze stanem generatora losowego - wznowiona gra jest nieodróżnialna od tej sprzed zapisu, a nie tylko podobna.

W terminalu S zapisuje do pliku, a L wczytuje. W przeglądarce gra zapisuje się dodatkowo sama po każdej turze, a S robi osobny punkt kontrolny. Zapisy są wymienne między wersjami - to ten sam format.
