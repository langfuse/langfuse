import { type ReactNode } from "react";
import type { FilterState } from "@langfuse/shared";
import type { TopicFacet, TopicRule } from "@langfuse/shared/topics";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { NewAnalysisDialog } from "./NewAnalysisDialog";
import { TopicRuleDialog } from "./TopicRuleDialog";

export type TopicSliceDialog =
  | { kind: "analysis"; filter: FilterState }
  | { kind: "rule"; rule: TopicRule | null };

/**
 * Owns the New analysis and rule dialogs, which open from the map picker, the
 * actions menu, empty states and the Rules page.
 */
export function TopicSliceDialogController({
  projectId,
  facets,
  ruleCount,
  onAnalysisStarted,
  onRuleSaved,
  children,
}: {
  projectId: string;
  facets: TopicFacet[];
  ruleCount: number;
  onAnalysisStarted: (executionId: string) => void;
  onRuleSaved?: (rule: TopicRule, created: boolean) => void;
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
            ruleCount={ruleCount}
            onSaved={(rule, created) => onRuleSaved?.(rule, created)}
            closeDialog={closeDialog}
          />
        )
      }
    >
      {({ openDialog }) => children({ openSliceDialog: openDialog })}
    </DialogController>
  );
}
