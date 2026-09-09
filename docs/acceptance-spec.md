# Specyfikacja akceptacyjna: gra roguelike

Status: **ZAMROŻONA** 2026-09-09 18:18. Opisuje CEL i ZACHOWANIE, świadomie bez nazw
plików, funkcji i struktur danych. Zmiana wymaga jawnego wpisu w dzienniku decyzji.

## 1. Cel

Kompletna, grywalna gra roguelike działająca w terminalu, którą da się skończyć
(wygrać) i przegrać, oraz zestaw kontroli dowodzących, że działa - w tym gracz
automatyczny odgrywający partie bez udziału człowieka.

## 2. Świat gry

- Loch ma **wiele poziomów** schodzących w dół. Ostatni poziom niesie cel wyprawy.
- Każdy poziom powstaje losowo, ale **jednoznacznie z ziarna**: to samo ziarno daje
  ten sam loch, zawsze i na każdej maszynie.
- Poziom składa się z pomieszczeń połączonych korytarzami. **Każde miejsce, do
  którego gracz może wejść, jest osiągalne z miejsca startu** - żadnych zamurowanych
  kieszeni z przedmiotem w środku.
- Gracz widzi wyłącznie to, na co pada linia wzroku; ściany zasłaniają. Miejsca już
  odwiedzone pozostają zapamiętane, ale przygaszone, i nie pokazują ruchu potworów.

## 3. Postać gracza

- Ma punkty życia, siłę ataku, obronę i poziom doświadczenia.
- Zdobywa doświadczenie za pokonane potwory; po przekroczeniu progu awansuje,
  co trwale poprawia jej możliwości.
- Nosi ekwipunek o ograniczonej pojemności; może zakładać broń i pancerz oraz
  używać mikstur i zwojów.
- **Głód**: postać z czasem słabnie i musi jeść. Zignorowany głód prowadzi do śmierci.

## 4. Potwory

- Różne rodzaje, o rosnącej sile na niższych poziomach lochu.
- Zachowują się sensownie: **śpią, dopóki gracz ich nie zauważy albo nie zbliży się**,
  potem ścigają go rozsądną drogą - nie utykają na pierwszej napotkanej ścianie.
- Potwór i gracz nie mogą zajmować tego samego miejsca.
- Na najniższym poziomie stoi **przeciwnik ostateczny**, wyraźnie silniejszy od reszty.

## 5. Przedmioty

- Mikstury (leczenie i inne działania), zwoje (działanie jednorazowe), broń, pancerz,
  jedzenie.
- Część przedmiotów jest **nieznana z nazwy do pierwszego użycia** - nazwy pozorne są
  losowane per rozgrywka, ale spójne w obrębie jednej rozgrywki.
- Przedmiot podniesiony trafia do ekwipunku; ekwipunek pełny odmawia przyjęcia
  i mówi o tym graczowi.

## 6. Przebieg rozgrywki

- Gra toczy się **turami**: świat rusza się dopiero po ruchu gracza.
- Gracz porusza się w ośmiu kierunkach, atakuje wchodząc na potwora, schodzi
  schodami w dół, podnosi i używa przedmiotów, czeka.
- **Warunek zwycięstwa**: pokonanie przeciwnika ostatecznego i wyniesienie łupu
  na powierzchnię. **Warunek przegranej**: śmierć postaci.
- Po zakończeniu partii gra pokazuje podsumowanie: wynik, głębokość, przyczynę końca.

## 7. Zapis i wznowienie

- Grę można zapisać i wznowić. **Stan po wznowieniu jest nieodróżnialny od stanu
  sprzed zapisu** - łącznie z zapamiętaną mapą, ekwipunkiem, pozycjami potworów
  i dalszym ciągiem losowania.
- Uszkodzony albo obcy plik zapisu jest odrzucany z czytelnym komunikatem, nigdy
  nie wywraca gry.

## 8. Obraz i sterowanie

- Gra rysuje się w terminalu: mapa, pasek stanu (życie, poziom, głębokość, głód),
  dziennik ostatnich zdarzeń.
- Sterowanie klawiaturą, z ekranem pomocy dostępnym w grze.
- Interfejs czytelny na oknie 80x24 i nie psuje się na większym.

## 9. Gracz automatyczny

- Istnieje tryb, w którym **komputer gra sam**, bez udziału człowieka: eksploruje,
  walczy, leczy się, je, schodzi niżej, próbuje wygrać.
- Tryb ten potrafi rozegrać **serię partii na zadanych ziarnach** i wypisać
  zbiorcze zestawienie: ile partii, ile zwycięstw, ile śmierci i z jakiej przyczyny,
  ile wywrotek programu, ile partii przerwanych z powodu braku postępu.

## 10. Kryteria odbioru

Odbiór przechodzi, gdy **wszystkie** poniższe są spełnione i dowiedzione uruchomieniem:

1. **Powtarzalność**: dwie rozgrywki z tym samym ziarnem, z tą samą sekwencją ruchów,
   dają identyczny stan końcowy. Sprawdzone na co najmniej 50 ziarnach.
2. **Spójność lochu**: na co najmniej 1000 wygenerowanych poziomach każde pole
   przechodnie jest osiągalne z pozycji startowej, a zejście niżej zawsze istnieje.
3. **Wzajemność widzenia**: nie istnieje para pól, z których pierwsze widzi drugie,
   a drugie nie widzi pierwszego. Sprawdzone wyczerpująco na kilku poziomach.
4. **Droga optymalna**: trasa wyznaczana potworom nigdy nie jest dłuższa od najkrótszej
   możliwej, sprawdzone niezależnym rachunkiem na losowych parach pól.
5. **Zapis wierny**: zapis, wznowienie i ponowny zapis dają identyczną treść,
   a rozgrywka po wznowieniu biegnie tak samo jak bez zapisu.
6. **Odporność**: seria **1000 partii** gracza automatycznego kończy się
   **zerem wywrotek programu** i **zerem zakleszczeń**. Każda partia kończy się
   jawną przyczyną (zwycięstwo, śmierć, wyczerpanie limitu tur).
7. **Grywalność**: w tej samej serii odsetek zwycięstw mieści się w przedziale
   **5-60%**. Wynik poza przedziałem znaczy, że gra jest niegrywalna albo trywialna,
   i jest usterką na równi z wywrotką.
8. **Uczciwość kontroli**: każda z powyższych kontroli ma **przypadek znany-zły**,
   na którym widać, że kontrola faktycznie zatrzymuje. Kontrola, która nigdy niczego
   nie zgłasza, jest nieodróżnialna od zepsutej i nie liczy się jako spełniona.
9. **Uruchamialność u obcego**: świeże pobranie katalogu i jedno polecenie startowe
   uruchamiają grę bez ręcznych kroków wstępnych.
