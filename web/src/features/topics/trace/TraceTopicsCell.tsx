import { useTraceTopicsForRows } from "./useTracingTopics";

type TraceTopicsCellProps = {
  projectId: string;
  rows: { traceId?: string | null; startTime: Date }[];
  traceId: string | undefined;
  facet: string;
};

/** One facet's current topic; every Topics column shares one query per page. */
export function TraceTopicsCell({
  projectId,
  rows,
  traceId,
  facet,
}: TraceTopicsCellProps) {
  const topics = useTraceTopicsForRows(projectId, rows);
  const topic = topics?.[traceId ?? ""]?.find(
    (item) => item.facet === facet,
  )?.topic;
  return (
    <span className="block truncate" title={topic}>
      {topic}
    </span>
  );
}
