import { type ReactNode } from "react";
import type { TopicFacet, TopicRule } from "@langfuse/shared/topics";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { NewAnalysisDialog } from "./NewAnalysisDialog";
import { TopicRuleDialog } from "./TopicRuleDialog";

export type TopicSliceDialog =
  | { kind: "analysis" }
  | { kind: "rule"; rule: TopicRule };

/**
 * Owns the New scan and Edit scan dialogs, which open from the map picker,
 * the actions menu and empty states.
 */
export function TopicSliceDialogController({
  projectId,
  facets,
  liveDisabledReason,
  onAnalysisStarted,
  onRuleCreated,
  children,
}: {
  projectId: string;
  facets: TopicFacet[];
  /** Why New scan can't create another live scan; absent when it can. */
  liveDisabledReason?: string;
  onAnalysisStarted: (executionId: string) => void;
  onRuleCreated: (ruleId: string) => void;
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
            liveDisabledReason={liveDisabledReason}
            onStarted={({ executionId }) => onAnalysisStarted(executionId)}
            onRuleCreated={onRuleCreated}
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
