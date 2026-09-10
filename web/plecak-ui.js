// Plecak na siatce: układanie rzeczy myszą.
//
// Jeden widok dla gry jednoosobowej i dla stołu. Różnią się WYŁĄCZNIE tym, co
// dzieje się po upuszczeniu rzeczy: w grze jednoosobowej silnik siedzi obok,
// przy stole trzeba powiadomić serwer. Dlatego moduł nie wie nic o grze -
// dostaje bohatera (albo jego migawkę) i garść oddzwonień.
//
// Zasada, która trzyma to uczciwie: podświetlenie w trakcie przeciągania liczy
// TĘ SAMĄ funkcję `mozna()`, której używa silnik. Dzięki temu „widzę, że się
// zmieści" i „zmieściło się" nie mogą się rozjechać - nie ma drugiej,
// przybliżonej reguły po stronie interfejsu.

import { mozna, wymiary, pojemnosc, zajetePola, ile as sztuk } from '../src/plecak.js';
import { itemStats, polaSlowo } from '../src/items.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const POLE_PX = 44;

/**
 * Czy właśnie trwa przeciąganie. Odświeżanie panelu przychodzącą migawką musi
 * na to czekać: przerysowanie w trakcie chwytu wyrywa rzecz z ręki.
 */
let ciagniete = null;
export function trwaCiagniecie() { return ciagniete !== null; }

/**
 * Siatka plecaka z rzeczami na swoich miejscach.
 *
 * `kosz` dokłada z boku pole „wyrzuć". Wyrzucanie przez przeciągnięcie jest
 * czymś innym niż przekładanie: przekładanie nie rusza świata i nie kosztuje
 * tury, a wyrzucenie to działanie jak każde inne. Dlatego kosz pojawia się
 * tylko tam, gdzie wywołujący podał, co z tym zrobić.
 */
export function siatkaHtml(p, etykieta, { kosz = false } = {}) {
  const P = p.plecak || { w: 5, h: 4 };
  const rzeczy = p.inventory.map((it, i) => {
    if (!Number.isInteger(it.px)) return '';
    const r = wymiary(it);
    const st = itemStats(it, p, null);
    const noszone = (p.weapon && p.weapon.id === it.id) || (p.armor && p.armor.id === it.id);
    const tytul = `${etykieta(it)}${st.opis ? ` - ${st.opis}` : ''}`;
    return `<div class="rzecz${noszone ? ' noszone' : ''}" data-i="${i}" title="${esc(tytul)}"
      style="grid-area: ${it.py + 1} / ${it.px + 1} / span ${r.h} / span ${r.w}">
      <canvas class="ico" width="${r.w * POLE_PX}" height="${r.h * POLE_PX}"></canvas>
      ${sztuk(it) > 1 ? `<em class="ile">${sztuk(it)}</em>` : ''}
      ${noszone ? '<em class="na-sobie">•</em>' : ''}
    </div>`;
  }).join('');
  const zaj = zajetePola(p), poj = pojemnosc(p);
  return `<div class="plecak">
      <div class="siatka" style="--kol:${P.w}; --wier:${P.h}; --pole:${POLE_PX}px">
        ${rzeczy}<div class="podglad" hidden></div>
      </div>
      ${kosz ? `<div class="kosz"><span class="ikona">↷</span><b>wyrzuć</b>
        <em>przeciągnij tutaj</em></div>` : ''}
      <p class="zajetosc"><b>${zaj}</b> z <b>${poj}</b> ${polaSlowo(poj)} zajęte
        <span class="muted">- przeciągnij, żeby przełożyć; <kbd>spacja</kbd> obraca${
          kosz ? '; przeciągnij na kosz, żeby wyrzucić' : ''}</span></p>
    </div>`;
}

/**
 * Podpina przeciąganie, obrót i kliknięcie.
 *
 * `przeloz(index, x, y, obrot)` ma przełożyć rzecz i odświeżyć widok;
 * `uzyj(index)` woła się przy kliknięciu bez przeciągnięcia;
 * `wyrzuc(index)` - upuszczenie na koszu (nieobowiązkowe);
 * `rysuj(canvas, item)` maluje ikonę tą samą kredką, co przedmiot na podłodze.
 */
export function podepnijSiatke(root, p, { przeloz, uzyj, wyrzuc, rysuj }) {
  const siatka = root.querySelector('.siatka');
  if (!siatka) return;
  const P = p.plecak || { w: 5, h: 4 };
  const podglad = siatka.querySelector('.podglad');
  const kosz = wyrzuc ? root.querySelector('.kosz') : null;
  ciagniete = null;

  /** Czy kursor stoi nad koszem. Liczone z prostokąta, nie z `elementFromPoint`:
   *  ciągnięta rzecz bywa pod kursorem i przesłaniałaby kosz. */
  const nadKoszem = (ev) => {
    if (!kosz) return false;
    const r = kosz.getBoundingClientRect();
    return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
  };

  root.querySelectorAll('.rzecz').forEach((el) => {
    const it = p.inventory[Number(el.dataset.i)];
    const c = el.querySelector('canvas.ico');
    if (c && it) rysuj(c, it);
  });

  const polePod = (ev) => {
    const r = siatka.getBoundingClientRect();
    return {
      x: Math.floor((ev.clientX - r.left) / (r.width / P.w)),
      y: Math.floor((ev.clientY - r.top) / (r.height / P.h)),
    };
  };

  // Rzecz trzyma się miejsca chwytu, a nie kursora - inaczej duży przedmiot
  // skakałby rogiem pod mysz i nie dałoby się go wsunąć w lukę.
  const odswiezPodglad = () => {
    // Nad koszem nie ma czego podglądać na siatce - liczy się tylko to, że
    // rzecz wyleci. Podświetlenie idzie wtedy na kosz.
    if (nadKoszem(ciagniete.ostatni)) {
      podglad.hidden = true;
      kosz.classList.add('celuje');
      ciagniete.cel = null;
      ciagniete.doKosza = true;
      return;
    }
    if (kosz) kosz.classList.remove('celuje');
    ciagniete.doKosza = false;
    const pole = polePod(ciagniete.ostatni);
    const x = pole.x - ciagniete.chwytX, y = pole.y - ciagniete.chwytY;
    const r = wymiary({ ...ciagniete.it, obrot: ciagniete.obrot });
    const ok = mozna(p, ciagniete.it, x, y, ciagniete.obrot, ciagniete.it);
    podglad.hidden = false;
    podglad.className = `podglad ${ok ? 'ok' : 'zle'}`;
    podglad.style.gridArea = `${Math.max(1, Math.min(P.h, y + 1))} / ${Math.max(1, Math.min(P.w, x + 1))}`
      + ` / span ${r.h} / span ${r.w}`;
    ciagniete.cel = { x, y, ok };
  };

  const ruch = (ev) => {
    if (!ciagniete) return;
    ciagniete.ostatni = ev;
    if (!ciagniete.ruszony
      && Math.abs(ev.clientX - ciagniete.startX) < 4 && Math.abs(ev.clientY - ciagniete.startY) < 4) return;
    ciagniete.ruszony = true;
    ciagniete.el.classList.add('ciagniete');
    odswiezPodglad();
  };

  const klawisz = (ev) => {
    if (!ciagniete || ev.code !== 'Space') return;
    ev.preventDefault(); ev.stopPropagation();
    const r = wymiary({ ...ciagniete.it, obrot: ciagniete.obrot });
    if (r.w === r.h) return;              // kwadrat obraca się sam w siebie
    ciagniete.obrot = ciagniete.obrot ? 0 : 1;
    // Miejsce chwytu obraca się RAZEM z rzeczą. Bez tego trzymany za czubek
    // miecz po obrocie skacze pod kursorem o kilka pól i celowanie w lukę
    // staje się zgadywanką.
    const po = wymiary({ ...ciagniete.it, obrot: ciagniete.obrot });
    const stareX = ciagniete.chwytX;
    ciagniete.chwytX = Math.min(ciagniete.chwytY, po.w - 1);
    ciagniete.chwytY = Math.min(stareX, po.h - 1);
    ciagniete.ruszony = true;
    ciagniete.el.classList.add('ciagniete');
    odswiezPodglad();
  };

  const koniec = () => {
    if (!ciagniete) return;
    const { el, it, ruszony, obrot, cel, doKosza } = ciagniete;
    el.classList.remove('ciagniete');
    podglad.hidden = true;
    if (kosz) kosz.classList.remove('celuje');
    window.removeEventListener('pointermove', ruch);
    window.removeEventListener('pointerup', koniec);
    window.removeEventListener('keydown', klawisz, true);
    const idx = Number(el.dataset.i);
    ciagniete = null;
    if (!ruszony) { uzyj(idx); return; }
    if (doKosza && wyrzuc) { wyrzuc(idx); return; }
    if (cel && cel.ok && (cel.x !== it.px || cel.y !== it.py || obrot !== (it.obrot || 0))) {
      przeloz(idx, cel.x, cel.y, obrot);
    } else {
      przeloz(-1, 0, 0, 0);               // nic się nie zmieniło: samo odświeżenie
    }
  };

  root.querySelectorAll('.rzecz').forEach((el) => {
    el.addEventListener('pointerdown', (ev) => {
      const it = p.inventory[Number(el.dataset.i)];
      if (!it || ciagniete) return;
      ev.preventDefault();
      const pole = polePod(ev);
      const r = wymiary(it);
      ciagniete = {
        el, it,
        chwytX: Math.min(Math.max(0, pole.x - it.px), r.w - 1),
        chwytY: Math.min(Math.max(0, pole.y - it.py), r.h - 1),
        obrot: it.obrot || 0,
        startX: ev.clientX, startY: ev.clientY,
        ruszony: false, cel: null, doKosza: false, ostatni: ev,
      };
      window.addEventListener('pointermove', ruch);
      window.addEventListener('pointerup', koniec);
      window.addEventListener('keydown', klawisz, true);
    });
  });
}
