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
    "border-dark-red/30 bg-light-red/50 dark:border-dark-red/20 dark:bg-light-red/35",
  WARNING: "border-dark-yellow/40 bg-light-yellow/80",
  DEBUG: "border-muted-foreground/15 bg-muted/30 text-muted-foreground",
  DEFAULT: "bg-card",
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
        inset
      />
    );
  }

  return (
    <div>
      <MarkdownJsonViewHeader
        title={presentation.title}
        handleOnValueChange={() => undefined}
        handleOnCopy={() => copyTextToClipboard(status.message)}
        canEnableMarkdown={false}
        inset
      />
      <div
        className={cn(
          "ph-no-capture mx-2 rounded-sm border px-2 py-2 text-xs wrap-break-word whitespace-pre-wrap",
          STATUS_MESSAGE_CLASS_NAMES[status.level],
        )}
      >
        {status.message}
      </div>
    </div>
  );
}
