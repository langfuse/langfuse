INSERT INTO topics_schema_exp.arrivals
SELECT
  -- lag from trace start to processing: 90% 1-10 min, 9% 10 min-6 h, 1% 6 h-3 days; reprocessed rows arrive 1-2 h after the first
  ust2 + toIntervalMillisecond(lag_ms) + toIntervalMillisecond(if(dup = 1, 3600000 + r2 % 3600000, 0)) AS processed_at,
  {p:String}, {d:Date}, n, fk, dup
FROM (
  SELECT n, k, fk, dup, cityHash64(k, fk) AS r, cityHash64(k, fk, 'lag') AS r2,
    toDateTime64({d:Date}, 3) + toIntervalMillisecond(intDiv(k, 7) % 86400000) AS ust,
    if(dup = 1 AND r % 1000 >= 3, ust + toIntervalMinute(2), ust) AS ust2,
    multiIf(r2 % 100 < 90, 60000 + r2 % 540000, r2 % 100 < 99, 600000 + r2 % 21000000, 21600000 + r2 % 237600000) AS lag_ms
  FROM (SELECT number AS n, cityHash64({p:String}, {d:Date}, number) AS k, intDiv(k, 101) % 100 < 20 AS in_rule2 FROM numbers({cnt:UInt64}))
  ARRAY JOIN arrayConcat(['f1', 'f2', 'f3', 'f4'], if(in_rule2, ['f5'], [])) AS fk
  ARRAY JOIN if(cityHash64(k, fk) % 1000 < 5, [0, 1], [0]) AS dup
)
WHERE processed_at < '2026-11-03 00:00:00'
SETTINGS max_threads = 8, max_memory_usage = 6000000000;
