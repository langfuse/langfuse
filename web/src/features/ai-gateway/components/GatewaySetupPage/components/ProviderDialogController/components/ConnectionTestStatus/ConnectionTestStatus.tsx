import { type MutationStatus } from "@tanstack/react-query";

import { Button } from "@/src/components/design-system/Button/Button";
import { cn } from "@/src/utils/tailwind";
import {
  ConnectionTestDetails,
  type ConnectionTestFailure,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/ConnectionTestStatus/components/ConnectionTestDetails/ConnectionTestDetails";

const STATUS_DISPLAY = {
  pending: {
    label: "Testing connection…",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground animate-pulse",
  },
  success: {
    label: "Connection successful",
    text: "text-dark-green",
    dot: "bg-dark-green",
  },
  error: {
    label: "Connection test failed",
    text: "text-dark-red",
    dot: "bg-dark-red",
  },
} satisfies Record<TestStatus, { label: string; text: string; dot: string }>;

/** Left of the dialog footer actions on wide screens, above them when they stack on narrow ones. */
export function ConnectionTestStatus({
  status,
  failure,
}: ConnectionTestStatusProps) {
  const display = STATUS_DISPLAY[status];
  return (
    <div className="order-last mb-2 flex items-center gap-3 self-center sm:order-none sm:mr-auto sm:mb-0">
      {/* `leading-none` shrinks the line box to the glyphs, so centring the dot on it does not depend on the font's x-height. */}
      <span
        role="status"
        className={cn(
          "flex items-center gap-2 text-sm leading-none",
          display.text,
        )}
      >
        <span
          className={cn("size-2 shrink-0 rounded-full", display.dot)}
          aria-hidden
        />
        {display.label}
      </span>
      {failure ? (
        <ConnectionTestDetails failure={failure}>
          {({ getTriggerProps, isOpen }) => (
            <span className="inline-flex" {...getTriggerProps()}>
              <Button
                variant="text"
                text={isOpen ? "Hide details" : "Show details"}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
              />
            </span>
          )}
        </ConnectionTestDetails>
      ) : null}
    </div>
  );
}

type ConnectionTestStatusProps = {
  status: TestStatus;
  /** Shown behind a "Show details" link when the test failed. */
  failure?: ConnectionTestFailure;
};

type TestStatus = Exclude<MutationStatus, "idle">;
