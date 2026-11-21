import { type StudioWidgetConfig } from "@langfuse/shared";
import { useState } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
import { ConnectedWidgetForm } from "@/src/features/widgets/components/ConnectedWidgetForm";
import {
  currentWidgetRepresentationReason,
  fromCurrentWidgetPayload,
  toCurrentWidgetInitialValues,
  currentWidgetSaveConstraintReason,
} from "./currentWidgetBridge";
import { validateCurrentStudioConfig } from "./currentStudioExecution";

export function CurrentWidgetExperience({
  initialValue,
  projectId,
  dateRange,
  onApply,
  onCancel,
  onBack,
  applyContext = "dashboard",
}: {
  initialValue: StudioWidgetConfig;
  projectId: string;
  dateRange: { from: Date; to: Date };
  onApply: (config: StudioWidgetConfig) => void;
  onCancel: () => void;
  onBack: () => void;
  applyContext?: "dashboard" | "report";
}) {
  const [error, setError] = useState<string | null>(null);
  const reason =
    currentWidgetRepresentationReason(initialValue) ??
    (initialValue.executionMode === "prototype"
      ? "This chart uses experimental queries. Turn them off in Editor options to use the classic editor."
      : null);
  return (
    <section
      aria-label="Classic widget editor"
      className="ph-no-capture flex h-full min-h-0 flex-col"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <p className="text-muted-foreground text-xs">
          Classic editor.{" "}
          {applyContext === "report"
            ? "Save updates this report cell."
            : "Save applies this widget to the dashboard draft."}
        </p>
        <Button text="Cancel" variant="ghost" onClick={onCancel} />
      </div>
      {error ? (
        <p role="alert" className="text-destructive border-b px-4 py-2 text-xs">
          {error}
        </p>
      ) : null}
      {reason ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-4 p-8">
          <h2 className="text-lg font-bold">
            Open this chart in the chart editor
          </h2>
          <p className="text-muted-foreground max-w-xl text-sm">{reason}</p>
          <Button text="Back to chart editor" onClick={onBack} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <ConnectedWidgetForm
            projectId={projectId}
            initialValues={toCurrentWidgetInitialValues(initialValue)}
            initialDateRange={dateRange}
            onSave={(payload) => {
              const constraintReason = currentWidgetSaveConstraintReason(
                initialValue,
                payload,
              );
              if (constraintReason) {
                setError(constraintReason);
                return;
              }
              const next = fromCurrentWidgetPayload(initialValue, payload);
              const validation = validateCurrentStudioConfig(next);
              if (!validation.valid) {
                setError(validation.reason);
                return;
              }
              onApply(next);
            }}
          />
        </div>
      )}
    </section>
  );
}
