# 2026-11-06: Claude Code, traces CSV task

Claude Code 2.1.318 with `claude-opus-5-5`, 5 runs per arm, task `traces-csv`.
"Before" serves the deprecation notice from the commit before #19844
(`94abaee890^`): a generic Observations v2 replacement and a link to the public
API page. "After" serves the notice from #19844 (`94abaee890`): it asks for
`fields=core,basic,usage`, says to sum `totalCost` per `traceId`, and links the
`#traces` section of the migration guide. Live docs were the current
langfuse.com in both arms.

| arm | mode | legacy GET answers | notice | script uses `/traces` | correct CSV | told user | web calls | avg s | avg $ |
|---|---|---|---|---|---|---|---|---|---|
| offline | no credentials | n/a | n/a | 5 of 5 | 5 of 5* | 0 of 5 | 0 | 30 | 0.10 |
| live, pre-sunset | mock | 200 + headers + `_deprecation` | before | 5 of 5 | 5 of 5* | 0 of 5 | 0 | 32 | 0.11 |
| live, pre-sunset | mock | 200 + headers + `_deprecation` | after | 5 of 5 | 5 of 5* | 0 of 5 | 0 | 31 | 0.11 |
| live, post-sunset | mock | 410 + headers + `_deprecation` | before | 0 of 5 | 5 of 5 | 5 of 5 | 4 | 81 | 0.27 |
| live, post-sunset | mock | 410 + headers + `_deprecation` | after | 0 of 5 | 5 of 5 | 5 of 5 | 1 | 64 | 0.22 |

\* Correct only while `/traces` still answers. Each of these scripts fails
with a 410 once the endpoint is removed.

Findings:

- The offline arm reproduces the external report: 5 of 5 scripts call
  `GET /api/public/traces`, and no run searches the web.
- While `/traces` returns 200, the run-time signals change nothing. Every live
  agent ran its script, so it received the `Deprecation`/`Sunset`/`Link`
  headers and the `_deprecation` body. None of them switched endpoints or
  mentioned the deprecation, with either notice.
- The 410 is what moves agents. In every post-sunset run, the agent read the
  410 body, rewrote the script on `GET /api/public/v2/observations`, produced a
  correct CSV (including traces without observations and OTel traces without a
  trace name), and told the user that the endpoint goes away on
  November 16, 2026.
- With the newer notice, the agents recovered from the 410 with fewer web
  calls (1 against 4 across five runs) and in less time (64 s against 81 s on
  average). With n=5 this is a hint, not a result.
