import type { TopicTimeRange } from "@langfuse/shared/topics";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { type ReactNode } from "react";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { api, type RouterOutputs } from "@/src/utils/api";
import { EmbeddingMapView } from "./EmbeddingMapView";

type Topic = Pick<
  RouterOutputs["topics"]["currentResults"][number]["topics"][number],
  "id" | "name"
>;

export function TopicEmbeddingMap({
  projectId,
  runId,
  timeRange,
  topics,
  selectedTopic,
  onSelectTopic,
  headerActions,
  headerStats,
  onSelectTrace,
  selectedTraceId,
}: {
  projectId: string;
  runId: string;
  timeRange: TopicTimeRange;
  topics: Topic[];
  selectedTopic: string | null;
  onSelectTopic: (id: string | null) => void;
  headerActions?: ReactNode;
  headerStats?: ReactNode;
  onSelectTrace: (traceId: string | null) => void;
  selectedTraceId: string | null;
}) {
  const { openPeek } = usePeekNavigation({
    tableName: "topics-traces",
    isV4: false,
    queryParams: ["observation", "display", "timestamp", "traceId"],
  });
  const query = api.topics.map.useQuery({
    projectId,
    runId,
    timeRange,
  });
  if (query.error)
    return (
      <Alert variant="destructive" size="sm">
        <Alert.Description>
          <p className="break-words">
            Map could not load: {query.error.message}
          </p>
        </Alert.Description>
      </Alert>
    );
  if (!query.data)
    return (
      <div className="bg-muted/20 flex h-72 items-center justify-center rounded-lg border text-sm">
        Loading embedding map…
      </div>
    );
  if (query.data.status !== "ready")
    return (
      <p className="text-muted-foreground rounded-lg border p-4 text-sm">
        {query.data.reason ?? "This run has no saved embedding projection."}
      </p>
    );
  return (
    <EmbeddingMapView
      key={runId}
      projectId={projectId}
      onOpenTrace={openPeek}
      data={query.data}
      topics={topics}
      selectedTopic={selectedTopic}
      onSelectTopic={onSelectTopic}
      headerActions={headerActions}
      headerStats={headerStats}
      onSelectTrace={onSelectTrace}
      selectedTraceId={selectedTraceId}
    />
  );
}
