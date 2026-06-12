# PoC Conclusions: merge semantics / EAV filtering / pipeline fan-out

Environment: GreptimeDB **1.0.1**, localhost:4002 (MySQL protocol). The MCP is read-only; writes were done with the `mysql` CLI + `dryrun_pipeline`.

## Summary

All foundational open items of the 01 schema design are **validated**, and the option 2 architecture holds. One risk is confirmed (out-of-order overwrite), and two schema caveats are surfaced (keywords, timestamp precision).

| Item validated | Result |
|---|---|
| merge_mode=last_non_null partial row + NULL backfill | ✅ holds |
| created_at=min / updated_at=max (relies on the NULL write convention) | ✅ holds |
| out-of-order write risk | ✅ confirmed, version guard required |
| EAV sub-table + inverted/skipping index + semi-join filtering | ✅ holds |
| pipeline VRL 1→N fan-out splitting metadata | ✅ holds |

## 1. merge_mode = last_non_null semantics ✅

`poc_traces` (pk=(project_id,id), time index=ts=entity logical time). Two events written for the same (pk, ts): create (carrying name, created_at, updated_at) + update partial (carrying only session_id, updated_at, the rest NULL).

Result: `name=trace-a` (backfilled) `session_id=s1` `created_at=10:00:00` (backfilled) `updated_at=10:00:05` (last write).

**Conclusion**: partial row + NULL backfill holds field by field. `created_at` is written only on the create event → equivalent to min; `updated_at` is written with now on every event → equivalent to max. The implicit `FINAL` disappears. The §5.1 / §3.1 design is validated.

## 2. Out-of-order write risk ✅ (confirmed)

For the same (pk, ts), first write the "logically newer" event (updated_at=10:00:10), then write the "logically older" event (updated_at=10:00:03).

Result: `name=old-name` `updated_at=10:00:03` —— **the later-written older event wins**.

**Conclusion**: GreptimeDB takes the last by write **sequence**, not the max of the event_ts value (the essential difference from ClickHouse ReplacingMergeTree). A logically older event will clobber the newer value as long as it is written later. **A version guard must be added on the worker side** (if event_ts is older than the largest already seen, skip that field/event). The 02 write path must design for this.

## 3. EAV filtering sub-table ✅

`poc_traces_metadata` (pk=(project_id,entity_id,key), `key` INVERTED INDEX, `value` SKIPPING INDEX).

- exact semi-join (`key='env' AND value='prod'` → t1) ✅
- contains (`value LIKE '%us%'` → t1) ✅
- `SHOW INDEX` confirms: `key` = `greptime-inverted-index-v1`, `value` = `greptime-bloom-filter-v1`, both in effect.

**Conclusion**: the §5 EAV dual-representation approach holds. Filtering performance is backed by dedicated columns + indexes, sidestepping JSON's weak filtering.

## 4. pipeline VRL 1→N fan-out ✅

`dryrun_pipeline`: given one input event `{id, ts, metadata:{env,region,team}}`, the VRL `for_each` iterates over the metadata map and `push`es it into an array of objects to return.

Result: **1 event → 3 rows** (each row carries entity_id/mkey/mvalue/ts).

**Conclusion**: the EAV split can be pushed down into the pipeline; the worker need not hand-write the multi-table split.
**Key configuration point**: the `date` processor must come **before** `vrl` (otherwise `.ts` inside vrl is still a string, and the subsequent time conversion fails with `String value not supported for Epoch`).
**Note**: VRL is experimental; its stability must be re-validated before production. The fallback is to manually split and write the sub-table on the worker side (confirmed feasible).

## 5. Schema caveats ⚠️

1. **Keywords**: `id` and `name` are GreptimeDB keywords, so their column names must be quoted. Many column names are affected: `id`/`name`/`value`/`key`/`type`/`level`/`timestamp`/`source`/`comment`, etc. The 02/schema rollout needs a unified quoting strategy, or an evaluation of prefixing the column names.
2. **Timestamp precision**: `dryrun` outputs `TIMESTAMP_NANOSECOND`, while the schema uses `TimestampMillisecond` (ms). The pipeline `date` processor produces ns by default. The 02 stage needs to align the precision (date processor resolution config / column type).

## Not yet validated (left for a follow-up PoC or the plan stage)

- whether the pk includes `observations.type` / `scores.name`: needs a benchmark on large-scale data
- `is_deleted` hard delete (`DELETE` / tombstone) vs field-based filtering
- high write throughput (`@greptime/ingester` Arrow Flight bulk)
