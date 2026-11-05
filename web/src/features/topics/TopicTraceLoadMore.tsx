import { type UIEvent } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
import { type TopicTracesResult } from "./facet-topics";

const LOAD_MORE_THRESHOLD_PX = 400;

/** Scroll handler that fetches the next page as a list nears its end. */
export function loadMoreNearEnd(traces: TopicTracesResult) {
  return (event: UIEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (
      target.scrollTop + target.clientHeight >=
      target.scrollHeight - LOAD_MORE_THRESHOLD_PX
    )
      traces.loadMore();
  };
}

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
