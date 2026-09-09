#!/usr/bin/env bash
# Wskaznik zywotnosci przebiegu autonomicznego.
# Dopisuje linie co 30 s. Kazda linia jest inna (tick + elapsed), wiec plateau
# glownego licznika nie jest nieodroznialne od zawieszki.
P=/home/op/www/roguelike
LOG="$P/PROGRESS.log"
STEP="$P/.step"
START=$(date +%s)
tick=0
while true; do
  tick=$((tick+1))
  now=$(date +%s)
  el=$((now-START))
  step=$(cat "$STEP" 2>/dev/null || echo "?")
  mt=$(stat -c %Y "$STEP" 2>/dev/null || echo "$now")
  age=$((now-mt))
  # Bledy licz TAKZE z logow bledow serii: 09.09 seria padla po 2 sekundach na
  # ReferenceError, a wskaznik przez poltorej minuty meldowal "chodzi", bo
  # wywrotka poszla do osobnego pliku. Postep bez bledow to falszywy komfort.
  errs=$(cat "$LOG" $P/err-*.log 2>/dev/null | grep -c 'ERROR\|FAIL\|Error:' || true)
  ostatni=$(cat $P/err-*.log 2>/dev/null | grep -m1 'Error:' | cut -c1-60)
  flag=""
  if [ -n "$ostatni" ]; then flag="   <<< BLAD: $ostatni"; fi
  # Proces serii zyje? Martwy PID przy rosnacym liczniku to zawieszka, nie postep.
  if [ -f "$P/.series.pid" ] && ! kill -0 "$(cat $P/.series.pid)" 2>/dev/null; then
    flag="$flag   [seria: proces nie zyje]"
  fi
  if [ "$age" -gt 900 ]; then flag="$flag   <<< BRAK RUCHU $((age/60)) min - MOZLIWA ZAWIESZKA"; fi
  printf '[%s] tick %04d | %02d:%02d | krok: %-34s (od %4ss) | bledy: %-3s%s\n' \
    "$(date +%H:%M:%S)" "$tick" $((el/60)) $((el%60)) "$step" "$age" "${errs:-0}" "$flag" >> "$LOG"
  sleep 30
done
