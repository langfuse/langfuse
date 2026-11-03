import { type ReactNode } from "react";
import type { FilterState } from "@langfuse/shared";
import type { TopicFacet, TopicRule } from "@langfuse/shared/topics";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import {
  ProcessPastTracesDialog,
  type ProcessPastTracesPrefill,
} from "./ProcessPastTracesDialog";
import { NewAnalysisDialog } from "./NewAnalysisDialog";
import { TopicRuleDialog } from "./TopicRuleDialog";
import { RerunAnalysisDialog } from "./RerunAnalysisDialog";
import type { TopicAnalysisMap } from "./topic-maps";

export type TopicSliceDialog =
  | { kind: "process"; prefill: ProcessPastTracesPrefill }
  | { kind: "analysis"; filter: FilterState }
  | { kind: "rerun"; analysis: TopicAnalysisMap }
  | { kind: "rule"; rule: TopicRule | null };

/**
 * Owns the Process past traces, New analysis and rule dialogs, which open from
 * the map picker, the actions menu, empty states and the Rules page.
 */
export function TopicSliceDialogController({
  projectId,
  facets,
  ruleCount,
  onProcessStarted,
  onAnalysisStarted,
  onRuleSaved,
  children,
}: {
  projectId: string;
  facets: TopicFacet[];
  ruleCount: number;
  onProcessStarted: (executionId: string) => void;
  /** `analysisId` is the first run of the analysis the new run belongs to. */
  onAnalysisStarted: (executionId: string, analysisId: string) => void;
  onRuleSaved?: (rule: TopicRule, created: boolean) => void;
  children: (control: {
    openSliceDialog: (dialog: TopicSliceDialog) => void;
  }) => ReactNode;
}) {
  return (
    <DialogController<ProcessPastTracesPrefill>
      renderDialog={({ state, closeDialog }) => (
        <ProcessPastTracesDialog
          projectId={projectId}
          facets={facets}
          prefill={state}
          onStarted={onProcessStarted}
          closeDialog={closeDialog}
        />
      )}
    >
      {({ openDialog: openProcess }) => (
        // Nested so the analysis dialog can hand over to Process past traces.
        <DialogController<Exclude<TopicSliceDialog, { kind: "process" }>>
          renderDialog={({ state, closeDialog }) => {
            if (state.kind === "analysis")
              return (
                <NewAnalysisDialog
                  projectId={projectId}
                  facets={facets}
                  initialFilter={state.filter}
                  onStarted={({ executionId }) =>
                    onAnalysisStarted(executionId, executionId)
                  }
                  onProcessPastTraces={openProcess}
                  closeDialog={closeDialog}
                />
              );
            if (state.kind === "rerun")
              return (
                <RerunAnalysisDialog
                  projectId={projectId}
                  analysis={state.analysis}
                  onStarted={(executionId) =>
                    onAnalysisStarted(executionId, state.analysis.id)
                  }
                  closeDialog={closeDialog}
                />
              );
            return (
              <TopicRuleDialog
                projectId={projectId}
                facets={facets}
                rule={state.rule}
                ruleCount={ruleCount}
                onSaved={(rule, created) => onRuleSaved?.(rule, created)}
                closeDialog={closeDialog}
              />
            );
          }}
        >
          {({ openDialog }) =>
            children({
              openSliceDialog: (dialog) =>
                dialog.kind === "process"
                  ? openProcess(dialog.prefill)
                  : openDialog(dialog),
            })
          }
        </DialogController>
      )}
    </DialogController>
  );
}
