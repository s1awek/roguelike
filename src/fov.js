// Pole widzenia: symetryczny shadowcasting (algorytm Alberta Forda).
//
// Powód, dla którego NIE jest to zwykły rekurencyjny shadowcasting: kryterium 3
// spec-a wymaga wzajemności widzenia. Klasyczny shadowcasting jej NIE ma - potrafi
// pokazać pole A z pola B, ale nie odwrotnie, bo rozstrzyga remisy nachyleń w jedną
// stronę. Ten wariant jest symetryczny dla pól przechodnich z konstrukcji.
//
// Ściany są znanym wyjątkiem: ścianę widać z tej strony, z której pada na nią
// światło, a ona sama nie "patrzy" nigdzie. Wzajemność sprawdzamy więc na polach
// przechodnich - i to jest zapisane wprost, a nie przemilczane.
//
// Arytmetyka nachyleń jest CAŁKOWITA (ułamki jako para licznik/mianownik).
// Na liczbach zmiennoprzecinkowych remisy rozstrzygałyby się przypadkowo,
// co psuje symetrię w sposób trudny do zauważenia i niepowtarzalny.

/** Nachylenie krawędzi pola (depth, col) jako ułamek nieskracalny w postaci pary. */
function slope(depth, col) { return { n: 2 * col - 1, d: 2 * depth }; }

/** floor(depth * f), z zaokrągleniem remisów W GÓRĘ. Mianownik zawsze dodatni. */
function roundTiesUp(depth, f) { return Math.floor((2 * depth * f.n + f.d) / (2 * f.d)); }

/** ceil(depth * f), z zaokrągleniem remisów W DÓŁ. */
function roundTiesDown(depth, f) { return Math.ceil((2 * depth * f.n - f.d) / (2 * f.d)); }

/** Czy pole leży w klinie wyznaczonym przez nachylenia rzędu. */
function isSymmetric(row, col) {
  return col * row.start.d >= row.depth * row.start.n
      && col * row.end.d <= row.depth * row.end.n;
}

/**
 * Liczy pola widoczne z punktu origin.
 * @param origin {{x,y}} punkt patrzenia
 * @param radius zasięg wzroku (euklidesowy, więc symetryczny)
 * @param isOpaque (x,y) => bool - poza mapą MUSI zwracać true
 * @param markVisible (x,y) => void
 */
export function computeFOV(origin, radius, isOpaque, markVisible) {
  markVisible(origin.x, origin.y);
  const r2 = radius * radius;

  for (let q = 0; q < 4; q++) {
    const transform = (depth, col) => {
      switch (q) {
        case 0: return [origin.x + col, origin.y - depth]; // północ
        case 1: return [origin.x + col, origin.y + depth]; // południe
        case 2: return [origin.x + depth, origin.y + col]; // wschód
        default: return [origin.x - depth, origin.y + col]; // zachód
      }
    };

    const scan = (row) => {
      if (row.depth > radius) return;
      let prevWall = null; // null = brak poprzednika w tym rzędzie
      const min = roundTiesUp(row.depth, row.start);
      const max = roundTiesDown(row.depth, row.end);

      for (let col = min; col <= max; col++) {
        const [x, y] = transform(row.depth, col);
        const wall = isOpaque(x, y);

        if (wall || isSymmetric(row, col)) {
          const dx = x - origin.x, dy = y - origin.y;
          if (dx * dx + dy * dy <= r2) markVisible(x, y);
        }
        if (prevWall === true && wall === false) {
          row.start = slope(row.depth, col);
        }
        if (prevWall === false && wall === true) {
          scan({ depth: row.depth + 1, start: row.start, end: slope(row.depth, col) });
        }
        prevWall = wall;
      }
      if (prevWall === false) {
        scan({ depth: row.depth + 1, start: row.start, end: row.end });
      }
    };

    scan({ depth: 1, start: { n: -1, d: 1 }, end: { n: 1, d: 1 } });
  }
}

/** Zbiór widocznych pól jako Set kluczy "x,y" - wygodne w testach. */
export function visibleSet(origin, radius, isOpaque) {
  const set = new Set();
  computeFOV(origin, radius, isOpaque, (x, y) => set.add(`${x},${y}`));
  return set;
}
