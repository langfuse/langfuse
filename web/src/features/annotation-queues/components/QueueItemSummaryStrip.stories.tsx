import preview from "../../../../.storybook/preview";
import { type QueueItemScore } from "@/src/features/annotation-queues/lib/queueItemScores";
import { QueueItemSummaryStrip } from "./QueueItemSummaryStrip";
import { parseQueueTraceColumns } from "@/src/features/annotation-queues/lib/queueTraceColumns";

const configs = [
  {
    id: "quality",
    name: "quality",
    categories: [
      { label: "high", value: 0 },
      { label: "medium", value: 1 },
      { label: "low", value: 2 },
    ],
  },
  {
    id: "outcome",
    name: "outcome",
    categories: [
      { label: "resolved", value: 0 },
      { label: "unresolved", value: 1 },
      { label: "escalated", value: 2 },
    ],
  },
  { id: "duration", name: "duration_sec", categories: null },
  { id: "notes", name: "notes", categories: null },
];

const scores: QueueItemScore[] = [
  {
    id: "s1",
    name: "quality",
    source: "ANNOTATION",
    configId: "quality",
    dataType: "CATEGORICAL",
    value: 0,
    stringValue: "high",
    timestamp: new Date("2026-10-01T09:31:00Z"),
  },
  {
    id: "s2",
    name: "outcome",
    source: "ANNOTATION",
    configId: "outcome",
    dataType: "CATEGORICAL",
    value: 1,
    stringValue: "unresolved",
    timestamp: new Date("2026-10-01T09:31:00Z"),
  },
  {
    id: "s3",
    name: "duration_sec",
    source: "ANNOTATION",
    configId: "duration",
    dataType: "NUMERIC",
    value: 184.5,
    timestamp: new Date("2026-10-01T09:31:00Z"),
  },
  {
    id: "s4",
    name: "notes",
    source: "ANNOTATION",
    configId: "notes",
    dataType: "TEXT",
    value: 0,
    stringValue: "Correct answer, but too long for a chat reply.",
    timestamp: new Date("2026-10-01T09:31:00Z"),
  },
];

const meta = preview.meta({
  component: QueueItemSummaryStrip,
});

export const Default = meta.story({
  args: {
    userId: "+49 30 1234567",
    timestamp: new Date("2026-10-01T09:30:00Z"),
    tags: ["support", "priority"],
    scores,
    configs,
  },
});

export const NotYetAnnotated = meta.story({
  args: {
    userId: "+49 30 1234567",
    timestamp: new Date("2026-10-01T09:30:00Z"),
    tags: [],
    scores: [],
    configs,
  },
});

const traceColumns = parseQueueTraceColumns([
  { source: "trace", key: "userId", label: "Phone", format: "phone" },
  {
    source: "metadata",
    key: "location_name",
    label: "Location",
    format: "text",
  },
  {
    source: "metadata",
    key: "duration_seconds",
    label: "Duration",
    format: "duration",
  },
  {
    source: "metadata",
    key: "report_url",
    label: "Report",
    format: "link",
  },
  {
    source: "metadata",
    key: "workflow_type",
    label: "Workflow",
    format: "badge",
  },
]);

export const WithTraceColumns = meta.story({
  args: {
    userId: "+12025550123",
    timestamp: new Date("2026-10-21T22:19:00Z"),
    tags: ["region:eu-west"],
    traceFields: traceColumns.map((column) => ({
      column,
      value:
        {
          Phone: "+12025550123",
          Location: "Berlin office",
          Duration: "135",
          Report: "https://example.com/reports/1.pdf",
          Workflow: "support",
        }[column.label] ?? null,
    })),
    scores,
    configs,
  },
});
