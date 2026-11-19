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
  active,
  onApply,
  onCancel,
  onOpenMultiQuery,
  applyContext = "dashboard",
}: {
  initialValue: StudioWidgetConfig;
  projectId: string;
  dateRange: { from: Date; to: Date };
  active: boolean;
  onApply: (config: StudioWidgetConfig) => void;
  onCancel: () => void;
  onOpenMultiQuery: () => void;
  applyContext?: "dashboard" | "report";
}) {
  const [error, setError] = useState<string | null>(null);
  const reason = currentWidgetRepresentationReason(initialValue);
  return (
    <section
      aria-label="Current widget editor"
      className="ph-no-capture flex h-full min-h-0 flex-col"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <p className="text-muted-foreground text-xs">
          The existing widget creator.{" "}
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
            This question needs a different builder
          </h2>
          <p className="text-muted-foreground max-w-xl text-sm">{reason}</p>
          <Button text="Open multi-query editor" onClick={onOpenMultiQuery} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <ConnectedWidgetForm
            projectId={projectId}
            initialValues={toCurrentWidgetInitialValues(initialValue)}
            initialDateRange={dateRange}
            previewEnabled={active}
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
