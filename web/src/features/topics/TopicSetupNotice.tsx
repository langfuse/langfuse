import { ArrowRight } from "@langfuse/icons";
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
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 overflow-y-auto px-4 pt-12">
          <SortingIllustration />
          <h2 className="text-center text-2xl font-bold">
            Thousands of traces, a few clear topics
          </h2>
          {startBlockedReason ? (
            <p role="status" className="text-muted-foreground text-sm">
              {startBlockedReason}
            </p>
          ) : (
            <Button
              text="Start analyzing"
              disabled={!canWrite || !canConfigure}
              onClick={onStart}
            />
          )}
        </div>
      ) : null}
    </>
  );
}

// Decorative: a messy pile of traces sorted into three example topics.
const MESSY_CARDS = [
  [10, 24, -12],
  [78, 0, 7],
  [150, 34, -4],
  [24, 96, 9],
  [112, 84, -15],
  [166, 118, 11],
  [0, 160, -6],
  [86, 156, 4],
  [150, 176, -9],
  [62, 48, 17],
] as const;
const SLAB_JITTER = [0, 3, -2, 4, -3, 1, -4, 2, -1, 3, 0];
const PILES = [
  {
    name: "Refund requests",
    count: 214,
    slabs: 11,
    className: "bg-dark-violet/25 border-dark-violet/40",
  },
  {
    name: "Order status",
    count: 156,
    slabs: 8,
    className: "bg-dark-blue/20 border-dark-blue/35",
  },
  {
    name: "Cancel subscription",
    count: 61,
    slabs: 4,
    className: "bg-dark-teal/20 border-dark-teal/35",
  },
];

function SortingIllustration() {
  return (
    <div
      aria-hidden="true"
      className="bg-light-violet flex w-full items-center justify-center gap-8 overflow-hidden rounded-2xl px-6 py-10"
    >
      <div className="relative hidden h-60 w-72 shrink-0 sm:block">
        {MESSY_CARDS.map(([left, top, rotate]) => (
          <div
            key={`${left}-${top}`}
            className="bg-card absolute flex h-16 w-28 flex-col gap-2 rounded-lg border p-2.5 shadow-sm"
            style={{ left, top, transform: `rotate(${rotate}deg)` }}
          >
            <span className="bg-muted size-2 rounded-full" />
            <span className="bg-muted h-1.5 w-4/5 rounded" />
            <span className="bg-muted h-1.5 w-3/5 rounded" />
          </div>
        ))}
      </div>
      <ArrowRight
        size="lg"
        color="muted"
        __rawClassName="hidden shrink-0 sm:block"
      />
      <div className="flex items-end gap-5">
        {PILES.map((pile) => (
          <div key={pile.name} className="flex flex-col items-center gap-1">
            <div className="flex flex-col gap-1">
              {SLAB_JITTER.slice(0, pile.slabs).map((offset, index) => (
                <span
                  key={index}
                  className={`h-3.5 w-28 rounded border ${pile.className}`}
                  style={{ transform: `translateX(${offset}px)` }}
                />
              ))}
            </div>
            <span className="mt-2 text-sm font-bold">{pile.name}</span>
            <span className="text-muted-foreground text-sm">{pile.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
