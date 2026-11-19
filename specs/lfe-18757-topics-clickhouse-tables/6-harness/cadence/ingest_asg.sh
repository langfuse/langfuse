#!/bin/sh
run() { docker exec -i langfuse-clickhouse clickhouse-client --user clickhouse --password clickhouse -n < "$1" || { echo "FAIL $2"; exit 1; }; }
python3 -I - <<'PY' > 6-harness/cadence/hours_asg.txt
import datetime as dt
t = dt.datetime(2026, 10, 20, 0)
while t < dt.datetime(2026, 11, 3): print(t.strftime("%Y-%m-%d %H:%M")); t += dt.timedelta(hours=1)
PY
while read h; do
  a=$(date +%s)
  python3 -I 6-harness/cadence/gen_hour.py "$h" 0 asg < /dev/null > 6-harness/cadence/cur_asg.sql && run 6-harness/cadence/cur_asg.sql "$h"
  case "$h" in *" 02:00") d=${h%% *}; python3 -I 6-harness/cadence/refit.py "$d" < /dev/null > 6-harness/cadence/refit_asg.sql; if [ "$(wc -c < 6-harness/cadence/refit_asg.sql)" -gt 5 ]; then run 6-harness/cadence/refit_asg.sql "refit $d" && echo "refit $d done"; else echo "refit $d skipped (no data yet)"; fi;; esac
  echo "$h $(( $(date +%s) - a ))s"
done < 6-harness/cadence/hours_asg.txt
echo ASGDONE
