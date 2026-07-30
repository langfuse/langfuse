import { type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

import { renderFilterIcon } from "@/src/components/ItemBadge";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
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
  onExcludeObservation,
}:
  | {
      state: Extract<ObservationListRowsState, { type: "loading" | "empty" }>;
      onSelectTurn?: never;
      onExcludeObservation?: never;
    }
  | {
      state: Extract<ObservationListRowsState, { type: "loaded" }>;
      onSelectTurn: () => void;
      onExcludeObservation?: (name: string) => void;
    }) {
  if (state.type === "loading") {
    return (
      <div className="-mx-1 flex flex-col gap-1 px-1 py-2">
        <div className="bg-muted h-3 w-3/4 animate-pulse rounded-sm" />
        <div className="bg-muted h-3 w-1/2 animate-pulse rounded-sm" />
      </div>
    );
  }

  if (state.type === "empty") {
    return (
      <p className="text-muted-foreground -mx-1 px-1 py-2 text-xs">
        {state.hasFilters ? "No matching spans" : "No observations"}
      </p>
    );
  }

  return (
    <div className="mt-2 flex flex-col">
      {state.rows.map((observation) => (
        <div
          key={observation.id}
          className="hover:bg-foreground/10 -mr-2 -ml-1 flex items-center rounded-sm transition-colors duration-150"
        >
          <button
            type="button"
            onClick={onSelectTurn}
            className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1 text-left"
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
          {observation.name && onExcludeObservation ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-muted-foreground -my-1 -mr-0.5 h-8 w-8 shrink-0 hover:bg-transparent"
                  aria-label={`Actions for ${observation.name}`}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={0}>
                <DropdownMenuItem
                  onSelect={() =>
                    onExcludeObservation(observation.name as string)
                  }
                >
                  Exclude similar observations
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export type ObservationListRowsRenderer = (props: {
  traceId: string;
  search: string;
  onSelectTurn: () => void;
}) => ReactNode;
