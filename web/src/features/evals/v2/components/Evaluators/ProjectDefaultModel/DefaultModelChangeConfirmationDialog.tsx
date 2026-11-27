import { ArrowRight } from "@langfuse/icons";
import type { ReactNode } from "react";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";
import type { ProjectDefaultModelConfig } from "@/src/features/evals/v2/types/ProjectDefaultModelConfig";

export function DefaultModelChangeConfirmationDialog({
  currentModel,
  children,
  loading,
  onConfirm,
}: {
  currentModel: JudgeModel | null;
  children: (control: {
    openDialog: (model: ProjectDefaultModelConfig) => void;
  }) => ReactNode;
  loading: boolean;
  onConfirm: (model: ProjectDefaultModelConfig) => Promise<void>;
}) {
  return (
    <DialogController<ProjectDefaultModelConfig>
      onBeforeClose={() => !loading}
      renderDialog={({ state, closeDialog }) => (
        <Dialog
          closeOnInteractionOutside
          size="sm"
          title="Set project default model"
          actions={[
            {
              label: currentModel ? "Update default" : "Set default",
              loading,
              onClick: async () => {
                try {
                  await onConfirm(state);
                  closeDialog();
                } catch {
                  // The mutation reports the error; keep the selection for retry.
                }
              },
            },
          ]}
        >
          <Dialog.Body>
            <p className="text-muted-foreground">
              Evaluators that follow the project default will use the new model
              on their next run. Evaluators with their own model are untouched.
              New evaluators start on the default.
            </p>
            <div className="bg-muted flex items-center gap-2 rounded-md border px-3 py-2 font-mono text-sm">
              {currentModel ? (
                <>
                  <span
                    className="truncate"
                    title={`${currentModel.provider} / ${currentModel.model}`}
                  >
                    {currentModel.provider} / {currentModel.model}
                  </span>
                  <ArrowRight size="base" color="muted" />
                </>
              ) : null}
              <span
                className="truncate"
                title={`${state.provider} / ${state.model}`}
              >
                {state.provider} / {state.model}
              </span>
            </div>
          </Dialog.Body>
        </Dialog>
      )}
    >
      {children}
    </DialogController>
  );
}
