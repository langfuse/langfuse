import { type MutationStatus } from "@tanstack/react-query";

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
    <div className="order-last mb-2 flex items-baseline gap-3 self-center sm:order-none sm:mr-auto sm:mb-0">
      <span role="status" className={cn("text-sm", display.text)}>
        {/* Inline `align-middle` centres the dot on the x-height, not the line box, so it sits optically level with the text. */}
        <span
          className={cn(
            "mr-2 inline-block size-2 rounded-full align-middle",
            display.dot,
          )}
          aria-hidden
        />
        {display.label}
      </span>
      {failure ? <ConnectionTestDetails failure={failure} /> : null}
    </div>
  );
}

type ConnectionTestStatusProps = {
  status: TestStatus;
  /** Shown behind a "Show details" link when the test failed. */
  failure?: ConnectionTestFailure;
};

type TestStatus = Exclude<MutationStatus, "idle">;
