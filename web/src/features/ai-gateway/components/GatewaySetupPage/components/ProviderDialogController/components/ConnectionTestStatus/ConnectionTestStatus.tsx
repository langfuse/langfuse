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

/** Sits first in the dialog footer and pushes the actions to the right. */
export function ConnectionTestStatus({ status }: ConnectionTestStatusProps) {
  const display = STATUS_DISPLAY[status];
  return (
    <span
      role="status"
      className={cn(
        "flex items-center gap-2 self-center text-sm sm:mr-auto",
        display.text,
      )}
    >
      <span className={cn("size-2 rounded-full", display.dot)} aria-hidden />
      {display.label}
    </span>
  );
}

type ConnectionTestStatusProps = {
  status: TestStatus;
};

type TestStatus = Exclude<MutationStatus, "idle">;
