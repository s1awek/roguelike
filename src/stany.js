// Stany bohatera: sytość dzisiaj, a jutro cokolwiek jeszcze się pojawi.
//
// Po co osobny moduł na jedną rzecz. Sytość miała do tej pory CZTERY niezależne
// zestawy progów: silnik ostrzegał przy 200 i 50, terminal dzielił na 0/200/1500,
// wersja jednoosobowa tak samo, a stół zupełnie inaczej - 0/150/400. Gracz przy
// stole widział „słabnie" wtedy, gdy silnik jeszcze nic nie mówił, a w terminalu
// stan nazywał się inaczej niż w przeglądarce. Żadna z tych liczb nie była zła
// osobno; złe było to, że było ich cztery (D-021).
//
// Drugi powód jest na przyszłość. Właściciel zapowiedział kolejne stany w duchu
// DayZ - zdrowie osobno od energii, przeziębienie, zimno, przegrzanie. Dlatego
// stan nie jest tu polem w bohaterze ani gałęzią w rysowaniu, tylko WPISEM
// W REJESTRZE. Dołożenie „zimna" to dopisanie jednego wpisu: interfejs
// terminalowy i obie wersje przeglądarkowe pokażą go bez ani jednej linii zmian,
// bo wszystkie trzy przechodzą po tej samej liście.

export const HUNGER_START = 1200;
export const HUNGER_MAX = 2000;

/**
 * Stopnie sytości, od najgorszego. `do` to górna granica przedziału (włącznie).
 * `komunikat` odzywa się RAZ, przy zejściu o stopień - i to jest ten sam próg,
 * na którym zmienia się pasek, więc słowo w dzienniku i kolor na pasku nie mogą
 * się już rozminąć.
 */
export const STOPNIE_GLODU = [
  { do: 0, etykieta: 'GŁODUJESZ', ton: 'krytycznie', komunikat: 'Głód wyżera Cię od środka.' },
  { do: 100, etykieta: 'słabniesz z głodu', ton: 'zle', komunikat: 'Jesteś bardzo głodny!' },
  { do: 300, etykieta: 'głodny', ton: 'uwaga', komunikat: 'Robisz się głodny.' },
  { do: 700, etykieta: 'podjadłbyś', ton: 'dobrze' },
  { do: Infinity, etykieta: 'syty', ton: 'dobrze' },
];

/** Stopień sytości dla danej wartości. Zwraca wpis z `STOPNIE_GLODU`. */
export function stopienGlodu(hunger) {
  return STOPNIE_GLODU.find(s => hunger <= s.do);
}

/**
 * Rejestr stanów. Każdy wpis umie policzyć swój stan z bohatera albo zwrócić
 * `null`, gdy akurat nie ma czego pokazywać (tak będzie z przeziębieniem:
 * zdrowy gracz nie ma go widzieć wcale).
 */
const REJESTR = [
  {
    id: 'glod',
    nazwa: 'sytość',
    oblicz(hero) {
      // Starszy serwer nie przysyła tego pola w migawce. Uboższy widok, nie
      // wywrotka - patrz W-24 w `docs/przebieg.md`.
      if (typeof hero.hunger !== 'number') return null;
      const s = stopienGlodu(hero.hunger);
      return {
        id: 'glod',
        nazwa: 'sytość',
        etykieta: s.etykieta,
        ton: s.ton,
        wartosc: hero.hunger,
        max: HUNGER_MAX,
        frakcja: Math.max(0, Math.min(1, hero.hunger / HUNGER_MAX)),
        // Ile tur zostało do następnego stopnia w dół. Sytość spada o 1 na turę,
        // więc to jest wprost różnica - ale liczy ją TEN moduł, żeby zmiana
        // tempa głodnienia nie wymagała poprawek w trzech interfejsach.
        doNastepnego: hero.hunger - (STOPNIE_GLODU[STOPNIE_GLODU.indexOf(s) - 1]?.do ?? -1) - 1,
      };
    },
  },
];

/** Wszystkie stany warte pokazania, w stałej kolejności. */
export function stanyBohatera(hero) {
  return REJESTR.map(w => w.oblicz(hero)).filter(Boolean);
}
