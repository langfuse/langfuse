import { useMemo } from "react";
import { IOSection } from "@/src/components/ui/IOSection";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { StatusMessage } from "@/src/components/design-system/StatusMessage/StatusMessage";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import {
  getStatusMessagePresentation,
  parseStructuredStatusMessage,
  type ObservationStatusMessage,
} from "./statusMessagePresentation";

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

  // The status message paints its own level-coloured box.
  return (
    <IOSection
      title={presentation.title}
      onCopy={() => copyTextToClipboard(status.message)}
      body="bare"
    >
      <StatusMessage
        level={status.level}
        message={status.message}
        size="default"
      />
    </IOSection>
  );
}
