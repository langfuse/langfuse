import { useEffect, useState } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
import { type TopicSetupStage } from "./topic-setup-flow";
import {
  type TopicPile,
  TopicPilesIllustration,
} from "./TopicPilesIllustration";

type TopicSetupProgressFacet = {
  key: string;
  name: string;
  complete: number;
  requested: number;
};

const PILE_SLOTS = [
  { name: "Group 1", slots: 9, color: "violet" },
  { name: "Group 2", slots: 6, color: "blue" },
  { name: "Group 3", slots: 4, color: "amber" },
] as const;

const TICK_MS = 260;

const STAGE_LABEL: Partial<Record<TopicSetupStage, string>> = {
  summarizing: "Summarizing traces",
  grouping: "Finding similar answers",
  naming: "Naming topics",
};

/** First analysis in progress: one illustration, one line of copy and one progress bar. */
export function TopicSetupProgressView({
  canRetry,
  facets,
  onViewDetails,
  onRetry,
  retrying,
  stage,
  waiting = false,
}: TopicSetupProgressViewProps) {
  const failed = stage === "failed";
  const animate = !failed && !waiting;
  const tick = usePileTick(animate);
  const requested = Math.max(0, ...facets.map((facet) => facet.requested));
  const complete = Math.min(
    requested,
    ...facets.map((facet) => facet.complete),
  );
  const summarizing = stage === "summarizing";
  const processed = summarizing ? complete : requested;
  const percent = requested === 0 ? 0 : (processed / requested) * 100;
  const copy = progressCopy(failed, waiting);
  const piles: TopicPile[] = PILE_SLOTS.map((pile, index) => ({
    ...pile,
    detail: "",
    filled: pileFill(pile.slots, index, tick),
  }));
  return (
    <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-6 overflow-y-auto px-4 pb-35">
      <TopicPilesIllustration piles={piles} bare />
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-3xl leading-tight font-bold tracking-tight text-balance">
          {copy.title}
        </h2>
        <p className="text-muted-foreground text-sm text-pretty">
          {failed && !canRetry ? NO_RETRY_DETAIL : copy.detail}
        </p>
      </div>
      {failed ? (
        <div className="flex items-center gap-2">
          {canRetry && onRetry && (
            <Button text="Retry" loading={retrying} onClick={onRetry} />
          )}
          {onViewDetails && (
            <Button
              text="See run details"
              variant="ghost"
              onClick={onViewDetails}
            />
          )}
        </div>
      ) : null}
      {!failed && !waiting && (
        <div className="flex w-90 max-w-full flex-col gap-2">
          <div
            role="progressbar"
            aria-label="Analysis progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            className="bg-muted h-1.5 overflow-hidden rounded-sm"
          >
            <div
              className="bg-foreground h-full rounded-sm transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="text-muted-foreground flex justify-between gap-2 text-xs">
            <span>{STAGE_LABEL[stage]}</span>
            {requested > 0 && (
              <span className="text-foreground font-mono">
                {processed.toLocaleString("en-US")} /{" "}
                {requested.toLocaleString("en-US")}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Animation tick for the piles; stays at 0 when animation is off or motion is reduced. */
function usePileTick(enabled: boolean) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const interval = window.setInterval(
      () => setTick((current) => current + 1),
      TICK_MS,
    );
    return () => window.clearInterval(interval);
  }, [enabled]);
  return enabled ? tick : 0;
}

/** Piles fill and drain out of step; at tick 0 they sit near half full. */
function pileFill(slots: number, pileIndex: number, tick: number) {
  if (tick === 0) return Math.max(1, Math.round(slots / 2));
  return Math.max(
    1,
    Math.round(slots * (0.5 + 0.5 * Math.sin(tick * 0.12 + pileIndex * 1.7))),
  );
}

const NO_RETRY_DETAIL =
  "Topics could not start. Use Regenerate topics in the menu.";

function progressCopy(failed: boolean, waiting: boolean) {
  if (failed)
    return {
      title: "The first analysis did not finish",
      detail: "Retry picks up where it stopped.",
    };
  if (waiting)
    return {
      title: "Waiting for new traces",
      detail:
        "Automatic processing is on. Topics appear once new traces are summarized.",
    };
  return {
    title: "Analyzing your traces",
    detail:
      "Runs in the background. Your topics will be here when you're back.",
  };
}

type TopicSetupProgressViewProps = {
  facets: TopicSetupProgressFacet[];
  stage: TopicSetupStage;
  retrying: boolean;
  canRetry: boolean;
  /** Opens the failed run in History. */
  onViewDetails?: () => void;
  onRetry?: () => void;
  /** Automatic processing is on but no trace has been summarized yet. */
  waiting?: boolean;
};
