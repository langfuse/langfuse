---
name: analyze-cloud-costs
description: |
  Analyze Langfuse Cloud infrastructure cost structure using Metabase cost
  marts. Use when asked about cloud spend, AWS versus ClickHouse cost splits,
  cost drivers by provider/service/usage type/account, daily cost per tracing
  event, infra cost dashboards, or cost regressions visible in Metabase.
---

# Analyze Cloud Costs

## Overview

Use this skill for evidence-backed Langfuse Cloud cost analysis. The primary
source is the Metabase infra cost dashboard and its production cost marts; the
deliverable should name the time window, query grain, top drivers, and caveats.

## Workflow

1. Clarify the question and choose the grain:
   - Headline daily totals: total, AWS, ClickHouse, tracing events, and cost per
     100k events.
   - Cost structure: provider, service, usage type, operation, account, and day.
   - Driver or regression analysis: compare a recent complete-day window against
     a prior baseline.
2. Load [`references/cost-marts.md`](references/cost-marts.md) for table IDs,
   field IDs, query examples, and caveats.
3. Use the Metabase MCP. If the Metabase tools are not visible, discover them
   with tool search before falling back to manual interpretation.
4. Prefer complete UTC days. Avoid treating current-day AWS cost as final
   because AWS CUR rows can arrive late.
5. Start broad, then drill down:
   - Provider split.
   - Service split within the dominant provider.
   - Usage type, operation, and account split for the top services.
   - Daily trend when explaining change over time.
6. Report only what the queried data supports. If a requested slice is absent,
   say that no rows were found for that slice instead of inventing a driver.

## Query Rules

- Use `mcp__metabase__.query` for quick reads. Use
  `construct_query` plus `execute_query` when you need to inspect or reuse the
  opaque query.
- Pass `filters`, `aggregations`, `group_by`, and `fields` as JSON arrays. Some
  tool schemas may display these as strings; if that happens, serialize the same
  arrays without changing their shape.
- Keep limits explicit and small enough for analysis. Use pagination only when
  the continuation token is needed.
- Include the Metabase dashboard link or query result context in the final
  answer when useful.

## Output Expectations

Summarize:

- Time window and whether it uses complete UTC days.
- Total cost and provider split when relevant.
- Top cost drivers by service, usage type, operation, or account.
- Trend or baseline comparison when the user asks "why did this change?"
- Caveats, especially incomplete current-day AWS data and ClickHouse credit
  labeling in the unified mart.
