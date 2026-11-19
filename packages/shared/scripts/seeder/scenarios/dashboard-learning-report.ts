import type {
  StudioQuery,
  StudioWidgetConfig,
} from "../../../src/domain/dashboard-studio";
import {
  DashboardDefinitionSchema,
  type DashboardDefinition,
} from "../../../src/server/services/DashboardService/types";
import { createNotebook, notebookExample } from "./dashboard-notebook";
import { learningLessons } from "./dashboard-learning-lessons";

export const learningReportTitle = "How Langfuse queries your data";

export function buildDashboardLearningReport({
  report,
  projectId,
  prefix,
  observations,
  from,
  to,
  traceTimestamp,
}: {
  report: DashboardDefinition;
  projectId: string;
  prefix: string;
  observations: number;
  from: number;
  to: number;
  traceTimestamp: number;
}) {
  const { widgets, chapter, chart, note } = createNotebook();
  const selectedTrace = `${prefix}-trace-${observations / 3000}`;
  const projectPath = `/project/${encodeURIComponent(projectId)}`;
  const range = `dateRange=${from}-${to}`;
  const traceHref = `${projectPath}/traces/${encodeURIComponent(selectedTrace)}?timestamp=${encodeURIComponent(new Date(traceTimestamp).toISOString())}`;
  const vision = `${projectPath}/dashboards/${encodeURIComponent(prefix + "-report")}/report?${range}`;
  const source =
    "https://github.com/langfuse/langfuse/blob/a6f9a82068fdad77cc185998b65d254630f3cd4b";
  const example = (id: string) => notebookExample(report, id);
  const workloadCost = example("workload_cost");
  const number = (value: number) => value.toLocaleString("en-US");
  type Lesson = keyof typeof learningLessons;
  const notes = (id: Lesson, start = 0, end?: number) => {
    learningLessons[id].notes
      .slice(start, end)
      .forEach((item, i) =>
        note(`${id}_lesson_${i + start}`, item.title, item.content),
      );
  };
  const count = {
    id: "records",
    measure: "count",
    aggregation: "count",
  } as const;
  const scopedTrace: StudioQuery = {
    id: "request",
    label: "Recorded observations",
    view: "observations",
    dimensions: [],
    filters: [
      {
        column: "traceId",
        type: "string",
        operator: "=",
        value: selectedTrace,
      },
    ],
    metrics: [count],
  };
  const widget = (
    title: string,
    description: string,
    queries: StudioQuery[],
    display: StudioWidgetConfig["display"],
  ): StudioWidgetConfig => ({
    version: 1,
    executionMode: "current",
    title,
    description,
    queries,
    expressions: [],
    display: { rowLimit: 100, legend: true, ...display },
  });

  chapter("records", "Follow one request", learningLessons.records.intro);
  notes("records", 0, 1);
  chart(
    "one_trace",
    widget(
      "What was recorded for one request?",
      "One real trace from this synthetic project. Each row groups observation records by their type and operation name.",
      [{ ...scopedTrace, dimensions: [{ field: "type" }, { field: "name" }] }],
      { chartType: "PIVOT_TABLE" },
    ),
  );
  note(
    "trace_readback",
    "Read the result",
    `The three observations share a trace ID. Counting rows answers “How many operations ran?” Counting distinct trace IDs answers “How many requests are represented?” For this selection the answers are **3** and **1**. Open the trace to inspect its parent and child operations. [View this trace](${traceHref})`,
  );
  notes("records", 1);
  note(
    "storage",
    "Where each part is saved",
    "Postgres holds the dashboard definition, placements and saved widget configuration. ClickHouse holds the analytical records used to answer the query. In this report, editing a Markdown cell writes dashboard content. Changing a filter and running a preview reads analytical data. Reloading a chart combines the saved definition with the current rows in its time window.",
  );

  chapter(
    "query",
    "Read a widget as a query",
    "A chart makes three choices. It selects a population, reduces matching records to numbers, and decides how to draw them. You can read the rest of this notebook by following those choices in order.",
  );
  note(
    "query_language",
    "Translate a question into fields",
    [
      "Take “What did Search cost over this period?” **Observations** is the source. The metadata predicate chooses matching rows. **Total cost** supplies a number on each row, in USD. **Sum** turns those numbers into one result. With no grouping, the answer is a scalar.",
      "This is the analytical part of one current request. The application also supplies the project, read version, start and end times. The chart title, color and currency formatting are presentation settings.",
      '```json\n{\n  "view": "observations",\n  "filters": [{ "column": "metadata", "type": "stringObject",\n    "key": "workload", "operator": "=", "value": "search" }],\n  "metrics": [{ "measure": "totalCost", "aggregation": "sum" }],\n  "dimensions": [],\n  "timeDimension": null\n}\n```',
    ].join("\n\n"),
  );
  chart("single_cost", {
    ...workloadCost,
    title: "Recorded cost for the selected workload",
    description:
      "One filtered population, one aggregate result. Data shows the unrounded value.",
    queries: workloadCost.queries
      .filter((query) => query.id === "search")
      .map((query) => ({ ...query, label: "Workload cost" })),
    display: { chartType: "NUMBER", unit: "USD", showHeadline: true },
  });
  note(
    "pipeline",
    "Where a number becomes a mark",
    "The server resolves fields against a declared view, validates allowed measures and filters, and builds a project-scoped ClickHouse query. A grouped result has a row per group and time bucket. The browser assigns series labels, colors, units and marks. A new chart layout can reuse the same rows. Discovering a group that the server never returned requires another query.\n\n**Try one change.** Edit the chart and switch the metadata value from `search` to `support`. Predict which part of the request changes, then run the preview. The predicate and the returned sum change. The example keeps its title because it describes the selected workload. In the recorded 303,000-observation example, Search costs $1,295.78 and Support costs $100.03. Cancel to return to the saved example.",
  );

  chapter(
    "metadata",
    "Compare metadata populations",
    learningLessons.metadata.intro,
  );
  notes("metadata", 0, 2);
  chart("key_presence", {
    ...example("presence"),
    title: "Which observations carry abc or bbc?",
  });
  const populations = example("presence").queries;
  chart("overlapping_keys", {
    ...widget(
      "Count the intersection and the union",
      "Each keyed population can overlap the other. The union counts each matching observation once.",
      [
        ...populations,
        {
          ...populations[0]!,
          id: "both",
          label: "Both keys",
          filters: populations.flatMap((q) => q.filters),
        },
      ],
      { chartType: "VERTICAL_BAR" },
    ),
    expressions: [
      {
        id: "either",
        label: "Either key",
        formula: "abc.count + bbc.count - both.count",
      },
    ],
  });
  note(
    "set_math",
    "Work the counts by hand",
    `Across the full fixture, A has ${number(observations * 0.6)} observations, B has ${number(observations * 0.5)}, and ${number(observations * 0.2)} have both keys. Adding the two bars counts that intersection twice. Subtract it once to get **${number(observations * 0.9)} distinct matching observations**. The remaining ${number(observations * 0.1)} have neither. A narrower time window changes the numbers, while the arithmetic is identical.`,
  );
  notes("metadata", 2);
  chart("named_workloads", workloadCost);
  note(
    "discovery",
    "Predict what happens when a fourth workload arrives",
    "A saved comparison that names Support, Search and Coding keeps showing three bars. To discover another value automatically, the query must extract the value at `workload` for every qualifying record and group by that value. To plot the global top three over time, first choose the three winners across the full window, then bucket those same winners over time. Picking three winners independently per week answers a different question.",
  );

  chapter(
    "aggregation",
    "Choose the right aggregate",
    learningLessons.aggregation.intro,
  );
  notes("aggregation", 0, 2);
  chart("pulse_measures", example("pulse_latency"));
  note(
    "percentile_example",
    "Read a p95 point",
    "A p95 latency of 2 seconds means roughly 95% of the durations contributing to that time bucket were at or below 2 seconds. For a month-wide p95, ask for the percentile of the month's underlying durations. Averaging the weekly p95s discards the information needed to recover it.",
  );
  chart("error_fraction", example("error_rate"));
  notes("aggregation", 2);

  chapter(
    "scores",
    "Count evaluations and choose a clock",
    learningLessons.scores.intro,
  );
  notes("scores", 0, 2);
  chart("quality", example("quality_trend"));
  note(
    "score_readout",
    "A mean and its evidence",
    "Hover a point on the trend. Its evaluation count comes back with its mean. In **Data**, both appear on the same row. In the recorded August 21–November 19, 2026 example, the week of November 9 averaged 0.586 across 234 evaluations. The partial week of November 16 averaged 0.869 across 642. Late scores contribute to that final population. Your selected dates and project determine which evaluations appear in the chart. To interpret a rise in the mean, first establish which operations were evaluated each week.",
  );
  note(
    "observe_score_clock",
    "Find the two evaluations on one generation",
    `Open the example trace, select **Generate answer**, then **Scores**. Find both numeric \`quality\` evaluations attached to that operation and compare their score timestamps with the report dates. In the 303,000-observation project studied on November 19, the generation ran on November 7. One evaluation has value **0.40** and a November 7 timestamp. A second has value **0.95** and an August 18 timestamp, three days before the report starts. The trace can display both by attachment. Only the November score contributes to this generation’s part of the period trend. [Open the example trace](${traceHref})`,
  );
  chart("bool", example("acceptance"));
  notes("scores", 2);
  note(
    "trace_attribute_filters",
    "Why a trace-name filter can drop a score",
    `A trace name is an attribute of the request. The score's own timestamp determines whether an evaluation enters the score population. For a filter on a trace attribute, the current score query also looks for spans from that trace that started inside the chosen period. It derives scalar attributes from the latest non-empty value and unions qualifying tags. A score recorded Tuesday for a Monday operation can be present in Tuesday's score count while a Tuesday-only trace-name filter has no span to match. Finding the name on a score detail page answers a different lookup. To investigate, run the same named score query with and without the trace-name filter, then widen the period to include the operation.\n\nThis existing route starts with scores and looks up specific trace attributes. To count **observations** that received a poor evaluation, the query would start with observations and reduce their matching scores under an explicit rule. [Trace-attribute implementation](${source}/packages/shared/src/features/query/server/eventsTraceAttributes.ts).`,
  );
  note(
    "score_exercise",
    "Change the question, then choose the denominator",
    "“How many poor evaluations arrived?” counts score records. “How many operations received a poor evaluation?” counts distinct observation IDs after matching scores. “How many requests contained such an operation?” counts distinct trace IDs. One observation with two low evaluations contributes 2, 1 and 1 respectively. A trace-attached score without an observation ID requires its own explicit rule before it can answer an observation-level question.",
  );

  chapter(
    "performance",
    "What makes a query expensive?",
    learningLessons.performance.intro,
  );
  notes("performance", 0, 2);
  chart("cost_of_three", {
    ...workloadCost,
    title: "Three populations, three requests",
    description:
      "Open Inspect to count the source requests. Result rows and underlying rows read measure different things.",
  });
  notes("performance", 2);
  note(
    "review_method",
    "A performance review you can repeat",
    "Keep the project, SDK data shape, read version and window fixed. Compare one query with three and five. Record returned rows, database rows and bytes read, elapsed time and concurrency. Repeat each request to expose variability. Check grouped and full-period totals separately. A fast warm run on a local fixture answers a different question from many projects opening dashboards at once.",
  );

  chapter(
    "builder",
    "Which query builder?",
    "The phrase can refer to a form, a query contract, or the compiler that produces ClickHouse SQL. They solve different problems. Track which layer changes before deciding whether a chart needs backend work.",
  );
  note(
    "layers",
    "Three layers of the same question",
    [
      "| Layer | Input and output | Worked example |\n| --- | --- | --- |\n| Editor | A person's choices become a saved widget. | Two named workloads, one metric, a bar chart. |\n| Analytical contract | Typed source, filters, measures, grouping and time become result rows. | Sum total cost for observations with one workload value. |\n| Compiler and storage | Declared fields lower to scoped ClickHouse expressions and tables. | Read matching observations and aggregate their costs. |",
      "The existing application already has a query builder. On the V4 observations read path, the v2 observations view compiles through typed SQL syntax nodes (an abstract syntax tree, or AST). Other paths, including score views in the verified baseline, still use a SQL-text compiler. An AST makes transformations and field validation easier to reason about. It cannot create a missing index, define a relationship's meaning, or make every grouping cheap.",
      `Inspect the [view catalogue](${source}/packages/shared/src/features/query/dataModel.ts) and the [compiler dispatch](${source}/packages/shared/src/features/query/server/queryBuilder.ts).`,
    ].join("\n\n"),
  );
  note(
    "status",
    "Existing, under development, and proposed",
    "**Existing.** The deployed endpoint runs one declared query at a time. A widget can issue several independent requests and combine compatible results in the browser. Fixed percentiles, named score trends and ordinary grouping already have working paths.\n\n**Compiler work in progress as of November 19, 2026.** The open score-view change records the SQL generated by the existing compiler for 92 cases. These “golden” tests compare a future compiler’s SQL with that baseline. The score-view migration is a separate step. Checking returned values and measuring query cost remain necessary even when the SQL-shape tests pass. [Score-view baseline work](https://github.com/langfuse/langfuse/pull/20421)\n\n**Dashboard contract under discussion.** A widget could submit an array of queries with explicit sources, reductions, grouping keys and periods. That could let a planner share scans where populations overlap. How the editor exposes sources, which keyed expressions are supported and how cross-record questions match are separate decisions.",
  );
  note(
    "compiler_steps",
    "Follow a filter through the compiler",
    [
      "On the v2 observations path, a metadata condition arrives as a typed filter. The view registry binds the field to its storage representation. The compiler lowers the condition into syntax nodes, adds the project and time predicates, and emits parameterized SQL. Values travel as parameters. A chart still has to choose a supported filter and a declared grouping field.",
      `The common predicate representation can express grouped AND, OR and NOT. The dashboard request in the verified version accepts a flat list of filters combined with AND. Exposing nested logic requires an API and editor change. Similarly, the compiler can express a map lookup internally while the public dimensions remain a registered list. [Observation filter implementation](${source}/packages/shared/src/features/query/server/eventsObservationsRegistry.ts) · [Dashboard request schema](${source}/packages/shared/src/features/query/types.ts).`,
    ].join("\n\n"),
  );
  note(
    "next_contract",
    "What remains to design",
    [
      "| Question | Candidate solution | Decision still needed |\n| --- | --- | --- |\n| Which values of a metadata key cost the most? | Register a keyed dimension, group full values and rank across the period. | Cardinality budget, missing values and stable top groups. |\n| Which operations received a low evaluation? | Match scoped, named score records to a declared observation population. | Attachments, repeat evaluations, clocks and distinct identity. |\n| Can a widget share work across populations? | Send several named queries together so the planner can choose a shared scan. | Compatible sources and windows, plus measured read savings. |",
      "As of November 19, 2026, typed observations filters exist and the score-view work linked above records SQL baselines. Choosing explicit sources in the UI versus inferring them from selected fields is still open. These choices change the meaning and cost of real charts independently of the compiler migration.",
    ].join("\n\n"),
  );
  chart("p10", example("custom_percentile"));
  note(
    "percentile_sql",
    "Check the percentile in Inspect",
    "Choose **Inspect → Generated queries** on the generation chart. The argument in `quantile(0.1)` selects the 10th percentile of the matching durations. The prototype keeps the base metric’s output column name, so the SQL can give this result the alias `p50_latency`. The editor and chart label it p10 using the requested parameter. The proposed contract needs a stable identity and a visible label for each distinct metric.",
  );
  chart("threshold_bands", example("fixed_bands"));
  note(
    "dream_contract",
    "Read a proposed relationship before it runs",
    "How many observations started in the report period whose latest numeric API quality score within 24 hours was below 0.6?\n\n1. On a chart above choose **Edit chart → Future builder → Plan a future query**.\n2. Under **Question**, choose **Filter observations by attached scores**. Enter `quality`, choose origin **API** and type **Numeric**, and set the threshold to `0.6`.\n3. Select **Latest score per observation** and **Scores recorded within 24 hours after each observation**. Read the resulting population, time basis and count in the plan.\n\nThe custom percentile and fixed-band charts execute through the prototype. The relationship form records a proposed execution contract. Its Run button stays disabled until the backend can implement that contract.",
  );

  chapter(
    "practice",
    "Check your understanding",
    "Use these worked examples to tell a display request from a new query requirement. Each answer says what the database must know and what the browser can do with the rows it receives.",
  );
  note(
    "questions",
    "Four design questions with worked answers",
    "**1. Two bars for keys that exist.** Choose two observation counts, each with a different presence predicate. Keep both bars when they overlap. A disjoint split would need explicit A-only, B-only and both populations.\n\n**2. Display 0.125 as 12.5%.** If the stored value is a fraction, change the display formatter. Computing the share also needs a numerator and denominator measured on compatible populations. A denominator of zero yields no rate.\n\n**3. Show the five highest error rates across every client.** Group all clients, compute errors divided by total for each, define a minimum denominator and rank the results before limiting to five. A client calculation over five preselected groups cannot recover a missing winner.\n\n**4. Count traces with at least one poorly scored observation.** Decide which score, when it counts, and what to do with repeat evaluations. Match scores to observations within the project and reduce to distinct trace IDs. The cardinality of that relationship is a backend cost and a product decision.",
  );
  note(
    "glossary",
    "Vocabulary to take into the next design review",
    "**Grain** is what one input or output row represents. **Population** is the set of qualifying rows. **Dimension** is the key that splits them. **Measure** is what is counted or summarized. **Cardinality** is the number of distinct grouping keys. **Fan-out** is the multiplication of rows when one record matches several others. **A time bucket** is an interval whose matching records form one aggregate. **Pushdown** means doing a filter, aggregation or ranking in the database before returning rows to the client.",
  );
  note(
    "sources",
    "Keep reading",
    `[Back to the stakeholder dashboard](${vision}) · [Langfuse Metrics API](https://langfuse.com/docs/metrics/features/metrics-api) · [ClickHouse query execution](https://clickhouse.com/docs/optimize/query-optimization) · [ClickHouse sampled percentiles](https://clickhouse.com/docs/reference/functions/aggregate-functions/quantile) · [Langfuse query types](${source}/packages/shared/src/features/query/types.ts). The synthetic examples use the report's selected project and dates. The underlying endpoint remains project-scoped when you edit a cell.`,
  );
  return DashboardDefinitionSchema.parse({ widgets });
}
