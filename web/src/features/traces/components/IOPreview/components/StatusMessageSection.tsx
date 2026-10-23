import { JsonViewController } from "@/src/components/ui/JsonViewController";
import { useMemo } from "react";
import { IOSection } from "@/src/components/ui/IOSection";
import { PrettyJsonViewContent } from "@/src/components/ui/PrettyJsonViewContent";
import { getJsonViewContentKind } from "@/src/components/ui/fns/getJsonViewContentKind";
import { FoldVertical, UnfoldVertical } from "@langfuse/icons";
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
      <JsonViewController
        json={status.message}
        parsedJson={parsedStatusMessage}
        currentView={currentView}
      >
        {(state) => (
          <IOSection
            title={presentation.title}
            onCopy={state.copy}
            actions={
              getJsonViewContentKind(state) === "table" &&
              state.hasExpandableRows
                ? [
                    {
                      icon: state.allRowsExpanded
                        ? FoldVertical
                        : UnfoldVertical,
                      label: state.allRowsExpanded
                        ? "Collapse all rows"
                        : "Expand all rows",
                      onClick: state.toggleAllRows,
                    },
                  ]
                : undefined
            }
            variant={
              getJsonViewContentKind(state) === "table" ? "table" : "text"
            }
            tone={presentation.tone}
          >
            <PrettyJsonViewContent
              state={state}
              title={presentation.title}
              borderless
            />
          </IOSection>
        )}
      </JsonViewController>
    );
  }

  return (
    <IOSection
      title={presentation.title}
      onCopy={() => copyTextToClipboard(status.message)}
      tone={presentation.tone}
    >
      {status.message}
    </IOSection>
  );
}
