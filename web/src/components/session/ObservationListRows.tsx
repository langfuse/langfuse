import { type ReactNode } from "react";

import { renderFilterIcon } from "@/src/components/ItemBadge";
import { formatIntervalSeconds } from "@/src/utils/dates";

type ObservationListRow = {
  id: string;
  name: string | null;
  type: string;
  latency: number | null;
};

type ObservationListRowsState =
  | { type: "loading" }
  | { type: "empty"; hasFilters: boolean }
  | { type: "loaded"; rows: ObservationListRow[] };

export function ObservationListRows({
  state,
  onSelectTurn,
}:
  | {
      state: Extract<ObservationListRowsState, { type: "loading" | "empty" }>;
      onSelectTurn?: never;
    }
  | {
      state: Extract<ObservationListRowsState, { type: "loaded" }>;
      onSelectTurn: () => void;
    }) {
  if (state.type === "loading") {
    return (
      <div className="flex flex-col gap-1 py-2 pl-4">
        <div className="bg-muted h-3 w-3/4 animate-pulse rounded-sm" />
        <div className="bg-muted h-3 w-1/2 animate-pulse rounded-sm" />
      </div>
    );
  }

  if (state.type === "empty") {
    return (
      <p className="text-muted-foreground py-2 pl-4 text-xs">
        {state.hasFilters ? "No matching spans" : "No observations"}
      </p>
    );
  }

  return (
    <div className="mt-2 ml-4 flex flex-col">
      {state.rows.map((observation) => (
        <button
          key={observation.id}
          type="button"
          onClick={onSelectTurn}
          className="hover:bg-foreground/10 -mr-2 flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left transition-colors duration-150"
        >
          {renderFilterIcon(observation.type)}
          <span
            className="text-muted-foreground min-w-0 flex-1 truncate text-[13px]"
            title={observation.name ?? observation.id}
          >
            {observation.name ?? observation.id}
          </span>
          {observation.latency !== null && observation.type !== "EVENT" ? (
            <span className="text-muted-foreground shrink-0 font-mono text-[11px]">
              {formatIntervalSeconds(observation.latency)}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export type ObservationListRowsRenderer = (props: {
  traceId: string;
  search: string;
  onSelectTurn: () => void;
}) => ReactNode;
