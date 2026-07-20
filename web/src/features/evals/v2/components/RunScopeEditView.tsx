import { useState } from "react";

import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Slider } from "@/src/components/ui/slider";
import { ScopeFilterSearchBar } from "@/src/features/evals/v2/components/RunScopeSection";
import { ScopePreviewTable } from "@/src/features/evals/v2/components/ScopePreviewTable";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";
import { type AbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { type FilterState } from "@langfuse/shared";

export function RunScopeEditView({
  projectId,
  runScope,
  timeRange,
  onCancel,
  onSaved,
}: {
  projectId: string;
  runScope: {
    id: string;
    name: string;
    filter: FilterState;
    sampling: number;
    evaluators: Array<{ id: string; scoreName: string }>;
  };
  timeRange: AbsoluteTimeRange | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const utils = api.useUtils();
  const [name, setName] = useState(runScope.name);
  const [filterState, setFilterState] = useState(runScope.filter);
  const [sampling, setSampling] = useState(runScope.sampling);
  const [saveConfirmationOpen, setSaveConfirmationOpen] = useState(false);

  const updateScope = api.evalsV2.updateRunScope.useMutation({
    onError: (error) => trpcErrorToast(error),
  });
  const evaluatorCount = runScope.evaluators.length;
  const hasChanges =
    name.trim() !== runScope.name ||
    sampling !== runScope.sampling ||
    JSON.stringify(filterState) !== JSON.stringify(runScope.filter);

  const invalidateAfterSave = () =>
    Promise.all([utils.evals.invalidate(), utils.evalsV2.invalidate()]);
  const save = async () => {
    try {
      await updateScope.mutateAsync({
        projectId,
        runScopeId: runScope.id,
        name: name.trim(),
        filter: filterState,
        sampling,
      });
    } catch {
      return;
    }
    await invalidateAfterSave().catch(() => undefined);

    setSaveConfirmationOpen(false);
    showSuccessToast({
      title: "Run scope saved",
      description:
        evaluatorCount > 0
          ? `The changes now apply to ${evaluatorCount} connected evaluator${evaluatorCount === 1 ? "" : "s"}.`
          : "The run scope was updated.",
    });
    onSaved();
  };

  const requestSave = () => {
    if (evaluatorCount > 0) {
      setSaveConfirmationOpen(true);
      return;
    }
    save().catch(() => undefined);
  };

  return (
    <div className="flex min-w-0 flex-col gap-6 p-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="run-scope-name">Name</Label>
        <Input
          id="run-scope-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <section className="flex min-w-0 flex-col gap-2">
        <Label>Filters</Label>
        <ScopeFilterSearchBar
          projectId={projectId}
          filterState={filterState}
          setFilterState={setFilterState}
        />
      </section>

      <section className="flex flex-col gap-2">
        <Label>Sampling</Label>
        <Slider
          min={0.0001}
          max={1}
          step={0.0001}
          value={[sampling]}
          onValueChange={(value) => setSampling(value[0] ?? sampling)}
          showInput
          displayAsPercentage
        />
      </section>

      <section className="flex min-w-0 flex-col gap-2">
        <Label>Matching observations</Label>
        <ScopePreviewTable
          projectId={projectId}
          filterState={filterState}
          timeRange={timeRange}
        />
      </section>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={updateScope.isPending}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          loading={updateScope.isPending}
          disabled={!name.trim() || !hasChanges}
          onClick={requestSave}
        >
          Save changes
        </Button>
      </div>

      <ConfirmDialog
        open={saveConfirmationOpen}
        onOpenChange={setSaveConfirmationOpen}
        title="Save connected run scope?"
        description={`This run scope is connected to ${evaluatorCount} evaluator${evaluatorCount === 1 ? "" : "s"}. Saving these changes immediately changes which observations ${evaluatorCount === 1 ? "it evaluates" : "they evaluate"}.`}
        confirmLabel="Save changes"
        confirmVariant="default"
        loading={updateScope.isPending}
        onConfirm={save}
      />
    </div>
  );
}
