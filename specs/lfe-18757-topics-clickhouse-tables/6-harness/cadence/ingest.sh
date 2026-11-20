#!/bin/sh
run() { docker exec -i langfuse-clickhouse clickhouse-client --user clickhouse --password clickhouse -n < "$1" || { echo "FAIL $2"; exit 1; }; }
python3 -I - <<'PY' > 6-harness/cadence/hours3.txt
import datetime as dt
t = dt.datetime(2026, 10, 20, 1)
while t < dt.datetime(2026, 11, 3): print(t.strftime("%Y-%m-%d %H:%M")); t += dt.timedelta(hours=1)
PY
while read h; do
  a=$(date +%s)
  python3 -I 6-harness/cadence/gen_hour.py "$h" > 6-harness/cadence/cur.sql < /dev/null && run 6-harness/cadence/cur.sql "$h"
  case "$h" in *" 02:00") d=${h%% *}; python3 -I 6-harness/cadence/refit.py "$d" < /dev/null > 6-harness/cadence/refit.sql && run 6-harness/cadence/refit.sql "refit $d" && echo "refit $d done";; esac
  echo "$h $(( $(date +%s) - a ))s"
done < 6-harness/cadence/hours3.txt
echo INGESTDONE
