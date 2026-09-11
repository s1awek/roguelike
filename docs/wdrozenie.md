# Wdrożenie

Gra ma dwie publikacje o różnych wymaganiach. Wersja jednoosobowa to same
pliki (ESM ze ścieżkami względnymi, zero zależności), więc wystarcza hosting
statyczny. Stół (kilku graczy w jednym lochu) potrzebuje procesu Node
i długo otwartych połączeń SSE, więc idzie na hosting z Node.

## Wersja jednoosobowa: GitHub Pages

Repozytorium: `s1awek/roguelike`, gałąź `master`. Pages serwuje korzeń gałęzi;
`index.html` w korzeniu przekierowuje do `web/`, a `web/` importuje silnik
z `../src/` po ścieżkach względnych, więc prefiks `/roguelike/` w adresie nic
nie psuje. Adres: <https://s1awek.github.io/roguelike/>.

Konfiguracja wykonana raz przez API (2026-09-11):

```
gh api -X POST repos/s1awek/roguelike/pages -f 'source[branch]=master' -f 'source[path]=/'
```

Każdy `git push` na `master` przebudowuje stronę (około minuty). Kontrola po
publikacji: `roboczy/sprawdz-pages.mjs` (przeglądarka: przekierowanie, płótno,
panel, jeden ruch, odsyłacz do stołu ukryty, konsola pusta).

Odsyłacz do stołu na stronie jednoosobowej pokazuje się tylko wtedy, gdy
stronę serwuje `bin/server.js` (znak `data-stol` w `<body>`, D-057). Na
Pages go nie ma.

## Stół: SEOhost, panel „Node.js App" (CloudLinux Node.js Selector + Passenger)

Konto właściciela na klastrze h58. Na koncie nie ma `node` w `PATH`; wersje
leżą w `/opt/alt/alt-nodejs{6..24}/root/usr/bin/node`, aplikację uruchamia
Passenger i to on ustawia `PORT` (serwer czyta `process.env.PORT`).

Parametry aplikacji w panelu:

| pole | wartość |
|---|---|
| Node.js version | 22 (albo 24; wymagane >= 20) |
| Application mode | production |
| Application root | `dungeon` (katalog w home, poza `public_html`) |
| Application URL | subdomena po angielsku, np. `dungeon.<domena>` |
| Application startup file | `bin/server.js` |
| Environment variables | opcjonalnie `STOL_BOTY`, `STOL_MAP`, `STOL_DIFFICULTY`, `STOL_SEED` |

Passenger nie przekazuje argumentów wiersza poleceń, stąd bliźniacze zmienne
środowiskowe `STOL_*` dla każdej flagi (`bin/server.js`, funkcja `arg`).
Zależności zero, więc „Run NPM Install" nie musi niczego instalować;
`package.json` musi istnieć, bo panel go wymaga.

Kod na serwerze: `git clone https://github.com/s1awek/roguelike.git ~/dungeon`
(repo publiczne, klucz nie jest potrzebny). Aktualizacja: `git pull` w tym
katalogu i „Restart" w panelu (albo `touch ~/dungeon/tmp/restart.txt`, jeśli
Passenger honoruje ten plik).

Do sprawdzenia po pierwszym uruchomieniu (na dzień wdrożenia niezweryfikowane):
- czy `/api/strumien` (SSE) przechodzi przez Passenger/Apache bez buforowania;
  serwer wysyła `X-Accel-Buffering: no`, ale to nagłówek dla nginx. Próba:
  `curl -N https://dungeon.<domena>/api/strumien` powinien dawać zdarzenia
  na bieżąco, nie po zamknięciu połączenia;
- czy Passenger nie usypia aplikacji bez ruchu (stół z botami żyje ciągle,
  usypianie zresetuje partię - do przyjęcia, ale warto wiedzieć);
- limit jednoczesnych połączeń na koncie współdzielonym (każdy gracz trzyma
  jedno SSE).

Reguły ruchu do SEOhost (antybot na IP, blokada obejmuje całą sieć): jedno
połączenie SSH na operację, odstępy 5-15 s, po 429/403 koniec ruchu.

## Wynik pierwszego uruchomienia (2026-09-11)

- Aplikacja wstała z panelu od razu: `/api/stol` odpowiada (3 boty, stopień
  normalny), nagłówek `server: LiteSpeed` (nie Apache). `[ustalone]`
- Korzeń subdomeny serwował stronę domyślną SEOhosta, bo w `public_html`
  leżał `index.html`; statyczny plik wygrywa z Passengerem. Przeniesiony do
  `~/dungeon-placeholder-index.html.bak`; po tym `/` daje 302 na `/web/`. `[ustalone]`
- `/api/strumien` bez miejsca przy stole daje 403 z JSON-em aplikacji (`serwer.nieTwoje`);
  to zachowanie stołu, nie hostingu.
- Test w przeglądarce bezgłowej (`roboczy/sprawdz-dungeon.mjs`: `wielu.html`, dosiadanie,
  jeden ruch) skończył się serią **429 „Too Many Requests"** z LiteSpeeda: pięć zasobów
  strony i kolejne `/api/stol` po 5 s. To antybot SEOhosta, nie limiter stołu (ten odpowiada
  JSON-em `serwer.zaDuzo`). `[ustalone: ciało odpowiedzi bez JSON-a]`
  Co go wyzwoliło - nierozstrzygnięte `[hipoteza]`: (a) User-Agent `HeadlessChrome`,
  (b) ~20 modułów ES ładowanych w jednej sekundzie, (c) licznik błędów 403/404 LiteSpeeda
  po sondzie strumienia. Rozstrzygnie test zwykłą przeglądarką po odblokowaniu: jeśli zwykła
  przeglądarka gra bez 429, winne (a) albo (c); jeśli też dostaje 429, winne (b) i trzeba
  spakować moduły w jeden plik dla stołu.
  Uzupełnienie 15:36: zwykła przeglądarka właściciela z tej samej sieci otwierała `/api/stol`
  w trakcie blokady, więc blokada jest per klient (UA, ciasteczka, tempo), nie per IP `[ustalone]`.
  Wniosek trwały: na SEOhost żadnej bezgłowej przeglądarki; testy strony robi człowiek w zwykłej
  przeglądarce, automat co najwyżej Cloak Browser z odstępami 5-15 s, `curl` pojedynczo.
- **Czy SSE przechodzi przez Passenger/LiteSpeed bez buforowania - nadal niezweryfikowane.**
