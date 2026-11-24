import {
  type NotebookBlock,
  type NotebookDocumentWidth,
  type NotebookLayout,
  type NotebookPropertySchema,
  type NotebookPropertyValues,
  type NotebookTextBlockNode,
} from "@/src/features/notebooks/schema";

type ChartBlock = Extract<NotebookBlock, { schema: "chart@1" }>;
type ChartQuery = ChartBlock["props"]["query"];
type ChartRow = Record<string, number | string>;
type Paragraph = Extract<NotebookTextBlockNode, { type: "paragraph" }>;
type Inline = NonNullable<Paragraph["content"]>[number];

type FixtureDocument = {
  id: string;
  title: string;
  blocks: NotebookBlock[];
  width?: NotebookDocumentWidth;
  properties?: NotebookPropertyValues;
};
type FixtureDocuments = [
  FixtureDocument & { id: "main" },
  ...FixtureDocument[],
];
type Publication = {
  number: number;
  publishedAt: Date;
  documents: FixtureDocuments;
};

export type NotebookFixture = {
  id: string;
  title: string;
  layout: NotebookLayout["kind"];
  propertySchema?: NotebookPropertySchema;
  publications: [Publication, ...Publication[]];
  draft?: FixtureDocuments;
  chartRows: Record<string, ChartRow[]>;
};

export function text(id: string, ...content: NotebookTextBlockNode[]) {
  return { id, schema: "text@1", props: {}, content } satisfies NotebookBlock;
}

export function heading(
  level: 2 | 3,
  value: string,
): Extract<NotebookTextBlockNode, { type: "heading" }> {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text: value }],
  };
}

export function paragraph(...content: (string | Inline)[]): Paragraph {
  return {
    type: "paragraph",
    content: content.map((part) =>
      typeof part === "string" ? { type: "text", text: part } : part,
    ),
  };
}

export function strong(value: string): Inline {
  return { type: "text", text: value, marks: [{ type: "strong" }] };
}

export function bullets(
  ...items: (string | Paragraph)[]
): Extract<NotebookTextBlockNode, { type: "bullet_list" }> {
  return {
    type: "bullet_list",
    content: items.map((item) => ({
      type: "list_item",
      content: [typeof item === "string" ? paragraph(item) : item],
    })),
  };
}

export function row(id: string, ...children: NotebookBlock[]) {
  return { id, schema: "row@1", props: { children } } satisfies NotebookBlock;
}

export function chart(
  id: string,
  title: string,
  kind: Exclude<ChartBlock["props"]["display"]["kind"], "big-number">,
  query: Pick<
    ChartQuery,
    | "view"
    | "metrics"
    | "filters"
    | "dimensions"
    | "timeDimension"
    | "fromTimestamp"
    | "toTimestamp"
  >,
): ChartBlock {
  return {
    id,
    schema: "chart@1",
    props: {
      title,
      display: { kind },
      query: { ...query, schema: "metrics@2", orderBy: null },
    },
  };
}

export function timeSeriesRows(
  fromTimestamp: string,
  interval: "hour" | "day",
  metricField: string,
  values: number[],
): ChartRow[] {
  const start = Date.parse(fromTimestamp);
  const hourInMs = 60 * 60 * 1_000;
  const step = interval === "hour" ? hourInMs : 24 * hourInMs;
  return values.map((value, index) => ({
    time_dimension: new Date(start + index * step).toISOString(),
    [metricField]: value,
  }));
}

export const productionAnswers = {
  view: "observations",
  filters: [
    {
      type: "string",
      column: "environment",
      operator: "=",
      value: "production",
    },
    { type: "string", column: "name", operator: "=", value: "support-answer" },
  ],
} satisfies Pick<ChartQuery, "view" | "filters">;

export const incidentWindow = {
  fromTimestamp: "2026-11-18T08:00:00Z",
  toTimestamp: "2026-11-18T15:00:00Z",
};

export const incidentLatency = chart(
  "incident-latency",
  "Production answer latency · hourly p95 (ms)",
  "line",
  {
    ...incidentWindow,
    ...productionAnswers,
    dimensions: [],
    timeDimension: { granularity: "hour" },
    metrics: [{ measure: "latency", aggregation: "p95" }],
  },
);

export const incidentLatencyRows = timeSeriesRows(
  incidentWindow.fromTimestamp,
  "hour",
  "p95_latency",
  [1220, 4800, 1460, 1280, 1210, 1150, 1190],
);
