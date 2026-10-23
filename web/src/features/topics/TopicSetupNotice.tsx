/* eslint-disable @typescript-eslint/no-use-before-define */
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { type TopicSetupNoticeState } from "./TopicModelSettings";

type TopicSetupNoticeProps = {
  notice: TopicSetupNoticeState;
  canWrite: boolean;
  canConfigure: boolean;
  onStart: () => void;
  // Set when analysis is already running, so setup cannot start a second backfill.
  startBlockedReason?: string | null;
  onKeepOff: () => void;
  onTurnBackOn: () => void;
  showOnboarding?: boolean;
};

/** Guides projects to their first summaries and surfaces paused processing. */
export function TopicSetupNotice({
  notice,
  canWrite,
  canConfigure,
  onStart,
  startBlockedReason = null,
  onKeepOff,
  onTurnBackOn,
  showOnboarding = notice.status?.kind === "setup",
}: TopicSetupNoticeProps) {
  const { status } = notice;
  return (
    <>
      {status?.kind === "paused" ? (
        <Alert variant="warning">
          <Alert.Title>Automatic Topics processing is paused</Alert.Title>
          <Alert.Description>
            <p className="break-words">{status.message}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                text="Turn back on"
                variant="secondary"
                size="sm"
                disabled={!canWrite}
                onClick={onTurnBackOn}
              />
              <Button
                text="Keep off"
                variant="secondary"
                size="sm"
                disabled={!canWrite}
                onClick={onKeepOff}
              />
            </div>
          </Alert.Description>
        </Alert>
      ) : null}
      {showOnboarding ? (
        <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-7 overflow-y-auto px-4 pb-24">
          <SortingIllustration />
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-3xl leading-tight font-bold tracking-tight text-balance">
              See what your traces are about
            </h2>
            <p className="text-muted-foreground max-w-100 text-base text-pretty">
              Every trace is labeled by intent, sentiment, outcome and issues,
              so recurring patterns surface on their own.
            </p>
          </div>
          {startBlockedReason ? (
            <p role="status" className="text-muted-foreground text-sm">
              {startBlockedReason}
            </p>
          ) : (
            <Button
              text="Set up topics"
              disabled={!canWrite || !canConfigure}
              onClick={onStart}
            />
          )}
        </div>
      ) : null}
    </>
  );
}

// Decorative: trace summaries dropping into three example topics.
const PILES = [
  { name: "Refunds", count: 214, bars: 9, color: "violet", left: "left-5" },
  {
    name: "Order status",
    count: 154,
    bars: 6,
    color: "blue",
    left: "left-33.5",
  },
  { name: "Address", count: 96, bars: 4, color: "amber", left: "left-62" },
] as const;

const SLIPS = [
  {
    text: "Refund for a double charge",
    color: "violet",
    position: "top-7 left-15 -rotate-8",
  },
  {
    text: "Package says delivered, not here",
    color: "blue",
    position: "top-1.5 left-47.5 rotate-5",
  },
  {
    text: "Ship to my office instead",
    color: "amber",
    position: "top-13 left-67.5 -rotate-4",
  },
] as const;

function SortingIllustration() {
  return (
    <div aria-hidden="true" className="relative h-62.5 w-110 shrink-0">
      <div className="bg-background absolute top-17.5 left-10 z-10 h-45 w-90 rounded-lg border shadow-md">
        {PILES.map((pile) => (
          <div
            key={pile.name}
            className={`absolute bottom-3.5 flex w-23 flex-col gap-1.5 ${pile.left}`}
          >
            <div className="flex flex-col-reverse gap-0.75">
              {Array.from({ length: pile.bars }, (_, index) => (
                <span
                  key={index}
                  className="h-2.25 rounded-sm"
                  style={{ backgroundColor: fadedColor(pile.color, index) }}
                />
              ))}
            </div>
            <div className="flex flex-col text-xs">
              <span className="font-bold whitespace-nowrap">{pile.name}</span>
              <span className="text-muted-foreground font-mono">
                {pile.count}
              </span>
            </div>
          </div>
        ))}
      </div>
      {SLIPS.map((slip) => (
        <div
          key={slip.text}
          className={`bg-background absolute z-20 flex items-center gap-1.75 rounded-lg border px-2.5 py-1.75 text-xs whitespace-nowrap shadow-md ${slip.position}`}
        >
          <span
            className="size-1.75 shrink-0 rounded-full"
            style={{ backgroundColor: categoryColor(slip.color) }}
          />
          {slip.text}
        </div>
      ))}
    </div>
  );
}

function categoryColor(color: (typeof PILES)[number]["color"]) {
  return `var(--category-${color}-highlight)`;
}

/** Bottom bar strongest; each bar above fades 8% toward the page. */
function fadedColor(color: (typeof PILES)[number]["color"], index: number) {
  return `color-mix(in oklch, ${categoryColor(color)} ${100 - index * 8}%, hsl(var(--background)))`;
}
