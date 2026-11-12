import { type MutationStatus } from "@tanstack/react-query";

import { cn } from "@/src/utils/tailwind";

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
export function ConnectionTestStatus({ status }: ConnectionTestStatusProps) {
  const display = STATUS_DISPLAY[status];
  return (
    <span
      role="status"
      className={cn(
        "order-last mb-2 self-center text-sm sm:order-none sm:mr-auto sm:mb-0",
        display.text,
      )}
    >
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
  );
}

type ConnectionTestStatusProps = {
  status: TestStatus;
};

type TestStatus = Exclude<MutationStatus, "idle">;
