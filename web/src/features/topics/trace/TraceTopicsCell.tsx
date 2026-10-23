import { TraceTopicChips } from "./TraceTopicChips";
import { useTraceTopicsForRows } from "./useTracingTopics";

type TraceTopicsCellProps = {
  projectId: string;
  rows: { traceId?: string | null; startTime: Date }[];
  traceId: string | undefined;
};

/** Topics column cell: cells only render while the column is shown, and they share one query per page. */
export function TraceTopicsCell({
  projectId,
  rows,
  traceId,
}: TraceTopicsCellProps) {
  const topics = useTraceTopicsForRows(projectId, rows);
  return <TraceTopicChips topics={topics?.[traceId ?? ""] ?? []} />;
}
