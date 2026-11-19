import { type HomeDashboardPresetId } from "@langfuse/shared";

export const legacyReport: Record<
  HomeDashboardPresetId,
  {
    question: string;
    before: string;
    recipe: string;
    status: "matched" | "changed" | "review";
    note: string;
  }
> = {
  "home-traces": {
    question: "How many traces ran, and which trace names account for them?",
    before:
      "On the current read path, counts distinct trace IDs in observations. A separate query supplies the full-period total; the list shows the top 20 named groups and drops missing names. Older saved versions count trace records instead.",
    recipe:
      "Choose Observations, distinct Trace ID, grouped by Trace name, with horizontal bars and a full-period headline. Use the same dashboard filters and time range. The starter displays up to 25 groups and keeps missing attribution visible.",
    status: "changed",
    note: "Distinct counts and their ungrouped total already work with deployed queries. The starter changes the list bound and missing-name handling. Matching both the old named-only list and its broader headline requires separate filter scopes. Never sum grouped distinct counts to produce the total: one trace can occur in more than one group.",
  },
  "home-model-costs": {
    question: "Which models consumed tokens and cost the most?",
    before:
      "Sums cost and tokens for generation-like observations, grouped by model and ordered by cost. It fetches 20 groups, omits missing model names from the table, and labels the subtotal of the fetched groups as Total cost.",
    recipe:
      "Choose Observations, filter Type to the generation-like types, group by Model, and add Sum total cost plus Sum total tokens. Use a table with the cost metric as its headline. The starter allows 25 groups and queries the full matching population for the headline.",
    status: "changed",
    note: "Both measures and model grouping already exist. The POC adds a reusable summary binding and table presentation, rather than a new aggregation. The top-list subtotal is deliberately replaced by a full-period total, so the headline can exceed the visible rows; missing-model groups remain visible.",
  },
  "home-scores-table": {
    question:
      "Which score definitions exist, how often were they recorded, and what values did they receive?",
    before:
      "Combines score counts, numeric or boolean means, and counts equal to zero or one into one table, grouped by score name, source and data type. A headline totals the score counts. The current implementation is not inherently limited to trace-attached scores; trace filters can introduce a related-event restriction.",
    recipe:
      "Use separate named views for numeric count and mean, boolean count and true share, false and true counts, and categorical counts by value. Keep score name and source in every definition. Use All score targets unless an attachment filter is intentional.",
    status: "review",
    note: "The deployed score views support these aggregates and filtered counts. The starter does not recreate the single merged table, its all-score headline, or numeric zero/one columns; those need an explicit composition decision. Meaningless categorical averages and zero/one columns are deliberately omitted. The explicit attachment-target selector is a POC query extension, not a prerequisite for the unrestricted score queries.",
  },
  "home-traces-obs-time-series": {
    question:
      "How does observation traffic change over time, and how many distinct traces contribute?",
    before:
      "The current card shows observation counts per time bucket, split by level, with an additive count headline. Older saved versions also offer a trace-count tab. The current read path hides that trace tab.",
    recipe:
      "Use a bars-over-time view with Count observations grouped by Level. Add a second named query for distinct Trace ID without a breakdown. Select the active query as a view and compute its headline across the full period.",
    status: "changed",
    note: "Both count queries are already expressible. The extra distinct-trace view is an addition to the current card, not recovered current behavior. The POC supplies multi-query view selection and independent summary requests. A trace can span buckets, so summing bucket-level distinct counts must not produce its full-period headline.",
  },
  "home-model-usage": {
    question:
      "How do model cost and token usage change over time, by model and by usage category?",
    before:
      "Offers four views: cost by model, cost by cost-map key, usage by model, and usage by usage-map key. All use generation-like observations and the selected models; initially the first ten available models are selected. Headlines cover that selected population.",
    recipe:
      "Create four named queries for Sum total cost by Model, Sum cost by type by Cost type, Sum total tokens by Model, and Sum usage by type by Usage type. Apply the same Type and Model filters to each. Bind the category views' headlines to total cost or total tokens.",
    status: "changed",
    note: "All four views use existing aggregates. This report saves ten explicit models across all four queries. Select the same ten in the Home card for a comparison. Hiding a legend series only changes the display. Cost and token totals come from separate whole-population aggregates.",
  },
  "home-users": {
    question: "Which users account for the most model spend or traces?",
    before:
      "Offers cost and trace-count views, each ranked to 20 users. Cost includes only generation-like observations; the current trace view counts distinct trace IDs. Both headlines sum the returned top-20 groups rather than querying a full-population total.",
    recipe:
      "Use horizontal bars grouped by User ID, with named Cost and Distinct traces queries. Add the generation-like Type filter to the Cost query to retain its original scope. Leave the trace query's population independent and request full-period summaries.",
    status: "changed",
    note: "The deployed sums and distinct counts are sufficient. The saved cost query applies the generation-like filter. The recipe shows up to 25 users and queries a full-period total. A viewer can therefore see a larger headline than the old top-20 subtotal. Agree on that change before migrating existing cards.",
  },
  "home-chart-scores": {
    question:
      "How does the average value of each numeric or boolean score change over time?",
    before:
      "Queries numeric and boolean score records, grouped by name, source and data type, and averages their values within each time bucket. Its Moving average description is misleading: there is no rolling-window calculation.",
    recipe:
      "Choose Numeric scores, Average value, and breakdowns Name, Source and Data type in a line chart over time. Filter to the score definitions being compared. A boolean mean is the true share among those score records, not among every trace.",
    status: "matched",
    note: "The aggregate, score identities and time buckets already exist in deployed queries; multiple breakdowns need suitable series presentation. The replacement corrects the wording to bucket mean. A true moving average would be a separate capability. Attachment filtering is optional POC functionality, and unrelated numeric scales still need separate charts or an explicit display decision.",
  },
  "home-latency-table-traces": {
    question: "How long do recorded root observations take, by trace name?",
    before:
      "On the current read path, measures each root observation's own duration, grouped by trace name, with p50, p90, p95 and p99. It shows the top 20 by p95. Older saved versions measure trace duration instead; a synthetic root without an end time has no measured root latency.",
    recipe:
      "Choose Observations, filter Is root observation to true, and group by Trace name. Add the four latency percentiles, sort by p95 descending, and use a table limited to 20 rows. Keep the label Root observation latency.",
    status: "review",
    note: "Both cards use the existing sampled percentile. In a synthetic group of 20,200 roots, repeating one unchanged p99 query returned 9.10 s and 70.94 s. The old card's query also varied when repeated. Agree on acceptable tail variation before migration. Keep older whole-trace duration cards separate from root duration.",
  },
  "home-latency-table-generations": {
    question: "Which generation names have the slowest latency distributions?",
    before:
      "Uses generation-like observations grouped by observation name, with p50, p90, p95 and p99 latency. It returns the top 20 by p95 and omits missing names when rendering the table. Model is not the grouping field.",
    recipe:
      "Choose Observations, apply the generation-like Type filter, and group by Name. Add p50, p90, p95 and p99 of Latency, sort by p95 descending, and display a 20-row table with duration formatting.",
    status: "matched",
    note: "All four fixed percentiles and this grouping are already supported by deployed queries. The POC makes the configuration editable and keeps the metric columns separate. Missing-name groups can be displayed explicitly. Do not average the per-name percentiles into a total; a global percentile requires its own ungrouped query.",
  },
  "home-latency-table-observations": {
    question: "How does latency differ across observation types and names?",
    before:
      "Groups observations by both Type and Name, excluding only the GENERATION type. It reports p50, p90, p95 and p99, ordered by p95 descending and limited to 20 groups. Other generation-like types, including embeddings, remain included.",
    recipe:
      "Choose Observations, set Type to none of GENERATION, and group by Type plus Name. Add the four latency percentiles, sort by p95 descending, and use a table limited to 20 rows.",
    status: "matched",
    note: "The source, exclusion, grouping, percentiles and bound already exist in deployed queries. Keep the exact exclusion during migration; removing every generation-like type would change the population. Missing names can be shown explicitly instead of discarded. No percentile grand total is implied by these rows.",
  },
  "home-generation-latency": {
    question: "How do latency percentiles compare across the models I choose?",
    before:
      "Queries generation-like observations by model and time with p50, p75, p90, p95 and p99. A model selector initially chooses ten models, and percentile tabs show one percentile at a time. Empty latency buckets are gaps.",
    recipe:
      "Choose Observations, filter to the generation-like types and the intended models, and group by Model in a line chart. Save five views, one for each of p50, p75, p90, p95 and p99. Switch the percentile above the plot. Each view groups by model within a time bucket.",
    status: "changed",
    note: "The report saves ten explicit models and all five percentile choices. Home initially selects ten models from the project. Match the selected models before comparing. Check tail estimates across repeated executions before replacing an existing chart.",
  },
  "home-score-analytics": {
    question:
      "What is each selected score's distribution, and how does it change over time?",
    before:
      "A container remembers selected score definitions in the viewer's browser and renders two charts per selection: histogram plus bucket-mean trend for numeric or boolean scores, or category counts plus category trends. This is separate from the two-score comparison Analytics page.",
    recipe:
      "Use the distribution/trend pair appropriate to each score type, with matching Name, Source and Data type filters. This report shows boolean distribution as two bar-chart queries counting false and true values separately. Duplicate pairs for additional definitions and save the filters with the dashboard.",
    status: "review",
    note: "Numeric histograms, means, category counts and the report's two boolean-count queries use deployed query capabilities. Exact custom histogram bands elsewhere remain a POC backend extension. Six example charts do not migrate selected score definitions or reproduce the dynamic container. Browser-local selection is deliberately replaced by saved filters, but the expansion and migration interaction still need review.",
  },
};
