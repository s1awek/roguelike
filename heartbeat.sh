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
  errs=$(grep -c 'ERROR\|FAIL' "$LOG" 2>/dev/null || true)
  flag=""
  if [ "$age" -gt 900 ]; then flag="   <<< BRAK RUCHU $((age/60)) min - MOZLIWA ZAWIESZKA"; fi
  printf '[%s] tick %04d | %02d:%02d | krok: %-34s (od %4ss) | bledy: %-3s%s\n' \
    "$(date +%H:%M:%S)" "$tick" $((el/60)) $((el%60)) "$step" "$age" "${errs:-0}" "$flag" >> "$LOG"
  sleep 30
done
