import { type ReactNode } from "react";

import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { BreakdownTooltip } from "@/src/features/traces/components/BreakdownTooltip";
import { type LongestObservation } from "@/src/features/traces/fns/longestObservations";
import { formatIntervalSeconds } from "@/src/utils/dates";

/** One decimal under 10% so three similar rows still read apart. */
function formatDurationShare(share: number) {
  if (share >= 10) return `${Math.round(share)}%`;
  if (share < 0.1) return "<0.1%";
  return `${share.toFixed(1)}%`;
}

/**
 * The trace duration's breakdown: the longest leaf observations with their
 * share of the trace. Clicking a row selects that observation.
 */
export function LongestObservationsTooltip({
  observations,
  traceDurationMs,
  onSelect,
  children,
}: {
  observations: LongestObservation[];
  traceDurationMs: number;
  onSelect: (observationId: string) => void;
  children: ReactNode;
}) {
  return (
    <BreakdownTooltip.Shell trigger={children} shares>
      {(close) => {
        const select = (id: string) => {
          onSelect(id);
          close();
        };
        return (
          <>
            <div className="col-span-full flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-bold">Longest observations</span>
            </div>
            <div className="col-span-full grid min-w-0 grid-cols-subgrid gap-y-1">
              {observations.map((observation) => {
                const share = (observation.durationMs / traceDurationMs) * 100;
                return (
                  <BreakdownTooltip.Row
                    key={observation.id}
                    label={
                      <TextLink
                        path={`?observation=${encodeURIComponent(observation.id)}`}
                        value={observation.name}
                        weight="normal"
                        size="sm"
                        onClick={() => select(observation.id)}
                      />
                    }
                    title={observation.name}
                    value={formatIntervalSeconds(observation.durationMs / 1000)}
                    variant="item"
                    share={share}
                    shareLabel={formatDurationShare(share)}
                    showShares
                    onClick={() => select(observation.id)}
                  />
                );
              })}
            </div>
            <BreakdownTooltip.Row
              label="Trace duration"
              value={formatIntervalSeconds(traceDurationMs / 1000)}
              variant="total"
              showShares
            />
          </>
        );
      }}
    </BreakdownTooltip.Shell>
  );
}
