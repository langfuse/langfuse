import { type NotebookBlock } from "@/src/features/notebooks/schema";
import {
  bullets,
  chart,
  heading,
  type NotebookFixture,
  paragraph,
  productionAnswers,
  row,
  strong,
  text,
  timeSeriesRows,
} from "./supportAssistantFixtures";

const reportingWindow = {
  fromTimestamp: "2026-11-16T00:00:00Z",
  toTimestamp: "2026-11-23T00:00:00Z",
};
const byDay = {
  ...reportingWindow,
  dimensions: [],
  timeDimension: { granularity: "day" },
} satisfies Pick<
  Parameters<typeof chart>[3],
  "dimensions" | "timeDimension" | "fromTimestamp" | "toTimestamp"
>;

const answerVolume = chart(
  "answer-volume",
  "Production answer requests",
  "bar",
  {
    ...byDay,
    ...productionAnswers,
    metrics: [{ measure: "count", aggregation: "count" }],
  },
);
const qualityScores = chart(
  "quality-scores",
  "Audited answers that passed · daily share (0–1)",
  "line",
  {
    ...byDay,
    view: "scores-numeric",
    filters: [
      {
        type: "string",
        column: "environment",
        operator: "=",
        value: "production",
      },
      {
        type: "string",
        column: "name",
        operator: "=",
        value: "support-answer-audit-pass",
      },
    ],
    metrics: [{ measure: "value", aggregation: "avg" }],
  },
);
const failureReasons = chart(
  "failure-reasons",
  "Primary reason for each failed audit · count",
  "bar",
  {
    ...reportingWindow,
    view: "scores-categorical",
    filters: [
      {
        type: "string",
        column: "environment",
        operator: "=",
        value: "production",
      },
      {
        type: "string",
        column: "name",
        operator: "=",
        value: "support-answer-audit-failure",
      },
    ],
    dimensions: [{ field: "stringValue" }],
    timeDimension: null,
    metrics: [{ measure: "count", aggregation: "count" }],
  },
);
const answerLatency = chart(
  "daily-answer-latency",
  "Production answer latency · daily p95 (ms)",
  "line",
  {
    ...byDay,
    ...productionAnswers,
    metrics: [{ measure: "latency", aggregation: "p95" }],
  },
);
const generationCost = chart(
  "generation-cost",
  "Answer generation spend · daily total (USD)",
  "bar",
  {
    ...byDay,
    view: "observations",
    filters: [
      {
        type: "string",
        column: "environment",
        operator: "=",
        value: "production",
      },
      {
        type: "string",
        column: "name",
        operator: "=",
        value: "support-answer-generation",
      },
    ],
    metrics: [{ measure: "totalCost", aggregation: "sum" }],
  },
);

const headlineMetrics = [
  {
    ...answerVolume,
    id: "request-kpi",
    props: {
      title: "Production answer requests",
      query: { ...answerVolume.props.query, timeDimension: null },
      display: { kind: "big-number", format: { style: "decimal" } },
    },
  },
  {
    ...qualityScores,
    id: "quality-kpi",
    props: {
      title: "Audit pass rate",
      query: { ...qualityScores.props.query, timeDimension: null },
      display: {
        kind: "big-number",
        format: { style: "percent" },
        caption: "Share of sampled answers that passed",
      },
    },
  },
  {
    ...generationCost,
    id: "spend-kpi",
    props: {
      title: "Answer generation spend",
      query: { ...generationCost.props.query, timeDimension: null },
      display: {
        kind: "big-number",
        format: { style: "currency", currency: "USD" },
      },
    },
  },
] satisfies NotebookBlock[];

export const supportDashboard = {
  id: "northstar-support-dashboard",
  title: "Support assistant dashboard",
  layout: "tabs",
  width: "full",
  propertySchema: {
    version: 1,
    fields: [
      { id: "reportingPeriod", label: "Reporting period", type: "text" },
      { id: "timeZone", label: "Time zone", type: "text" },
      { id: "assistant", label: "Assistant", type: "text" },
      { id: "owner", label: "Owner", type: "text" },
    ],
  },
  publications: [
    {
      number: 1,
      publishedAt: new Date("2026-11-23T15:00:00Z"),
      documents: [
        {
          id: "main",
          title: "Weekly production review",
          properties: {
            reportingPeriod: "16–22 Nov 2026",
            timeZone: "UTC",
            assistant: "Web support assistant",
            owner: "Support Operations",
          },
          blocks: [
            text(
              "weekly-review",
              paragraph(
                "Traffic and quality were stable outside Wednesday’s policy lookup incident. Keep the current model and prompt in production; this week’s work is on lookup timeouts and stale policy citations.",
              ),
            ),
            row("weekly-kpis", ...headlineMetrics),
            row("weekly-trends", answerVolume, qualityScores),
            text(
              "weekly-actions",
              heading(2, "Decisions for next week"),
              bullets(
                paragraph(
                  strong("Platform · SUP-184"),
                  " — Keep the policy client rolled back until the cold-cache canary passes.",
                ),
                paragraph(
                  strong("Knowledge Ops · SUP-197"),
                  " — Reindex the current EEA returns articles and replay the failing answers.",
                ),
                paragraph(
                  strong("Support Ops · SUP-203"),
                  " — Verify order context survives a resumed chat before expanding human handoff.",
                ),
              ),
            ),
          ],
        },
        {
          id: "quality",
          title: "Answer quality and audit findings",
          blocks: [
            text(
              "quality-summary",
              paragraph(
                strong("92.3% passed"),
                " · 775 of 840 sampled answers. Reviewers audited 120 production answers per day against policy accuracy, correctness, and appropriate escalation.",
              ),
              paragraph(
                "Wednesday was the lowest day at 87.5%. The audit includes that day’s traffic, but the scores alone do not establish that the latency incident caused the quality dip.",
              ),
            ),
            qualityScores,
            failureReasons,
            text(
              "quality-priorities",
              heading(2, "Where to investigate next"),
              bullets(
                "Stale policy citations accounted for 26 of 65 failures; 11 used the outdated EEA returns article tracked in SUP-197.",
                "Missing handoff accounted for nine failures. SUP-203 covers the subset where the order ID was already present earlier in the chat.",
                "Reviewers assign one primary reason per failed answer. These counts describe the audit sample, not all production requests.",
              ),
            ),
          ],
        },
        {
          id: "latency-cost",
          title: "Latency and generation spend",
          blocks: [
            text(
              "performance-summary",
              paragraph(
                strong("2.81 s peak daily p95"),
                " · 18 Nov. The incident hour peaked at 4.8 s p95; the daily view smooths that spike.",
              ),
              paragraph(
                strong("1.49¢ per request"),
                " · $80.75 in metered generation spend divided by 5,430 answer requests. Excludes policy lookup infrastructure and human support.",
              ),
            ),
            row("performance-trends", answerLatency, generationCost),
            text(
              "performance-actions",
              heading(2, "What to watch"),
              bullets(
                "After rollback, daily p95 returned to 1.31 s on Thursday and finished the week at 1.20 s.",
                "Wednesday’s $12.90 was the highest daily spend, but lookup retries are not model calls. Compare generation calls per answer before attributing the increase to the incident.",
                "Track five-minute p95 against the 2.5 s monitor threshold during the next policy client canary. Use the daily series for trend review, not alerting.",
              ),
            ),
          ],
        },
      ],
    },
  ],
  chartRows: {
    "request-kpi": [{ count_count: 5430 }],
    "quality-kpi": [{ avg_value: 775 / 840 }],
    "spend-kpi": [{ sum_totalCost: 80.75 }],
    [answerVolume.id]: timeSeriesRows(
      reportingWindow.fromTimestamp,
      "day",
      "count_count",
      [780, 814, 806, 802, 791, 738, 699],
    ),
    [qualityScores.id]: timeSeriesRows(
      reportingWindow.fromTimestamp,
      "day",
      "avg_value",
      [111, 112, 105, 110, 113, 112, 112].map((passed) => passed / 120),
    ),
    [failureReasons.id]: [
      { stringValue: "Stale policy", count_count: 26 },
      { stringValue: "Wrong resolution", count_count: 18 },
      { stringValue: "Incomplete answer", count_count: 12 },
      { stringValue: "Missing handoff", count_count: 9 },
    ],
    [answerLatency.id]: timeSeriesRows(
      reportingWindow.fromTimestamp,
      "day",
      "p95_latency",
      [1280, 1230, 2810, 1310, 1240, 1190, 1200],
    ),
    [generationCost.id]: timeSeriesRows(
      reportingWindow.fromTimestamp,
      "day",
      "sum_totalCost",
      [11.7, 12.21, 12.9, 11.63, 11.47, 10.7, 10.14],
    ),
  },
} satisfies NotebookFixture;
