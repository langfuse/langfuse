import {
  bullets,
  chart,
  heading,
  incidentLatency,
  incidentLatencyRows,
  incidentWindow,
  type NotebookFixture,
  paragraph,
  row,
  strong,
  text,
  timeSeriesRows,
} from "./supportAssistantFixtures";

const retryChart = chart(
  "policy-lookup-retries",
  "Policy lookup retries · count per hour",
  "bar",
  {
    ...incidentWindow,
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
        value: "policy-lookup-retry",
      },
    ],
    dimensions: [],
    timeDimension: { granularity: "hour" },
    metrics: [{ measure: "count", aggregation: "count" }],
  },
);

const alertSummary = text(
  "alert-summary",
  paragraph(
    "At 09:20 UTC, the support latency monitor paged after p95 exceeded 2.5 s in two consecutive five-minute windows. The 09:00 UTC hour peaked at 4.8 s p95, compared with 1.22 s the preceding hour. We rolled back the policy lookup client at 09:58 UTC; the next hour was down to 1.46 s p95.",
  ),
  paragraph(
    strong("Customer impact"),
    " · 118 of 326 requests during the rollout exceeded the threshold, including 19 timed-out chats. Refund and returns answers were most affected; simple account questions remained within range.",
  ),
);

const timeline = text(
  "timeline",
  heading(2, "Timeline · UTC"),
  bullets(
    paragraph(
      strong("09:05"),
      " · Release 2.17.3 starts rolling out to production.",
    ),
    paragraph(
      strong("09:20"),
      " · The p95 monitor pages the platform on-call.",
    ),
    paragraph(
      strong("09:34"),
      " · On-call isolates the latency to policy lookup spans.",
    ),
    paragraph(
      strong("09:58"),
      " · Rollback completes. New requests use the previous lookup client.",
    ),
    paragraph(strong("10:20"), " · Monitor clears after two healthy windows."),
  ),
);

const closedInvestigation = [
  alertSummary,
  row("incident-metrics", incidentLatency, retryChart),
  timeline,
  text(
    "root-cause",
    heading(2, "Root cause"),
    paragraph(
      "Release 2.17.3 reset the timeout on every attempt instead of sharing one deadline across the lookup. For tenants with a cold policy cache, the assistant waited through two slow attempts and the backoff before it could answer or hand off.",
    ),
    heading(3, "How we ruled out the model"),
    paragraph(
      "Model generation spans stayed near their pre-deploy duration, including in traces whose end-to-end answers exceeded the monitor. Only policy lookup and its retry spans grew. Replaying those requests against the previous client stopped the chained waits without changing the model, prompt, or retrieval corpus.",
    ),
    { type: "horizontal_rule" },
    heading(2, "Recovery and prevention"),
    bullets(
      "Rollback verification: p95 was below 1.5 s in each full hour after the rollback. Lookup retries fell from 126 in the 09:00 UTC bucket to 11 at 10:00 UTC and 3 at 11:00 UTC.",
      "SUP-184 · Platform will enforce an 850 ms total lookup budget and add a cold-cache canary before redeploying the client.",
      "Support followed up with customers whose conversations timed out. No payment mutations or refunds were initiated by the failed lookups.",
    ),
  ),
];

const incidentDocument = {
  id: "main",
  title: "INC-042 · Support answer latency breached 2.5 s",
  properties: {
    status: "Resolved",
    incidentDate: "2026-11-18",
    environment: "Production",
    commander: "Maya Chen",
  },
} as const;

export const monitorInvestigation = {
  id: "northstar-latency-investigation",
  title: "Support latency monitor investigation",
  layout: "default",
  propertySchema: {
    version: 1,
    fields: [
      {
        id: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "Mitigated", color: "warning" },
          { value: "Resolved", color: "success" },
        ],
      },
      { id: "incidentDate", label: "Incident date", type: "date" },
      { id: "environment", label: "Environment", type: "text" },
      { id: "commander", label: "Incident commander", type: "text" },
    ],
  },
  publications: [
    {
      number: 2,
      publishedAt: new Date("2026-11-20T16:00:00Z"),
      documents: [{ ...incidentDocument, blocks: closedInvestigation }],
    },
    {
      number: 1,
      publishedAt: new Date("2026-11-18T11:10:00Z"),
      documents: [
        {
          ...incidentDocument,
          title: "INC-042 · Initial incident report",
          properties: { ...incidentDocument.properties, status: "Mitigated" },
          blocks: [
            text(
              "initial-report",
              paragraph(
                "The production monitor paged at 09:20 UTC. We rolled back release 2.17.3 and the alert cleared. Initial traces point to policy lookups; next we’ll compare the lookup deadline and retries across releases.",
              ),
            ),
            timeline,
          ],
        },
      ],
    },
  ],
  draft: [
    {
      ...incidentDocument,
      blocks: [
        ...closedInvestigation,
        text(
          "canary-update",
          heading(2, "Canary update · 23 Nov"),
          paragraph(
            "The new lookup deadline passed the cold-cache staging replay. Release approval is still pending a production canary with 30 minutes below the monitor threshold.",
          ),
        ),
      ],
    },
  ],
  chartRows: {
    [incidentLatency.id]: incidentLatencyRows,
    [retryChart.id]: timeSeriesRows(
      incidentWindow.fromTimestamp,
      "hour",
      "count_count",
      [2, 126, 11, 3, 2, 2, 1],
    ),
  },
} satisfies NotebookFixture;
