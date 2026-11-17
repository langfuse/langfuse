import {
  PaginationBar,
  type PaginationBarState,
} from "@/src/components/design-system/PaginationBar/PaginationBar";
import { AGENT_LIMITS } from "@langfuse/shared/agents";

export function AgentPagination({
  totalCount,
  state,
  onChange,
  pageSizeOptions,
}: {
  totalCount: number | null;
  state: PaginationBarState;
  onChange: (state: PaginationBarState) => void;
  pageSizeOptions?: number[];
}) {
  const limit = (AGENT_LIMITS.maxPage + 1) * state.pageSize;
  const boundedCount = totalCount === null ? null : Math.min(totalCount, limit);
  return (
    <div className="shrink-0">
      {totalCount !== null && totalCount > limit && (
        <p className="text-muted-foreground px-4 py-2 text-xs">
          {totalCount.toLocaleString("en-US")} results. You can browse the first{" "}
          {limit.toLocaleString("en-US")}. Narrow the time range or environment
          to see the rest.
        </p>
      )}
      <PaginationBar
        mode="offset"
        totalCount={boundedCount}
        state={state}
        pageSizeOptions={pageSizeOptions ?? [state.pageSize]}
        onChange={onChange}
      />
    </div>
  );
}
