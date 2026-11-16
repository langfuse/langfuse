import { Button } from "@/src/components/design-system/Button/Button";
import { type TopicTracesResult } from "./facet-topics";

/** Short server pages cannot scroll, so more results stay one click away. */
export function TopicTraceLoadMore({ traces }: { traces: TopicTracesResult }) {
  return (
    <div className="flex shrink-0 justify-center border-t p-2">
      <Button
        text="Load more"
        variant="ghost"
        size="sm"
        loading={traces.isLoadingMore}
        onClick={traces.loadMore}
      />
    </div>
  );
}
