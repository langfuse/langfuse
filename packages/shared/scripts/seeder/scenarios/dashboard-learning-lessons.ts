export const learningLessons = {
  records: {
    intro: `Start with the records, then choose the chart. A trace, an observation and a score describe different things. The same application request can contribute once to a trace count, twice to an observation count and several times to an evaluation count.

This chapter uses a small fictional request. The live charts below use the larger synthetic project, so their totals will differ.`,
    notes: [
      {
        title: `Follow one request through three kinds of records`,
        content: `At 09:59 on 18 November, a user asks an assistant a question. The application records two observations. An evaluator assigns a named score the following morning.

\`\`\`text
request-42
└─ answer-1       SPAN
   └─ generate-1  GENERATION
      └─ quality-1 = 0.8
\`\`\`

| Record | Identity | What one row means |
| --- | --- | --- |
| Trace | request-42 | One request grouping its observations |
| Observation | answer-1 or generate-1 | One measured operation with its own start/end |
| Score | quality-1 | One evaluation record attached to generate-1 |

This request contributed **1 trace and 2 observations** on November 18. Its **1 score** has a November 19 timestamp and identifies generate-1 as the operation evaluated. A chart counting operations and a chart counting evaluations therefore read different records on different dates.`,
      },
      {
        title: `V4 stores spans and derives the trace view`,
        content: `In the V4 read path, observations are stored in \`events_full\` and its lighter \`events_core\` projection. An event row carries \`project_id\`, \`trace_id\`, \`span_id\`, \`parent_span_id\`, start/end times and attributes. The UI reconstructs the tree from those IDs. Trace-level views aggregate related events rather than requiring a separate physical trace row for every request.

These are logical records. The tables use ReplacingMergeTree. Updates may leave several physical versions until parts merge. Full and core represent the same events. Adding their row counts would count the events twice. Use the existing event query path rather than assuming raw table row counts equal logical operations. The event path deliberately avoids \`FINAL\`.

\`\`\`text
Stored events → group by trace_id → trace summary
              → parent_span_id   → observation tree
Stored scores → attachment IDs   → evaluation badges
\`\`\`

**What counts as a root?** The shared root predicate accepts an empty parent ID **or** \`is_app_root = true\`. An application root may have an external parent. Counting root observations and counting distinct trace IDs are therefore different definitions. Migrated data can also include a synthetic trace span.

Open **View this trace** beside the live result. Use the tree to identify the root and its children. In the chart’s **Data** tab each type/name group has one observation. The shared trace ID is what lets the three rows describe one request.`,
      },
      {
        title: `Choose the population before choosing the aggregation`,
        content: `Read this query from left to right.

> Among observations in this project and period, keep generations whose workload is search. Sum their recorded cost for each model.

| Part | Decision |
| --- | --- |
| Source and grain | Observations, one operation per logical record |
| Scope | Authorized project, time period, environment |
| Filter | Generation with workload equal to search |
| Measure and aggregation | Sum of recorded total cost |
| Breakdown | Model |
| Display | Bars in currency units |

The report's SQL examples use **conceptual views** named \`observation_records\` and \`score_records\`, with normalized field names. These names represent logical records in the examples. The real table names and compiler path appear in the storage and query-builder chapters. Actual requests use the validated API and event query builder. Bound parameters such as \`{project: String}\` represent server-validated values. Project authorization and tenant filtering remain mandatory on every query and relation.`,
      },
      {
        title: `A point on the chart has a clock and a unit`,
        content: `The observation query view uses **start time**. Direct score views use **score timestamp**. A trace view aggregates event timestamps using root and fallback rules. Its time definition can differ from an individual observation’s start.

For the fictional request, an observation chart places both operations on 18 November. With the score timestamp explicitly set to 19 November, the quality chart places the evaluation on 19 November. If an integration backdates the score timestamp, it appears in that earlier bucket instead. Timestamp and ingestion/creation time are separate fields.

**Read one point as** “average numeric quality of the selected score records whose score timestamps fall in this bucket.” Read its companion count as the number of evaluations supporting that mean.

Duration measures in these query views are **milliseconds**. Cost uses currency. Tokens, observations, traces and scores each have their own counting unit. A shared axis needs compatible units. Use a table when the quantities cannot share one meaningful scale.`,
      },
    ],
  },
  metadata: {
    intro: `Metadata lets each observation carry attributes without adding a database column for every application field. That flexibility does not make every metadata question the same query. Presence, equality, selected comparisons and discovering all groups have different semantics and costs.`,
    notes: [
      {
        title: `Read the actual metadata layout`,
        content: `V4 stores two aligned string arrays. Names are flattened paths. The value at position i belongs to the name at position i.

\`\`\`text
Application metadata          V4 columns
{ workload: "search",         metadata_names  = ["workload", "client.tier", "abc"]
  client: { tier: "pro" },     metadata_values = ["search",   "pro",         ""]
  abc: "" }
\`\`\`

The ingestion helper recursively flattens objects. Non-string scalars and arrays are serialized. An array attached to one observation still belongs to that single observation. Literal dotted keys and nested objects can collide on one flattened path. The helper keeps the first emitted value.

\`events_full\` retains full values. The materialized \`events_core\` projection keeps names but truncates each metadata value, input and output to **200 characters**. The query layer routes truncation-sensitive predicates to the full table. A future grouping feature must preserve full-value identity. Grouping truncated prefixes could merge distinct clients.`,
      },
      {
        title: `Distinguish a missing key from an empty value`,
        content: `“Has key abc” asks whether \`abc\` occurs in the names array. It includes a stored empty string. “Workload equals search” checks that the key exists **and** its aligned value matches.

\`\`\`sql
SELECT count()
FROM observation_records
WHERE project_id = {project: String}
  AND start_time >= {from: DateTime64(3)}
  AND start_time <= {to: DateTime64(3)}
  AND has(metadata_names, {key: String})
  AND metadata_values[indexOf(metadata_names, {key: String})]
      = {value: String}
\`\`\`

The guard handles a tricky case. an absent key gives \`indexOf = 0\`, and an out-of-range array lookup can yield the default string. That default must not masquerade as an existing empty value. In the product filter, use **is set / is not set** for presence. A text comparison asks about the stored value.

For nested metadata such as \`client.tier\`, select that exact stored path. The prefix \`metadata.\` describes the UI field. The example’s stored name is simply \`client.tier\`.`,
      },
      {
        title: `Two independent questions can overlap`,
        content: `Each metadata bar applies its own predicate to the same records.

| Observation | Has abc | Has bbc |
| --- | --- | --- |
| One | Yes | No |
| Two | Yes | Yes |
| Three | No | Yes |

The bars are **2 and 2**, although there are only 3 observations. Their sum is 4 because observation Two belongs to both populations. The union is 3 and the intersection is 1. A partition into exclusive categories would put observation Two in its own “both” group.

The new multi-query editor can issue one existing query per chosen predicate. Adding \`abc is set\` and \`bbc is set\` to one query instead would combine them with **AND** and count only the intersection.

Read the live presence and overlap charts together. A legend can hide a rendered series. Editing its predicate changes which records contribute.`,
      },
      {
        title: `Selected bars and dynamic grouping answer different questions`,
        content: `**Selected comparison.** “Show search, support and coding.” Each chosen value has its own \`WHERE\` predicate. A new workload will not appear automatically.

**Dynamic breakdown.** “Find every value of workload and sum cost for each.” This requires extracting the chosen key and using its value in \`GROUP BY\`.

\`\`\`sql
SELECT metadata_values[indexOf(metadata_names, {key: String})] AS workload,
       sum(total_cost) AS cost
FROM observation_records
WHERE project_id = {project: String}
  AND start_time >= {from: DateTime64(3)}
  AND start_time <= {to: DateTime64(3)}
  AND has(metadata_names, {key: String})
GROUP BY workload
ORDER BY cost DESC, workload ASC
LIMIT 10
\`\`\`

ClickHouse can express this operation. To expose it in dashboards, the API needs a dimension that accepts a metadata key and a compiler that binds that dimension to its value column. The current catalogue only accepts registered dimensions.

Before shipping it, define missing keys, value typing, ties, full-value handling and an “Other” group. An unrestricted client-ID breakdown can create far more series than a chart can use.`,
      },
      {
        title: `The compiler could share work without changing the question`,
        content: `Two conditional counts can read the same input rows.

\`\`\`sql
SELECT countIf(has(metadata_names, {keyA: String})) AS a,
       countIf(has(metadata_names, {keyB: String})) AS b
FROM observation_records
WHERE project_id = {project: String}
  AND start_time >= {from: DateTime64(3)}
  AND start_time <= {to: DateTime64(3)}
\`\`\`

The two counts still overlap. Conditional aggregates preserve that meaning while changing the execution plan. The current multi-query adapter issues independent requests. Sharing a scan is a proposed optimization.

Fusion needs compatible source, scope, time grain and aggregation behavior. A different source, join, histogram or group selection can require a different plan. Measure a broad shared scan and two selective scans on the same data. Either plan can win.

The core table has a metadata-name bloom skipping index and text indexes. The full table also has text indexes. Skipping indexes let ClickHouse eliminate whole blocks that cannot match. Validate pruning with a representative plan and read counters. [Conditional aggregates](https://clickhouse.com/docs/reference/functions/aggregate-functions/combinators).`,
      },
    ],
  },
  aggregation: {
    intro: `A chart reduces many records into a few numbers. To interpret those numbers, keep the source grain, grouping keys, time buckets and aggregation visible. A full-period headline asks for an aggregation over the whole selection. The right way to compute it depends on the metric.`,
    notes: [
      {
        title: `How filtering and grouping shape the result`,
        content: `\`WHERE\` first chooses eligible records. \`GROUP BY\` then creates a result for each distinct combination of dimensions and time bucket. Several metrics can share that same population and grouping.

\`\`\`sql
SELECT toStartOfHour(start_time) AS hour, model,
       count() AS observations,
       sum(total_cost) AS cost,
       avg(latency_ms) AS mean_latency
FROM observation_records
WHERE project_id = {project: String}
  AND start_time >= {from: DateTime64(3)}
  AND start_time <= {to: DateTime64(3)}
GROUP BY hour, model
\`\`\`

Changing the display from line to bars does not change membership. Changing the source, filter, metric, grouping or required result shape does. The editor marks those query changes until **Run preview** succeeds. Appearance changes reuse measured results when their shape remains compatible.

A database \`LIMIT\` after aggregation bounds returned rows. The database may still process every eligible row and group to choose them.`,
      },
      {
        title: `Compute a full-period mean`,
        content: `Suppose two time buckets contain these measured latencies.

| Bucket | Values in ms | Count | Sum | Mean |
| --- | --- | ---: | ---: | ---: |
| A | 100 | 1 | 100 | 100 |
| B | 10, 10, 10 | 3 | 30 | 10 |
| Full period | All four values | 4 | 130 | 32.5 |

The mean of the displayed means is \`(100 + 10) / 2 = 55 ms\`. The true full-period mean is \`130 / 4 = 32.5 ms\`. Use a separate full-period aggregation or combine sums and **counts of measured values** as a weighted mean.

Counts and sums can be added across disjoint complete buckets at the same grain. Distinct counts can overlap when the same user appears in several buckets. The current \`uniq\` aggregation is an approximate distinct estimator. An exact distinct count has different precision and resource requirements. Percentiles cannot be averaged, added or reconstructed from the percentile numbers alone. Those need the original values or compatible mergeable aggregate states.

The POC requests a separate ungrouped result for a period headline when needed. That preserves the intended math but can add another database query per source.`,
      },
      {
        title: `Read zero, missing values and failures`,
        content: `| Result | Meaning |
| --- | --- |
| Count = 0 after a successful query | No matching records |
| Recorded cost sum = 0 | No recorded cost contributed. Pricing coverage is a separate question |
| Average or percentile with no measured inputs | No measured value |
| Error count / observation count with denominator 0 | No defined rate |
| Failed or incomplete query | Unknown result |

The query engine can fill empty time buckets with aggregate defaults. The adapter also asks for sample counts where needed so an empty mean does not become a plausible zero. The Data tab retains nulls. A chart with no measured numeric values shows an empty state.

The error-rate example divides aligned counts and formats the resulting fraction as a percentage. Store \`0.02\` and format it as **2%**. Multiplying by 100 and also using percent formatting produces the wrong answer. Missing operands and zero denominators stay undefined.`,
      },
      {
        title: `The actual time boundary is inclusive`,
        content: `The existing query builder applies **\`timestamp >= from\` and \`timestamp <= to\`**, using the source's time column. Both endpoints are included. The snippets in this report deliberately match that behavior.

Two adjacent queries \`[09:00, 10:00]\` and \`[10:00, 11:00]\` can both include a record exactly at 10:00. A half-open contract \`[from, to)\` would avoid that overlap, but adopting it would be a change to the existing contract.

Filtering and bucket labels are separate. A weekly chart for a period starting Friday may label its first bucket with the preceding Monday. That does not mean it admitted records before Friday. The current 90-day auto-granularity selects weeks, so the first and last displayed buckets can be partial.

Use explicit instants and a declared timezone for reproducible comparisons. The educational examples use UTC. Do not infer a full week's exposure from its label alone.`,
      },
      {
        title: `Stable top groups need a two-stage question`,
        content: `“Show the ten most expensive clients over time” needs a definition of **top**:

\`\`\`text
All eligible records
  → sum cost per client over the whole selected period
  → select a stable ten clients (and define ties)
  → bucket those same clients through time
\`\`\`

Sorting individual client-hour rows and keeping ten rows gives the ten largest **client-hour pairs**, not ten complete client series. Selecting a fresh top ten in every bucket creates changing membership and an unstable legend.

Cardinality is the number of distinct groups. A query with 10,000 clients, 90 days and 3 metrics could produce up to 2.7 million scalar values before truncation. Fewer returned rows do not erase the cost of discovering and ranking those groups.

The future planner exposes this intent without pretending it already has an execution contract. Agree on global versus per-bucket ranking, tie-breaking, missing clients, an “Other” remainder and limits before turning it into a chart.`,
      },
    ],
  },
  scores: {
    intro: `Begin a score chart by naming the evaluation. Choose the named score, origin and data type, then say whether the question is an average value, a pass rate or the number of evaluation records. Show the sample count alongside the trend.`,
    notes: [
      {
        title: `Define exactly which quality scores are being averaged`,
        content: `For the fictional evaluation, select **quality · API · numeric**, then average the score value over score time. The configured definition can also provide the scale, such as 0–1.

\`\`\`sql
SELECT toStartOfHour(timestamp) AS hour,
       avg(value) AS mean_quality,
       count() AS evaluations
FROM score_records
WHERE project_id = {project: String}
  AND timestamp >= {from: DateTime64(3)}
  AND timestamp <= {to: DateTime64(3)}
  AND name = {scoreName: String}
  AND source = {source: String}
  AND data_type = 'NUMERIC'
GROUP BY hour
\`\`\`

This is the question shown by the live average-quality trend and its sample-count companion. A configured definition ID is a stronger identity than a name alone when several configurations can share that name.

The existing \`scores-numeric\` view accepts both NUMERIC and BOOLEAN records. The editor adds an explicit numeric-type predicate for a numeric definition. Choosing that view alone is not enough to prove the population is numeric-only.`,
      },
      {
        title: `Choose the aggregation that matches the score type`,
        content: `| Data type | Useful question | What the number means |
| --- | --- | --- |
| Numeric quality | Average value | Mean across selected evaluation records on the definition's scale |
| Boolean accepted | Average of 0/1, displayed as % | Share of evaluated records that are true |
| Boolean accepted | Count where value is true | Number of positive evaluation records |
| Categorical outcome | Count grouped by string label | Distribution such as success / review / blocked |

A category's internal numeric code is not a meaningful quality scale. Do not average the codes for success and blocked. Different numeric definitions can also have incompatible ranges. A mean across 0–1 quality and 1–5 helpfulness has no automatic interpretation.

“90% pass rate” means 90% of **evaluations**, unless the query explicitly changes the grain. It does not establish that 90% of all traffic was evaluated or that 90% of distinct observations passed.`,
      },
      {
        title: `Late evaluations change evaluation-time charts`,
        content: `In request-42, the operations started on 18 November and the quality score was timestamped on 19 November.

\`\`\`text
Observation-time view: 18 Nov → the operation happened
Score-time view:       19 Nov → the selected evaluation was timestamped
\`\`\`

Filtering both sources to 18 November keeps the operation but excludes that score. Backdating a score timestamp changes this placement. \`created_at\` and actual arrival time are not substitutes for the selected time basis.

This synthetic scenario includes scores timestamped outside its report window and others timestamped near the end. In the 303,000-observation project for **21 August–19 November 2026 UTC**, the raw results contain **3,540 in-window quality evaluations** for the configured quality trend. Summing the displayed quality sample buckets gives that count of evaluation records. A count of distinct observations needs the evaluated IDs.

Before an alert reuses this query, decide the evaluation-time basis, lateness allowance, minimum sample count and handling of partial buckets. A new evaluation can change a chart for old traffic without the application itself changing.`,
      },
      {
        title: `How attachment affects counting`,
        content: `A score can carry an observation ID as well as its trace ID. The narrowest attachment identifies the evaluation context. The UI derives observation, trace, session or experiment context from the available IDs. Repeated evaluations each have their own score record.

| Situation | Score records | Distinct scored observations |
| --- | ---: | ---: |
| generate-1 evaluated once | 1 | 1 |
| generate-1 evaluated three times | 3 | 1 |
| One trace-level evaluation only | 1 | 0 observation attachments |

Averages across records weight an operation with three evaluations three times. To weight every operation once, first choose a rule such as the latest evaluation, first evaluation or mean per operation.

The first-release score editor leads with definition and measure. Attachment can further restrict the population. Exact context scopes must be supported by the execution path. The current-mode adapter rejects the implicit trace-fallback scope when one flat filter cannot express it faithfully.`,
      },
      {
        title: `Find observations with a poor score`,
        content: `“How many observations received quality below 0.5?” crosses from score records to observations. It is not the same as counting score records below 0.5.

The query needs five decisions.

1. Select the score definition, origin and numeric/boolean type.
2. Choose which evaluations qualify, such as any match, the latest or a per-observation reduction.
3. Match by **project + trace + observation identity**, with compatible event identities.
4. Choose observation-time versus score-time filtering and the permitted evaluation window.
5. Count each qualifying observation once. Define the treatment of unscored observations.

Three matching evaluations must not accidentally triple the observation's cost or count. Filter both sides first, then reduce or use an existence-style match when that matches the intended question. “Latest” needs explicit ordering and a rule for ties.

ClickHouse supports joins and semi-join patterns. Existing query views already use some relations. This specific user-facing relationship builder is deferred until identity, time and deduplication semantics are agreed. The future editor displays the proposed plan for review.`,
      },
    ],
  },
  performance: {
    intro: `For each chart, ask whether ClickHouse can express the operation, whether the query API exposes it, and how much work it takes at dashboard scale. The measurements below come from a local fixture. Establishing a production budget requires a separate workload test.`,
    notes: [
      {
        title: `Read rows, bytes and elapsed time`,
        content: `A separate immutable local fixture contains **999,000 observations** over 90 complete UTC days. The recorded prototype experiment produced these measurements.

| Shape | Database queries | Rows read | Bytes read | API median |
| --- | ---: | ---: | ---: | ---: |
| One count | 1 | 1,014,885 | 42,827,521 | 21.4 ms |
| Two metadata populations | 2 | 2,030,770 | 317,521,726 | 67.7 ms |
| Five populations | 5 | 5,082,569 | 681,566,578 | 139.8 ms |

Rows/bytes are **summed engine read counters across requests**. An observation read by two requests contributes twice. Reading approximately 5.08 million rows for five populations exposes repeated work. The greater byte cost also reflects which columns each shape reads.

Each shape had one warmup and only three retained sequential samples, with warm local data and concurrent development activity. No cache flush, peak-memory measurement or production-concurrency test was performed. The experiment completed **48/48 requests**. Use the medians to compare these query shapes on this fixture.`,
      },
      {
        title: `A small dashboard can multiply into many queries`,
        content: `A widget with five independent queries can issue five database requests. If each grouped/time-series source also needs a separate full-period summary, it can issue five more. Twenty such widgets can therefore require up to **200 requests for that shape**, before retries or refreshes.

The POC bounds configured queries, schedules dashboard work and reuses fresh cached results. These controls limit how many queries run together. Each individual scan still needs its own budget. A row limit protects response size differently from a timeout, memory limit, cardinality limit or dashboard concurrency limit.

Possible next steps include batching compatible conditional aggregates, sharing multi-percentile states, caching stable queries and pre-aggregating common questions. Each trades flexibility, freshness or storage for less repeated work. Inspect representative plans and measure rows, bytes, elapsed time, peak memory, queueing and cancellation under concurrent use before choosing one.`,
      },
      {
        title: `When an index can skip work`,
        content: `The V4 event tables are ordered by project, start-time minute, trace hash, span ID and start time. The primary index uses the project/time/trace-hash prefix. Month partitions help lifecycle management and can exclude unrelated months. They are not a per-client lookup index.

**Project and time scope come first.** ClickHouse reads columns, so a count may need much less data than a metadata-content predicate. Metadata skip/text indexes can reject irrelevant blocks when the predicate and data distribution allow it. If almost every block contains the key, a presence index has little to skip.

High-cardinality grouping adds aggregate state even if the final chart shows ten rows. Joins can add their own memory and matching work. A future capability needs a workload budget, not just another dropdown.

Validate with \`EXPLAIN indexes = 1\` and observed counters on representative data. [Primary-key guidance](https://clickhouse.com/docs/best-practices/choosing-a-primary-key), [skipping-index guidance](https://clickhouse.com/docs/best-practices/use-data-skipping-indices-where-appropriate).`,
      },
      {
        title: `Repeated p99 can move even when the population is unchanged`,
        content: `The current compiler uses ClickHouse \`quantile(0.99)\`, an **approximate, nondeterministic reservoir-sampling aggregate**. An exact percentile uses a different aggregate.

In repeated local runs over the unchanged synthetic root-observation population, the Code review group had **20,200 records** in both runs. Its p99 was **70,937.51 ms** in one run and **9,097.09 ms** in another run with the same count-enabled query. Other repeated results also changed without adding or removing the count metric.

The fixture has a sharp tail, so sampling near that boundary can produce a large value difference. The extra count measures sample size. Even when it stays constant, a sampled estimate near a steep tail can move. Decide which accuracy and repeatability a chart needs before choosing its estimator.

Current fixed percentile choices are p50/p75/p90/p95/p99. The prototype accepts a custom level but still uses the approximate aggregate. Evaluate deterministic, t-digest or exact alternatives against accuracy, stability and memory requirements. Exactness is not free. [ClickHouse quantile semantics](https://clickhouse.com/docs/reference/functions/aggregate-functions/quantile).`,
      },
      {
        title: `Turn the prototype into a reviewable query contract`,
        content: `| Available composition | Needs a new or extended contract |
| --- | --- |
| Independent filters over existing sources | Arbitrary metadata-value grouping and global top groups |
| Multiple metrics at the same grain | Server-side ordering by a computed expression |
| Bounded formulas over aligned returned results | Cross-record score/observation selection with deduplication |
| Existing fixed percentile choices and adaptive histogram | Custom percentile parameters and fixed bands tested here through the prototype |
| Text, interpretation and dashboard layout | Reusing the validated question safely in alerting |

A backend review should settle four questions.

- **Meaning.** source grain, score definition, time basis, missing values and summary math.
- **Execution.** independent scans versus shared conditional aggregates, full metadata routing and relationship reduction before joining.
- **Budget.** queries per widget/dashboard, groups, time buckets, state memory, scan bytes, cancellation and concurrency.
- **Interpretation.** explicit truncation/partial results, estimator identity, run freshness and enough diagnostics to explain a surprising point.

Halo can propose the same structured query contract for a person to inspect and run. It should not bypass validation, invent unsupported relationships or execute arbitrary user SQL. An alert additionally needs its threshold, schedule, evaluation window, lateness policy and minimum sample count.`,
      },
    ],
  },
} as const;
