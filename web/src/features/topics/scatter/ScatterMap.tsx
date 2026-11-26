import { Banner } from "@/src/components/design-system/Banner/Banner";
import { type RouterOutputs } from "@/src/utils/api";
import { TopicMapExplorer } from "./TopicMapExplorer";
import { ScatterMapLoading } from "./ScatterMapLoading";

/** The Scatter view's map, with its error, loading and no-projection states. */
export function ScatterMap({
  query,
  topics,
  selectedTopic,
  pickedTopic = null,
  onSelectTopic,
  onSelectTrace,
  selectedTraceId,
  matchingTraceIds,
  fillContainer = false,
  previewOnSelect = false,
  pinSelection = false,
}: ScatterMapProps) {
  if (query.error)
    return (
      <Banner variant="error">
        <p className="break-words">Map could not load: {query.error.message}</p>
      </Banner>
    );
  if (!query.data) return <ScatterMapLoading fillContainer={fillContainer} />;
  if (query.data.status !== "ready")
    return (
      <Banner>
        {query.data.reason ?? "This map has no saved embedding projection."}
      </Banner>
    );
  return (
    <TopicMapExplorer
      data={query.data}
      topics={topics}
      selectedTopic={selectedTopic}
      pickedTopic={pickedTopic}
      onSelectTopic={onSelectTopic}
      onSelectTrace={onSelectTrace}
      selectedTraceId={selectedTraceId}
      matchingTraceIds={matchingTraceIds}
      fillContainer={fillContainer}
      previewOnSelect={previewOnSelect}
      pinSelection={pinSelection}
    />
  );
}

type ScatterMapProps = {
  query: {
    data?: RouterOutputs["topics"]["map"];
    error: { message: string } | null;
  };
  topics: Topic[];
  selectedTopic: string | null;
  pickedTopic?: string | null;
  onSelectTopic: (id: string | null) => void;
  onSelectTrace: (traceId: string | null) => void;
  selectedTraceId: string | null;
  matchingTraceIds?: ReadonlySet<string>;
  fillContainer?: boolean;
  previewOnSelect?: boolean;
  /** Keeps the selected trace's summary card open, e.g. while its peek shows. */
  pinSelection?: boolean;
};

type Topic = Pick<
  RouterOutputs["topics"]["currentResults"]["facets"][number]["topics"][number],
  "id" | "name"
> & { description?: string };
