---
name: langfuse-production-review
description: Review a Langfuse project's production traces for a time window, defaulting to the last 24 hours against the previous 24 hours. Compare volume, latency, errors, cost, scores, and topics, name the issues worth fixing, link the traces, and end with the next action. Use when the user asks for a production review, a daily or overnight trace review, what changed in production, how scores or topics moved, or which issues they should fix.
---

# Production review

Review one Langfuse project's application traffic and return a report the user can act on. The review is read-only until the user picks a next step.

## Window

- Default to the last 24 hours against the previous 24 hours. If the user names a window, use it and the immediately previous window of the same length.
- State both windows in the user's timezone when the conversation has one, and in UTC.
- Compare the two windows with the same filters. Report the absolute number and the change. Ignore percentage swings on tiny baselines (for example, 1 trace to 4).

## What to measure

Use Langfuse metrics and topic tools. Call `getMetricsSchema` before the first `queryMetrics`, and use the measures, dimensions, and filter types it returns. Prefer metrics over listing rows. If a query is rejected, fix it from that error instead of guessing.

Count traces as root observations (`isRootObservation` = true). Cost, tokens, and generation latency live on child observations; do not restrict those queries to roots. In the report, keep saying "traces".

Exclude Langfuse-managed environments (evaluations, prompt experiments, and any environments the product prompt tells you to hide). Say which environments you excluded. Include them only if the user asks. If an exclusion filter is rejected, group by `environment` and drop those rows yourself.

Run this set for the current window and the previous one:

| Question        | How                                                                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Volume          | Observations view, roots only, count grouped by `traceName`. Set a row limit and order by count descending.                                                                                                                          |
| Latency         | p95 `latency` on roots, grouped by `traceName`. Latency is milliseconds; report seconds when the value is at least 1000ms.                                                                                                           |
| Errors          | Observations with `level` = `ERROR`, count grouped by `name`. Then open a few of those traces.                                                                                                                                       |
| Cost            | Sum of `totalCost` grouped by `traceName`, not restricted to roots.                                                                                                                                                                  |
| Scores          | `scores-numeric` average and count by `name`. `scores-boolean` average (the true-rate) and count by `name`. `scores-categorical` count by `name` and `stringValue`. Note `source` when it separates evals from user or API feedback. |
| Evaluation load | Count of observations with `type` = `EVALUATOR`.                                                                                                                                                                                     |
| Topics          | `listTopicFacets`, then `listTopics` for both windows ordered by `traceCount.desc`. The topics window can be at most 93 days.                                                                                                        |
| Alerts          | `listAlerts` returns definitions and their urls, not firings. Do not claim an alert fired.                                                                                                                                           |

Skip a score when the current window has too few values to mean anything. Say the count instead of calling it an issue. A useful floor is about 20 scores.

## Traces to link

For every issue, open 2–3 representative traces with `listObservations` or `getObservation`. Topic rows do not include a trace url: resolve the trace id through those tools. Use only urls returned by tools. Never construct a Langfuse url.

Read enough of the input and output to describe the failure in plain language. Do not dump payloads into the report.

## What counts as an issue

Raise an issue only when the measurements support it:

- Errors jumped versus the previous window, or one error name dominates.
- A score average or true-rate moved the wrong way on enough samples.
- p95 latency roughly doubled, or one trace name is far slower than the rest.
- One trace name is most of the cost and that cost grew.
- A topic's trace count moved sharply, or traces that match no topic grew.
- The main failure has no score covering it.

A flat day is a result. Say the project looks steady. Still name one next step when coverage is thin: no scores, no topics, or no alert definition for the main error. Do not invent issues to fill the report.

## Suggestions

Each issue gets one suggestion the user could do in Langfuse. Name the trace, score, or prompt it applies to.

- Prompt: draft the text. Do not save it unless the user asks.
- Evaluator or score: say what it should catch. Do not create it unless the user asks. When they ask, follow the setting-up-evals skill.
- Alert: point at a matching definition, or say that none covers this finding.
- Topics: suggest turning Topics on only when volume is large enough to cluster. Skip it for a handful of traces.
- Cost: when spend is the issue, follow the cost-optimization skill for the opportunity table.
- Code: do not open a pull request. Give a self-contained prompt the user can hand to their coding agent.

## Slack

Do not send the report anywhere unless the user asks. After the report, ask whether to send it to Slack.

If they say yes, ask which channel when they have not named one. The Slack message is the scope line, the main concern, the issues with trace links, and the first next step.

- When a Slack tool is already available, post only after they confirm the channel.
- When no Slack tool is available, put that short message in a code block and tell them to paste it. Do not say it was sent.

## Every day

This review runs when the user asks. Do not create a schedule, webhook, or automation.

If they want it every day, give them this prompt to reuse:

```text
Do a production review of my traces for the last 24 hours. What changed in volume, scores, and topics, which issues should I fix, and what should I do next?
```

Say that Halo does not run this on a schedule yet. A coding agent in their own environment can run that prompt daily.

## Report

Return valid Markdown and nothing else. No tool names, no raw query results, no preamble about what you are about to do.

Check the Markdown before returning it: headings, tables, and links must be closed, list markers need a space, and table cells must not contain raw `|`.

Use this shape:

1. One scope line: windows, timezone, and what you excluded.
2. One sentence: the main concern, or that nothing needs action.
3. A Patterns table. Keep every row. Use `No measurements found` when a query failed, and `None` when the project has no data for that row.

| Area            | Finding |
| --------------- | ------- |
| Volume          |         |
| Change          |         |
| Latency         |         |
| Errors          |         |
| Cost            |         |
| Scores          |         |
| Topics          |         |
| Evaluation load |         |

4. **Issues.** For each issue: a short title, the numbers, 2–3 trace links, and one suggestion. If there are no issues, say so in one sentence.
5. **Next.** One to three numbered actions, most useful first. Each action says whether the user should open a trace or reply to have the change drafted. The first action must be doable in this conversation.

When a redirect tool exists, propose opening the worst trace or the traces list as the last tool call. Use a short label such as "Open error traces". Do not mention that call in the report.
