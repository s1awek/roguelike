#!/usr/bin/env node
// Wypisuje księgę zasad do `docs/zasady.md` (polska) i `docs/rules.md`
// (angielska). Treść pochodzi z `src/rules.js` i `src/lang/rules-en.js`,
// czyli z tego samego miejsca, co księga w grze - dzięki temu pliki i gra nie
// mogą się rozjechać. Uruchamiane przez `npm run zasady`.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildRules } from '../src/rules.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const WSTEP = {
  pl: [
    '# Księga zasad',
    '',
    'English version: [rules.md](rules.md).',
    '',
    'Ten plik jest **generowany** z `src/rules.js` poleceniem `npm run zasady`.',
    'Nie edytuj go ręcznie - poprawki nanoś w `src/rules.js`, żeby zmiana trafiła',
    'jednocześnie tutaj, do gry w terminalu (`?`) i do gry w przeglądarce (`?`).',
    '',
    'Liczby w tabelach nie są przepisane - liczą się z tych samych tablic, których',
    'gra używa w czasie rozgrywki.',
    '',
  ],
  en: [
    '# Rulebook',
    '',
    'Wersja polska: [zasady.md](zasady.md).',
    '',
    'This file is **generated** from `src/lang/rules-en.js` by `npm run zasady`.',
    'Do not edit it by hand - change the source, so the same text reaches this',
    'file, the terminal game (`?`) and the browser game (`?`).',
    '',
    'The numbers in the tables are not copied by hand - they are computed from the',
    'same tables the game uses while it runs.',
    '',
  ],
};

function ksiega(lang) {
  const out = [...WSTEP[lang]];
  for (const sec of buildRules('doc', lang)) {
    out.push(`## ${sec.title}`, '');
    for (const b of sec.blocks) {
      if (b.t === 'p') out.push(b.text, '');
      else if (b.t === 'note') out.push(`> ${b.text}`, '');
      else if (b.t === 'table') {
        out.push(`| ${b.head.join(' | ')} |`);
        out.push(`|${b.head.map(() => '---').join('|')}|`);
        for (const row of b.rows) out.push(`| ${row.join(' | ')} |`);
        out.push('');
      }
    }
  }
  return out;
}

for (const [lang, plik] of [['pl', 'zasady.md'], ['en', 'rules.md']]) {
  const out = ksiega(lang);
  const path = join(root, 'docs', plik);
  writeFileSync(path, out.join('\n'), 'utf8');
  console.log(`Zapisano: ${path} (${out.length} linii)`);
}
