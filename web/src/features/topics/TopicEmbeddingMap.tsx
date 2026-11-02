import { Alert } from "@/src/components/design-system/Alert/Alert";
import { type RouterOutputs } from "@/src/utils/api";
import { EmbeddingMapView } from "./EmbeddingMapView";
import { TopicMapLoading } from "./TopicMapLoading";

export function TopicEmbeddingMap({
  query,
  topics,
  selectedTopic,
  onSelectTopic,
  onSelectTrace,
  selectedTraceId,
  matchingTraceIds,
  fillContainer = false,
  previewOnSelect = false,
}: TopicEmbeddingMapProps) {
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
  if (!query.data) return <TopicMapLoading fillContainer={fillContainer} />;
  if (query.data.status !== "ready")
    return (
      <p className="text-muted-foreground rounded-lg border p-4 text-sm">
        {query.data.reason ?? "This run has no saved embedding projection."}
      </p>
    );
  return (
    <EmbeddingMapView
      data={query.data}
      topics={topics}
      selectedTopic={selectedTopic}
      onSelectTopic={onSelectTopic}
      onSelectTrace={onSelectTrace}
      selectedTraceId={selectedTraceId}
      matchingTraceIds={matchingTraceIds}
      fillContainer={fillContainer}
      previewOnSelect={previewOnSelect}
    />
  );
}

type TopicEmbeddingMapProps = {
  query: {
    data?: RouterOutputs["topics"]["map"];
    error: { message: string } | null;
  };
  topics: Topic[];
  selectedTopic: string | null;
  onSelectTopic: (id: string | null) => void;
  onSelectTrace: (traceId: string | null) => void;
  selectedTraceId: string | null;
  matchingTraceIds?: ReadonlySet<string>;
  fillContainer?: boolean;
  previewOnSelect?: boolean;
};

type Topic = Pick<
  RouterOutputs["topics"]["currentResults"]["facets"][number]["topics"][number],
  "id" | "name"
> & { description?: string };
