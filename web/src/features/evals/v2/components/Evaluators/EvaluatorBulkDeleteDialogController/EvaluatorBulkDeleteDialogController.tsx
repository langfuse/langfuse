import type { ReactNode } from "react";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";

export type EvaluatorDeleteSelection =
  | { scope: "selected"; evaluatorIds: string[] }
  | { scope: "allMatching" };

export function EvaluatorBulkDeleteDialogController({
  children,
}: {
  children: (control: {
    openDialog: (
      selection: EvaluatorDeleteSelection,
      onConfirm: (selection: EvaluatorDeleteSelection) => Promise<void>,
    ) => void;
  }) => ReactNode;
}) {
  return (
    <ConfirmationDialogController<{
      selection: EvaluatorDeleteSelection;
      onConfirm: (selection: EvaluatorDeleteSelection) => Promise<void>;
    }>
      title={({ selection }) =>
        (
          {
            allMatching: "Delete all matching evaluators?",
            selected: "Delete selected evaluators?",
          } satisfies Record<EvaluatorDeleteSelection["scope"], string>
        )[selection.scope]
      }
      text="All versions and evaluation rule assignments will be deleted."
      confirmLabel="Delete evaluators"
      variant="destructive"
      onConfirm={({ selection, onConfirm }) => onConfirm(selection)}
    >
      {({ openDialog }) =>
        children({
          openDialog: (selection, onConfirm) =>
            openDialog({ selection, onConfirm }),
        })
      }
    </ConfirmationDialogController>
  );
}
