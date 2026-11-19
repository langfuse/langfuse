# Results

Bytes read per query, from `system.query_log` ([01-method.md](01-method.md)). Bold marks the cheapest configuration. Result row counts match across configurations unless a cell says otherwise.

Configurations:
1. **main today**: today's tables and queries
2. **main + query fixes**: today's tables with the fixed queries ([02-queries.md](02-queries.md))
3. **review-call version**: the structure discussed in the 2026-11-18 review call, with the fixed queries
4. **proposal**: our alternative, compared against 3, with the fixed queries

See [05-options.md](05-options.md) for the exact keys.

Raw output: [results/](results/). `*-configs-1-2.tsv` ran before the main-layout summaries table was dropped for disk space. `*-all-configs.tsv` is the final harness run: its configuration 1 and 2 summary rows are errors, and their assignment rows are valid. The TSVs use the harness's earlier labels (`meeting` = review-call version, `improved` = query fixes).

## Large project: 1M traces/day, 30 days

| Query | 1 main today | 2 main + query fixes | 3 review-call version | 4 proposal |
|---|---|---|---|---|
| Q07 Topics page counts, summaries | 11.7 GiB | 11.7 GiB | 11.7 GiB | **2.9 GiB** |
| Q08 Topics page counts, assignments | 9.5 GiB | 9.5 GiB | 2.1 GiB | **2.1 GiB** |
| Q09 trace list candidates, newest 200 | 446 MiB | 344 MiB | 345 MiB | **94 MiB** |
| Q09 topic page candidates | 7.7 GiB | 7.7 GiB | 1.75 GiB | **9 MiB** |
| Q10 trace list resolve, 200 rows | 2.7 GiB | 318 MiB | **151 MiB** | 302 MiB |
| Q11 scatter plot summaries, 1,000 ids | 1.7 GiB | 1.7 GiB (original form) | 3.0 GiB | **718 MiB** |
| Q12 trace header time lookup | 821 MiB | 821 MiB | 33 MiB | **5 MiB** |
| Q13 nightly "new summaries?" | 3.3 GiB | 1.05 GiB | 2.0 GiB | **513 MiB** |
| Q15 refit today, newest 16k / 7 days | out of memory (22.8 GiB in 56 s) | 5.6 GiB, 20 s | 10.7 GiB, 16 s | **4.7 GiB, 18 s** |
| Q15' refit, stable 100k / 30 days | 258 GiB, 293 s | 258 GiB | 258 GiB, 282 s | **1.4 GiB, 3 s** |
| Q15' refit, stable 100k / 7 days | 61 GiB, 59 s | 61 GiB | 61 GiB, 70 s | **711 MiB, 0.8 s** |
| Q18 trace header topics | 893 KiB | 893 KiB | 1.8 MiB | **125 KiB** |
| Q19 tracing table topics, current run, newest 100 | **25 MiB** | 25 MiB | 34 MiB | 199 MiB |
| Q19L tracing table topics, latest placement, newest 100 | - | **25 MiB** (372 rows, no rule dimension) | 33 MiB | 28 MiB |
| Q19L same, 100 traces from 3 days earlier | - | 70 MiB (375 rows) | 77 MiB | **67 MiB** |
| Q20 tracing table topic filter, 7 days | 3.4 GiB | 3.4 GiB | 845 MiB | **52 MiB** |
| Q21 scatter plot points | 5.6 GiB | 5.6 GiB | 1.3 GiB | **35 MiB** |
| Q22 refit: previous run's traces | 5.6 GiB | 5.6 GiB | 1.2 GiB | **25 MiB** |
| Q23 fit readback, 1,000 ids | 4.3 GiB | 4.3 GiB | 1.1 GiB | **59 MiB** |
| Q33 delete lookup, summaries / assignments | 3.4 GiB / 40 MiB | same | 208 MiB / **38 MiB** | **48 MiB** / 57 MiB |

**Writes and disk (30 days, all projects)**

| | main today | review-call version | proposal |
|---|---|---|---|
| Summaries write time | **944 s** | 1,675 s (+77%, pointer MV) | 1,059 s (+12%) |
| Summaries disk | 254 GiB | 248 GiB + 5.7 GiB pointers | 255 GiB |
| Assignments write time | 257 s | **235 s** | 238 s, plus the lookup MV |
| Assignments disk | **8.1 GiB** | 13.0 GiB | 12.9 GiB + 6.4 GiB lookup |

## Small project: 10k traces/day, 30 days

Same ranking at about a hundredth of the bytes. The new layouts also read the small project's data more selectively, because the large project's rows no longer share its granules.

| Query | 1 main today | 2 main + query fixes | 3 review-call version | 4 proposal |
|---|---|---|---|---|
| Q07 / Q08 Topics page counts | 122 / 901 MiB | same | 122 / 208 MiB | **39 / 206 MiB** |
| Q09 topic page candidates | 724 MiB | 724 MiB | 163 MiB | **6 MiB** |
| Q10 trace list resolve | 51 MiB | 8 MiB | **4 MiB** | 9 MiB |
| Q11 scatter summaries | 289 MiB | 240 MiB | 239 MiB | **41 MiB** |
| Q13 nightly check | 55 MiB | 12 MiB | 21 MiB | **7 MiB** |
| Q15 refit today | 797 MiB | 257 MiB | 299 MiB | **97 MiB** |
| Q15' refit, stable 100k / 30 days | 2.75 GiB | 2.75 GiB | 2.77 GiB | **431 MiB** |
| Q19L tracing topics, latest placement, older page | - | 4.3 MiB | 13.5 MiB | **3.0 MiB** |
| Q20 tracing table topic filter | 99 MiB | 99 MiB | 34 MiB | **12 MiB** |
| Q21 / Q22 / Q23 run reads | 595 to 637 MiB | same | 146 to 148 MiB | **25 to 38 MiB** |
| Q33 delete lookup, summaries | 81 MiB | 81 MiB | 37 MiB | **3 MiB** |

## Reading it

- **Query fixes alone (2)** remove the refit's out-of-memory failure and cut list resolve and the nightly check 3x to 8x. Counts, topic pages, the tracing table filter, run reads and the stable refit sample stay at GiBs, because they need the hash, run or topic in the key.
- **The review-call version (3)** brings assignments to about 1 GiB for run reads, 4x better than main. A run's clustered rows still spread across the window. Its summaries keep the minute bucket, so counts and the refit read as on main. Today's refit reads about twice main's bytes, and the pointer MV costs 77% more summary write time.
- **The proposal (4)** is cheapest or close on every query. Its weak spot, the tracing table topic column, is covered by the lookup table: 28 MiB vs 199 MiB through the run-ordered table.
- **Refit window:** a stable 100k sample costs about the same per row over 7 or 30 days on the proposal (0.7 vs 1.4 GiB). Choosing 30 days for a steadier map costs little.
