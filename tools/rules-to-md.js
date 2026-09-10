#!/usr/bin/env node
// Wypisuje księgę zasad do `docs/zasady.md`. Treść pochodzi z `src/rules.js`,
// czyli z tego samego miejsca, co księga w grze - dzięki temu plik i gra nie
// mogą się rozjechać. Uruchamiane przez `npm run zasady`.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildRules } from '../src/rules.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = [
  '# Księga zasad',
  '',
  'Ten plik jest **generowany** z `src/rules.js` poleceniem `npm run zasady`.',
  'Nie edytuj go ręcznie - poprawki nanoś w `src/rules.js`, żeby zmiana trafiła',
  'jednocześnie tutaj, do gry w terminalu (`?`) i do gry w przeglądarce (`?`).',
  '',
  'Liczby w tabelach nie są przepisane - liczą się z tych samych tablic, których',
  'gra używa w czasie rozgrywki.',
  '',
];

for (const sec of buildRules('doc')) {
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

const path = join(root, 'docs', 'zasady.md');
writeFileSync(path, out.join('\n'), 'utf8');
console.log(`Zapisano: ${path} (${out.length} linii)`);
