import {
  bullets,
  chart,
  heading,
  type NotebookFixture,
  paragraph,
  text,
  timeSeriesRows,
} from "./supportAssistantFixtures";

export const promptExperimentsTableLayout = {
  id: "prompt-experiments",
  title: "Prompt experiment results",
  layout: "inbox",
  propertySchema: {
    version: 1,
    fields: [
      { id: "passRate", label: "Pass rate (%)", type: "number" },
      { id: "latency", label: "p95 latency (s)", type: "number" },
      { id: "cost", label: "Cost / 1K (USD)", type: "number" },
      { id: "evaluated", label: "Evaluated", type: "number" },
    ],
  },
  publications: [
    {
      number: 1,
      publishedAt: new Date("2026-11-23T15:00:00Z"),
      documents: [
        {
          id: "main",
          title: "Shorter instructions",
          properties: {
            passRate: 94.1,
            latency: 1.2,
            cost: 8.2,
            evaluated: 600,
          },
          blocks: [
            text(
              "report",
              heading(3, "What changed"),
              paragraph(
                "Removed repeated policy reminders and kept the refund eligibility decision tree.",
              ),
              heading(3, "Where it failed"),
              bullets(
                "Some replies omit the return window for orders with mixed eligibility.",
              ),
              heading(3, "Recommendation"),
              paragraph(
                "Canary this variant: it improves pass rate while reducing latency and cost.",
              ),
            ),
          ],
        },
        {
          id: "few-shot-examples",
          title: "Few-shot examples",
          properties: {
            passRate: 93.8,
            latency: 1.6,
            cost: 10.9,
            evaluated: 600,
          },
          blocks: [
            text(
              "report",
              heading(3, "What changed"),
              paragraph(
                "Added three examples covering refunds, exchanges, and missing orders.",
              ),
              heading(3, "Where it failed"),
              bullets(
                "Some replies copied phrasing from an example that did not fit the customer's situation.",
              ),
              heading(3, "Recommendation"),
              paragraph(
                "Replace the examples with more varied cases before retesting.",
              ),
            ),
          ],
        },
        {
          id: "policy-first",
          title: "Policy-first answers",
          properties: {
            passRate: 94.7,
            latency: 1.5,
            cost: 9.4,
            evaluated: 600,
          },
          blocks: [
            text(
              "report",
              heading(3, "What changed"),
              paragraph(
                "Asked the assistant to identify the applicable policy before drafting a reply.",
              ),
              heading(3, "Where it failed"),
              bullets(
                "Replies sometimes quoted policy before answering a simple question.",
              ),
              heading(3, "Recommendation"),
              paragraph(
                "Keep the policy check but lead the reply with the answer.",
              ),
            ),
          ],
        },
        {
          id: "compact-retrieval",
          title: "Compact retrieval",
          properties: {
            passRate: 91.6,
            latency: 1.0,
            cost: 7.1,
            evaluated: 600,
          },
          blocks: [
            text(
              "report",
              heading(3, "What changed"),
              paragraph(
                "Limited retrieval to the two highest-ranked policy snippets.",
              ),
              heading(3, "Where it failed"),
              bullets(
                "Regional exceptions were often missing from the retrieved context.",
              ),
              heading(3, "Recommendation"),
              paragraph(
                "Avoid using this variant for requests that depend on regional policy.",
              ),
            ),
          ],
        },
        {
          id: "clarify-first",
          title: "Clarify missing details",
          properties: {
            passRate: 93.2,
            latency: 1.3,
            cost: 8.8,
            evaluated: 600,
          },
          blocks: [
            text(
              "report",
              heading(3, "What changed"),
              paragraph(
                "Asked one clarifying question when a missing detail could change eligibility.",
              ),
              heading(3, "Where it failed"),
              bullets(
                "The assistant sometimes asked for details already available in the order record.",
              ),
              heading(3, "Recommendation"),
              paragraph(
                "Check the order record before asking the customer for more information.",
              ),
            ),
          ],
        },
        {
          id: "baseline",
          title: "Baseline",
          properties: {
            passRate: 92.3,
            latency: 1.4,
            cost: 9.8,
            evaluated: 600,
          },
          blocks: [
            text(
              "report",
              heading(3, "What changed"),
              paragraph(
                "Used the current production prompt and retrieval settings unchanged.",
              ),
              heading(3, "Where it failed"),
              bullets(
                "The assistant sometimes asks for an order ID already present in the conversation.",
              ),
              heading(3, "Recommendation"),
              paragraph("Keep this variant as the canary control."),
            ),
          ],
        },
        {
          id: "extra-context",
          title: "Extra retrieval context",
          properties: {
            passRate: 95.2,
            latency: 2.1,
            cost: 13.4,
            evaluated: 600,
          },
          blocks: [
            text(
              "report",
              heading(3, "What changed"),
              paragraph(
                "Increased the retrieved policy snippets from three to six.",
              ),
              heading(3, "Where it failed"),
              bullets(
                "Some replies cite an older policy when retrieval surfaces multiple revisions.",
              ),
              heading(3, "Recommendation"),
              paragraph(
                "Consider this variant for complex cases where the quality gain justifies the added latency.",
              ),
            ),
          ],
        },
      ],
    },
  ],
  chartRows: {},
} satisfies NotebookFixture;

const experiments = promptExperimentsTableLayout.publications[0].documents;
const window = {
  fromTimestamp: "2026-11-23T09:00:00Z",
  toTimestamp: "2026-11-23T15:00:00Z",
};
const metrics = [
  {
    id: "latency",
    title: "p95 latency (ms)",
    measure: "latency",
    aggregation: "p95",
    field: "p95_latency",
  },
  {
    id: "cost",
    title: "Total cost (USD)",
    measure: "totalCost",
    aggregation: "sum",
    field: "sum_totalCost",
  },
] as const;

export const promptExperiments = {
  id: "prompt-experiments",
  title: "Prompt experiment results",
  layout: "default",
  variables: [
    { id: "run", name: "Run", type: "string" },
    {
      id: "date-range",
      name: "Date range",
      type: "dateRange",
      defaultValue: {
        start: "2026-11-23T00:00:00Z",
        end: "2026-11-24T00:00:00Z",
      },
    },
  ],
  bindings: [
    {
      kind: "write",
      variableId: "run",
      from: {
        documentId: "main",
        elementId: "experiments",
        portId: "selection",
      },
    },
    ...metrics.map(({ id }) => ({
      kind: "read" as const,
      variableId: "run",
      to: { documentId: "main", elementId: id, portId: "filter" },
    })),
    ...metrics.map(({ id }) => ({
      kind: "read" as const,
      variableId: "date-range",
      to: { documentId: "main", elementId: id, portId: "timeRange" },
    })),
  ],
  publications: [
    {
      number: 1,
      publishedAt: new Date(window.toTimestamp),
      documents: [
        {
          id: "main",
          title: "Prompt experiment results",
          blocks: [
            {
              id: "experiments",
              schema: "table@1",
              props: {
                columns: [
                  "Experiment",
                  "Pass rate (%)",
                  "p95 latency (s)",
                  "Cost / 1K (USD)",
                  "Evaluated",
                ],
                rows: experiments.map(({ id, title, properties }) => ({
                  id,
                  cells: [
                    title,
                    properties.passRate,
                    properties.latency,
                    properties.cost,
                    properties.evaluated,
                  ],
                })),
              },
            },
            ...metrics.map(({ id, title, measure, aggregation }) => {
              const block = chart(id, title, "line", {
                ...window,
                view: "observations",
                metrics: [{ measure, aggregation }],
                dimensions: [],
                filters: [
                  {
                    type: "string",
                    column: "name",
                    operator: "=",
                    value: "unselected",
                  },
                ],
                timeDimension: { granularity: "hour" },
              });
              return { ...block, props: { ...block.props, bindFilter: 0 } };
            }),
          ],
        },
      ],
    },
  ],
  chartRows: {},
  chartRowsBySelection: Object.fromEntries(
    experiments.map(({ id, properties }) => [
      id,
      {
        latency: timeSeriesRows(
          window.fromTimestamp,
          "hour",
          metrics[0].field,
          [0.9, 1.04, 0.98, 1.12, 0.92, 1].map((scale) =>
            Math.round(properties.latency * 1000 * scale),
          ),
        ),
        cost: timeSeriesRows(
          window.fromTimestamp,
          "hour",
          metrics[1].field,
          [0.08, 0.11, 0.09, 0.12, 0.1, 0.1].map((scale) =>
            Number((properties.cost * scale).toFixed(2)),
          ),
        ),
      },
    ]),
  ),
} satisfies NotebookFixture;
