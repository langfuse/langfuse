import { useTraceTopicsForRows } from "./useTracingTopics";

type TraceTopicsCellProps = {
  projectId: string;
  rows: { traceId?: string | null; startTime: Date }[];
  traceId: string | undefined;
  facet: string;
};

/** One facet's current topics; every Topics column shares one query per page. */
export function TraceTopicsCell({
  projectId,
  rows,
  traceId,
  facet,
}: TraceTopicsCellProps) {
  const topics = useTraceTopicsForRows(projectId, rows);
  // Several rules can each assign the facet a topic.
  const topic = topics?.[traceId ?? ""]
    ?.flatMap((item) =>
      item.facet === facet && item.topic !== null ? [item.topic] : [],
    )
    .join(", ");
  return (
    <span className="ph-no-capture block truncate" title={topic}>
      {topic}
    </span>
  );
}
