// Księga zasad - JEDNO źródło treści dla wszystkich trzech miejsc, w których
// gracz może ją przeczytać: nakładki w przeglądarce, ekranu w terminalu i pliku
// `docs/zasady.md`.
//
// Reguła nadrzędna tego pliku: **żadna liczba nie jest tu przepisana ręcznie**.
// Wszystko, co da się policzyć, liczy się z tych samych tablic, z których gra
// korzysta w czasie rozgrywki. Ręcznie przepisana liczba rozjeżdża się z kodem
// przy pierwszym strojeniu równowagi i nikt tego nie zauważa - a księga, która
// kłamie o obrażeniach, jest gorsza niż jej brak.
//
// Czego tu NIE MA i być nie może: który wygląd mikstury odpowiada któremu
// rodzajowi w bieżącej partii. To jest sekret rozgrywki, nie reguła gry.

import { POTIONS, SCROLLS, WEAPONS, ARMORS, FOODS, SCENTS, POTION_SCENT, scentGroup } from './items.js';
import { KINDS, BOSS } from './monsters.js';
import { MAX_DEPTH, FOV_RADIUS, INVENTORY_LIMIT, HUNGER_START, HUNGER_MAX, xpForLevel,
  zwrotZaZabicie, PROG_ZMECZENIA, REGEN_MNOZNIK } from './game.js';

const POTION_EFFECT = {
  heal: (p) => `leczy ${p.power} punktów życia`,
  greaterHeal: (p) => `leczy ${p.power} punktów życia`,
  strength: (p) => `+${p.power} do siły, na stałe`,
  poison: (p) => `odbiera ${p.power} punktów życia`,
};

const SCROLL_EFFECT = {
  identify: 'rozpoznaje wszystkie nieznane mikstury i zwoje, które masz przy sobie',
  magicMap: 'odsłania plan całego poziomu (bez potworów i przedmiotów)',
  teleport: 'przenosi w losowe wolne miejsce na tym samym poziomie',
  enchantWeapon: '+1 do trzymanej broni, na stałe',
  enchantArmor: '+1 do noszonego pancerza, na stałe',
};

/**
 * Udziały w losowaniu, w procentach, liczone z tych samych wag co gra.
 *
 * Zaokrąglanie każdej pozycji osobno daje kolumnę, która sumuje się do 101%
 * albo 99% - i czytelnik ma rację, gdy uzna, że tabela kłamie. Stąd metoda
 * największych reszt: całości rozdane w dół, a nadwyżka do 100 trafia do
 * pozycji o największej odciętej końcówce.
 */
function shares(list) {
  const total = list.reduce((s, x) => s + x.weight, 0);
  const dokladne = list.map(x => (x.weight / total) * 100);
  const dol = dokladne.map(Math.floor);
  let brak = 100 - dol.reduce((a, b) => a + b, 0);
  const kolejnosc = dokladne
    .map((v, i) => ({ i, reszta: v - Math.floor(v) }))
    .sort((a, b) => b.reszta - a.reszta);
  for (const { i } of kolejnosc) { if (brak <= 0) break; dol[i]++; brak--; }
  const out = new Map();
  list.forEach((x, i) => out.set(x.type, `${dol[i]}%`));
  return out;
}

const SHARE = {
  potion: shares(POTIONS), scroll: shares(SCROLLS), food: shares(FOODS),
};

/** Klawiszologia. `gdzie`: 'oba' | 'term' | 'web'. */
const KEYS = [
  ['strzałki, hjkl, yubn, klawiatura numeryczna', 'ruch i atak - wejście na potwora to cios', 'oba'],
  ['. albo 5', 'czekaj jedną turę', 'oba'],
  [', albo g', 'podnieś to, co leży pod nogami', 'oba'],
  ['> / <', 'schody w dół / w górę', 'oba'],
  ['i', 'ekwipunek: litera używa albo zakłada', 'oba'],
  ['d', 'wyrzuć przedmiot', 'oba'],
  ['w', 'powąchaj miksturę - kosztuje turę, nie kosztuje życia', 'oba'],
  ['?', 'ta księga', 'oba'],
  ['S / L', 'zapisz / wczytaj', 'oba'],
  ['Q', 'wyjście z gry', 'term'],
  ['kliknięcie w poznane pole', 'marsz - zatrzymuje się na widok potwora, przy stracie życia i nad przedmiotem', 'web'],
  ['m', 'minimapa - włącz i wyłącz', 'web'],
  ['Shift+N', 'nowa gra', 'web'],
];

/**
 * Składa księgę. `gdzie`: 'web' | 'term' | 'doc'.
 * Rozdziały są te same wszędzie; różni się wyłącznie tablica klawiszy, bo
 * mysz i minimapa nie istnieją w terminalu, a wyjście z gry w przeglądarce.
 */
export function buildRules(gdzie = 'doc') {
  const keyRows = KEYS
    .filter(([, , g]) => g === 'oba' || g === gdzie || gdzie === 'doc')
    .map(([k, opis, g]) => [k, gdzie === 'doc' && g !== 'oba'
      ? `${opis} (${g === 'web' ? 'tylko wersja graficzna' : 'tylko terminal'})`
      : opis]);

  const mild = scentGroup('mild').map(p => p.name).join(' albo ');
  const sharp = scentGroup('sharp').map(p => p.name).join(' albo ');

  return [
    {
      id: 'cel',
      title: 'Cel gry',
      blocks: [
        { t: 'p', text: `Zejdź na poziom ${MAX_DEPTH}, pokonaj przeciwnika ostatecznego - ${BOSS.name} - zabierz Amulet Otchłani i wróć z nim schodami w górę aż na powierzchnię.` },
        { t: 'p', text: 'Schody w górę na poziomie 1 są wyjściem z lochu. Bez Amuletu nie da się nimi wyjść: gra nie pozwoli wrócić z pustymi rękami.' },
        { t: 'p', text: 'Loch jest generowany z ziarna. Ta sama gra z tego samego ziarna przebiega dokładnie tak samo - to samo rozmieszczenie, te same losowania, ten sam wygląd mikstur.' },
      ],
    },
    {
      id: 'sterowanie',
      title: 'Sterowanie',
      blocks: [
        { t: 'table', head: ['klawisz', 'co robi'], rows: keyRows },
        { t: 'p', text: 'Działanie odrzucone - ruch w ścianę, podnoszenie z pustego pola, powąchanie czegoś, co nie jest miksturą - NIE kosztuje tury. Świat rusza się tylko wtedy, gdy Ty coś zrobisz.' },
      ],
    },
    {
      id: 'widok',
      title: 'Co widać, a czego nie',
      blocks: [
        { t: 'p', text: `Widzisz w promieniu ${FOV_RADIUS} pól i tylko to, co nie jest zasłonięte. Pole widzenia jest symetryczne: jeśli Ty widzisz potwora, potwór widzi Ciebie.` },
        { t: 'p', text: 'Pola raz zobaczone zostają w pamięci i są rysowane przygaszone. Pamięć dotyczy WYŁĄCZNIE kształtu lochu - potworów i przedmiotów poza polem widzenia nie zobaczysz, choćbyś stał tam przed chwilą.' },
        { t: 'p', text: 'Potwory śpią, dopóki ich nie obudzisz. Obudzony potwór idzie za Tobą, a nietoperz porusza się nieprzewidywalnie.' },
      ],
    },
    {
      id: 'walka',
      title: 'Walka',
      blocks: [
        { t: 'p', text: 'Wejście na pole potwora to atak. Nie ma osobnego klawisza ciosu.' },
        { t: 'p', text: 'Obrażenia liczą się tak: losujesz od 1 do swojego ataku, a obrońca losuje od 0 do swojej obrony i odejmuje. Wynik zero albo mniej to chybienie. Silny pancerz nie zmniejsza więc obrażeń o stałą wartość - on ZWIĘKSZA SZANSĘ, że cios w ogóle nie przejdzie.' },
        { t: 'table', head: ['wielkość', 'z czego się składa'], rows: [
          ['Twój atak', 'siła + premia broni + ostrzenie'],
          ['Twoja obrona', 'zręczność + premia pancerza + wzmocnienie'],
          ['atak potwora', 'jego siła'],
          ['obrona potwora', 'jego obrona'],
        ] },
        { t: 'p', text: 'Ta sama zasada obowiązuje w obie strony, więc każdy cios może chybić - także cios Smoka.' },
        { t: 'p', text: 'Za zabicie przeciwnika odzyskujesz część sił - tym więcej, im groźniejszy był. Zwrot nigdy nie podnosi życia powyżej pełni, więc nie da się nim nadrobić dowolnych obrażeń stojąc w drzwiach i zbierając drobnicę. Opłaca się jednak bić, a nie omijać: drobny przeciwnik też oddaje coś, czego nie oddaje ominięcie go łukiem.' },
        { t: 'table', head: ['przeciwnik', 'zwrot sił za zabicie'], rows:
          KINDS.map(k => [k.name, `+${zwrotZaZabicie(k.hp)}`]).concat([[BOSS.name, `+${zwrotZaZabicie(BOSS.hp)}`]]) },
      ],
    },
    {
      id: 'starcia',
      title: 'Starcia z innymi śmiałkami',
      blocks: [
        { t: 'p', text: 'Dopóki nikogo nie widzisz, chodzisz własnym tempem. Gdy inny śmiałek wejdzie w Twoje pole widzenia, wasza tura rozstrzyga się JEDNOCZEŚNIE: oboje deklarujecie ruch w ślepo i oboje działacie w tej samej turze. Dlatego plansza czeka wtedy na drugą stronę - to nie zawieszenie gry. Nikt nie dostaje darmowej serii ciosów, więc odskok jest zawsze wykonalny.' },
        { t: 'p', text: 'Przegrane starcie NIE kończy partii. Gubisz cały dobytek na miejscu i budzisz się piętro wyżej z resztką sił. Amulet też wypada, więc odebranie go komuś jest realnym sposobem wygrania wyścigu.' },
        { t: 'p', text: 'Odwrót nie jest darmowy. Kto stał twarzą w twarz i odskoczył, dostaje cios w plecy od tego, kto został - o połowie zwykłej siły. Gdy obie strony rozchodzą się w tej samej turze, nikt nie zbiera nic.' },
        { t: 'p', text: `Cofać się można ${PROG_ZMECZENIA} razy pod rząd. Potem brakuje tchu i najbliższa próba odwrotu kończy się przystankiem na oddech - stoisz jedną turę, a przeciwnik nie. Licznik schodzi, gdy staniesz albo natrzesz. Zasada obowiązuje obie strony jednakowo: dlatego ucieczka bez końca jest niemożliwa i silniejszy może doprowadzić starcie do rozstrzygnięcia.` },
      ],
    },
    {
      id: 'rozwoj',
      title: 'Rozwój postaci',
      blocks: [
        { t: 'p', text: 'Za pokonane potwory dostajesz doświadczenie. Awans daje +10 do maksimum życia (i tyle samo od ręki), +1 do siły, a co drugi poziom +1 do zręczności.' },
        { t: 'table', head: ['poziom', 'potrzebne doświadczenie'], rows:
          [2, 3, 4, 5, 6, 7, 8].map(n => [String(n), String(xpForLevel(n))]) },
        { t: 'p', text: `Życie odnawia się samo BARDZO wolno: 1 punkt co ${Math.max(8, 24 - 1) * REGEN_MNOZNIK} tur na pierwszym poziomie postaci i co ${Math.max(8, 24 - 8) * REGEN_MNOZNIK} na ósmym. Głodujący nie regeneruje się wcale. Odsypianie ran jest więc drogą kosztowną - podstawowym źródłem sił jest WALKA, bo każde zabicie oddaje ich część.` },
      ],
    },
    {
      id: 'glod',
      title: 'Głód',
      blocks: [
        { t: 'p', text: `Zaczynasz z sytością ${HUNGER_START} i tracisz 1 punkt na turę. Jedzenie podnosi ją do najwyżej ${HUNGER_MAX}.` },
        { t: 'table', head: ['sytość', 'co się dzieje'], rows: [
          ['200', 'ostrzeżenie: robisz się głodny'],
          ['50', 'ostrzeżenie: jesteś bardzo głodny'],
          ['0', 'głodujesz: tracisz 1 życie co trzecią turę i nie regenerujesz się'],
        ] },
        { t: 'table', head: ['jedzenie', 'sytość', 'jak często'], rows:
          FOODS.map(f => [f.name, String(f.nutrition), SHARE.food.get(f.type)]) },
        { t: 'p', text: 'Głód jest zegarem całej wyprawy: to on karze zwlekanie i nadmierne krążenie po odkrytych już poziomach.' },
      ],
    },
    {
      id: 'mikstury',
      title: 'Mikstury: skąd wiedzieć, co pijesz',
      blocks: [
        { t: 'p', text: 'Rodzaje mikstur są zawsze te same i zawsze działają tak samo. Zmienia się WYGLĄD: na początku każdej rozgrywki barwy są losowo przypisywane do rodzajów. „Czarna mikstura" znaczy co innego w każdej partii, ale w obrębie jednej partii znaczy zawsze to samo.' },
        { t: 'table', head: ['mikstura', 'co robi', 'jak często', 'zapach'], rows:
          POTIONS.map(p => [p.name, POTION_EFFECT[p.type](p), SHARE.potion.get(p.type), SCENTS[POTION_SCENT[p.type]].short]) },
        { t: 'p', text: `Powąchanie (klawisz w) kosztuje jedną turę i nie kosztuje życia. Zapach dzieli mikstury na dwie pary i NIGDY nie wskazuje jednej: „${SCENTS.mild.short}" to ${mild}, „${SCENTS.sharp.short}" to ${sharp}. Odpowiada więc na pytanie „czy to mnie zaboli", a nie „co to dokładnie jest".` },
        { t: 'p', text: 'Zapach zostaje przy nazwie mikstury w plecaku, więc nie trzeba go pamiętać. Jeśli drugi rodzaj z pary jest już rozpoznany, powąchanie rozstrzyga na pewno - to wykluczenie gra robi za Ciebie.' },
        { t: 'note', text: 'Cztery sposoby, żeby wiedzieć więcej, uszeregowane od najtańszego: (1) powąchaj - koszt jednej tury; (2) policz, jak często widujesz daną barwę - mikstura leczenia jest najczęstsza; (3) wyklucz - rodzaje są cztery, więc gdy znasz trzy, czwarta barwa jest już przesądzona; (4) wypij przy pełnym życiu i bez potwora w zasięgu wzroku - trucizna zabiera stałą liczbę punktów, więc taka próba nie może zabić, ale marnuje miksturę leczenia.' },
        { t: 'p', text: 'Rozpoznanie działa na RODZAJ, nie na sztukę: gdy raz dowiesz się, czym jest perlista mikstura, wszystkie perliste mikstury - w plecaku, na podłodze, znalezione później - noszą już prawdziwą nazwę.' },
      ],
    },
    {
      id: 'zwoje',
      title: 'Zwoje',
      blocks: [
        { t: 'p', text: 'Zwoje działają tak samo jak mikstury: rodzaj jest stały, napis na zwoju jest losowany na całą rozgrywkę. Zwojów nie da się powąchać - jedyna tania droga do wiedzy o nich to zwój rozpoznania.' },
        { t: 'table', head: ['zwój', 'co robi', 'jak często'], rows:
          SCROLLS.map(s => [s.name, SCROLL_EFFECT[s.type], SHARE.scroll.get(s.type)]) },
        { t: 'p', text: 'Zwój rozpoznania rozpoznaje wszystko nieznane, co masz przy sobie W TEJ CHWILI - więc opłaca się zbierać zagadki i przeczytać go, gdy plecak jest ich pełny.' },
      ],
    },
    {
      id: 'wyposazenie',
      title: 'Broń i pancerz',
      blocks: [
        { t: 'p', text: 'Broń i pancerz są widoczne od razu - tu nie ma zagadki. Głębsze poziomy dają lepszy sprzęt; płytkie nie dają go wcale.' },
        { t: 'table', head: ['broń', 'premia do ataku', 'od poziomu'], rows:
          WEAPONS.map(w => [w.name, `+${w.bonus}`, String(w.minDepth)]) },
        { t: 'table', head: ['pancerz', 'premia do obrony', 'od poziomu'], rows:
          ARMORS.map(a => [a.name, `+${a.bonus}`, String(a.minDepth)]) },
        { t: 'p', text: `W plecaku mieści się ${INVENTORY_LIMIT} przedmiotów. Przedmioty wolno układać w stos na jednym polu, więc pełny plecak nigdy nie blokuje gry.` },
      ],
    },
    {
      id: 'potwory',
      title: 'Potwory',
      blocks: [
        { t: 'table', head: ['potwór', 'znak', 'życie', 'siła', 'obrona', 'doświadczenie', 'poziomy'], rows:
          KINDS.map(k => [k.name, k.glyph, String(k.hp), String(k.str), String(k.def), String(k.xp), `${k.minD}-${k.maxD}`]) },
        { t: 'table', head: ['przeciwnik ostateczny', 'znak', 'życie', 'siła', 'obrona', 'doświadczenie', 'poziom'], rows:
          [[BOSS.name, BOSS.glyph, String(BOSS.hp), String(BOSS.str), String(BOSS.def), String(BOSS.xp), String(MAX_DEPTH)]] },
        { t: 'p', text: 'Troll regeneruje się w trakcie walki, nietoperz porusza się chaotycznie i trudno go trafić przewidywaniem, a zjawa bije mocniej niż wskazuje jej wygląd.' },
      ],
    },
    {
      id: 'zapis',
      title: 'Zapis stanu',
      blocks: [
        { t: 'p', text: 'Zapis obejmuje wszystko, łącznie ze stanem generatora losowego - wznowiona gra jest nieodróżnialna od tej sprzed zapisu, a nie tylko podobna.' },
        { t: 'p', text: gdzie === 'web'
          ? 'Gra zapisuje się sama po każdej turze, więc odświeżenie strony ani zamknięcie karty nie kosztują rozgrywki. Klawisz S robi osobny, świadomy punkt kontrolny, do którego wraca L - autozapis go nie nadpisuje.'
          : gdzie === 'term'
            ? 'Klawisz S zapisuje stan do pliku, L go wczytuje. Zapisy są wymienne z wersją graficzną - to ten sam format.'
            : 'W terminalu S zapisuje do pliku, a L wczytuje. W przeglądarce gra zapisuje się dodatkowo sama po każdej turze, a S robi osobny punkt kontrolny. Zapisy są wymienne między wersjami - to ten sam format.' },
      ],
    },
  ];
}

/** Płaska lista tytułów - do nawigacji. */
export function ruleTitles(gdzie = 'doc') {
  return buildRules(gdzie).map(r => ({ id: r.id, title: r.title }));
}
