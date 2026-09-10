// Układ klawiszy - JEDNO źródło dla gry jednoosobowej i wieloosobowej.
//
// Wydzielone, bo to miejsce już raz kosztowało nieporozumienie: znak, który na
// części układów klawiatury powstaje dopiero z Shiftem, docierał do gry jako
// znak spod klawisza (przecinek zamiast '<'), więc "wejdź po schodach"
// zamieniało się w "podnieś". Dwie kopie tej tablicy rozjechałyby się przy
// pierwszej takiej poprawce.

export const DIR = {
  h: [-1, 0], j: [0, 1], k: [0, -1], l: [1, 0],
  y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
  '4': [-1, 0], '2': [0, 1], '8': [0, -1], '6': [1, 0],
  '7': [-1, -1], '9': [1, -1], '1': [-1, 1], '3': [1, 1],
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};

/** Rozstrzyganie po POŁOŻENIU klawisza (`e.code`), niezależnym od układu. */
export const SHIFTED_BY_CODE = {
  Comma: '<', Period: '>', Slash: '?', KeyS: 'S', KeyL: 'L', KeyQ: 'Q', KeyN: 'N',
};
