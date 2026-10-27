import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { type TopicSetupNoticeState } from "./TopicModelSettings";
import { TopicPilesIllustration } from "./TopicPilesIllustration";

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
          <TopicPilesIllustration piles={LANDING_PILES} slips={LANDING_SLIPS} />
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
const LANDING_PILES = [
  { name: "Refunds", detail: "214", slots: 9, filled: 9, color: "violet" },
  { name: "Order status", detail: "154", slots: 6, filled: 6, color: "blue" },
  { name: "Address", detail: "96", slots: 4, filled: 4, color: "amber" },
] as const;

const LANDING_SLIPS = [
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
