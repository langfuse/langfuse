import { type ReactNode } from "react";

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
      <div className="flex flex-col gap-1 px-3 py-2">
        <div className="bg-muted h-3 w-3/4 animate-pulse rounded-sm" />
        <div className="bg-muted h-3 w-1/2 animate-pulse rounded-sm" />
      </div>
    );
  }

  if (state.type === "empty") {
    return (
      <p className="text-muted-foreground px-3 py-2 text-xs">
        {state.hasFilters ? "No matching spans" : "No observations"}
      </p>
    );
  }

  return (
    <div>
      {state.rows.map((observation) => (
        <button
          key={observation.id}
          type="button"
          onClick={onSelectTurn}
          className="hover:bg-muted/40 flex w-full items-center gap-2 border-t px-2.5 py-1.5 text-left"
        >
          <span className="bg-muted/40 text-muted-foreground min-w-[46px] shrink-0 rounded-sm border px-1 py-px text-center font-mono text-[8.5px] font-bold tracking-wide uppercase">
            {observation.type === "GENERATION" ? "GEN" : observation.type}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-xs"
            title={observation.name ?? observation.id}
          >
            {observation.name ?? observation.id}
          </span>
          {observation.latency !== null && observation.type !== "EVENT" ? (
            <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
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
