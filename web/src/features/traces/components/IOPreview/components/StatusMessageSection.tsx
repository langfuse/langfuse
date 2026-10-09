import { useMemo } from "react";
import { MarkdownJsonViewHeader } from "@/src/components/ui/MarkdownJsonView";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { cn } from "@/src/utils/tailwind";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import {
  getStatusMessagePresentation,
  parseStructuredStatusMessage,
  type ObservationStatusMessage,
} from "./statusMessagePresentation";

const STATUS_MESSAGE_CLASS_NAMES: Record<
  ObservationStatusMessage["level"],
  string
> = {
  ERROR:
    "border-red-100 bg-red-50 text-red-900 dark:border-dark-red/20 dark:bg-light-red/35 dark:text-red-300",
  WARNING:
    "border-yellow-100 bg-yellow-50 text-yellow-900 dark:border-dark-yellow/20 dark:bg-light-yellow/35 dark:text-yellow-300",
  DEBUG: "bg-surface-output text-foreground-secondary",
  DEFAULT: "bg-surface-output text-foreground-secondary",
};

export function StatusMessageSection({
  status,
  currentView,
}: {
  status: ObservationStatusMessage;
  currentView: "pretty" | "json";
}) {
  const presentation = getStatusMessagePresentation(status.level);
  const parsedStatusMessage = useMemo(
    () => parseStructuredStatusMessage(status.message),
    [status.message],
  );

  if (parsedStatusMessage !== undefined) {
    return (
      <PrettyJsonView
        title={presentation.title}
        json={status.message}
        parsedJson={parsedStatusMessage}
        currentView={currentView}
        tone={presentation.tone}
      />
    );
  }

  return (
    <div className="group/iosection">
      <MarkdownJsonViewHeader
        title={presentation.title}
        handleOnCopy={() => copyTextToClipboard(status.message)}
        hoverRevealControls
      />
      <div
        className={cn(
          "ph-no-capture rounded-md px-3 py-2 text-base wrap-break-word whitespace-pre-wrap",
          (status.level === "ERROR" || status.level === "WARNING") && "border",
          STATUS_MESSAGE_CLASS_NAMES[status.level],
        )}
      >
        {status.message}
      </div>
    </div>
  );
}
