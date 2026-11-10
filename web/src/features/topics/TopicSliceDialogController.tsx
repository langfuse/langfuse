import { type ReactNode } from "react";
import type { FilterState } from "@langfuse/shared";
import type { TopicFacet, TopicRule } from "@langfuse/shared/topics";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { NewAnalysisDialog } from "./NewAnalysisDialog";
import { TopicRuleDialog } from "./TopicRuleDialog";

export type TopicSliceDialog =
  | { kind: "analysis"; filter: FilterState }
  | { kind: "rule"; rule: TopicRule };

/**
 * Owns the New run and Edit run dialogs, which open from the map picker,
 * the actions menu and empty states.
 */
export function TopicSliceDialogController({
  projectId,
  facets,
  onAnalysisStarted,
  children,
}: {
  projectId: string;
  facets: TopicFacet[];
  onAnalysisStarted: (executionId: string) => void;
  children: (control: {
    openSliceDialog: (dialog: TopicSliceDialog) => void;
  }) => ReactNode;
}) {
  return (
    <DialogController<TopicSliceDialog>
      renderDialog={({ state, closeDialog }) =>
        state.kind === "analysis" ? (
          <NewAnalysisDialog
            projectId={projectId}
            facets={facets}
            initialFilter={state.filter}
            onStarted={({ executionId }) => onAnalysisStarted(executionId)}
            closeDialog={closeDialog}
          />
        ) : (
          <TopicRuleDialog
            projectId={projectId}
            facets={facets}
            rule={state.rule}
            closeDialog={closeDialog}
          />
        )
      }
    >
      {({ openDialog }) => children({ openSliceDialog: openDialog })}
    </DialogController>
  );
}
