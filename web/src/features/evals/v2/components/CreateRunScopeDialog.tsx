import { useMemo, useState } from "react";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Slider } from "@/src/components/ui/slider";
import {
  EVALUATION_OBSERVATION_EXCLUSION_FILTERS,
  ScopeFilterSearchBar,
} from "@/src/features/evals/v2/components/RunScopeSection";
import { ScopePreviewTable } from "@/src/features/evals/v2/components/ScopePreviewTable";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { api } from "@/src/utils/api";
import { toAbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { type FilterState } from "@langfuse/shared";

export function CreateRunScopeDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = api.useUtils();
  const [name, setName] = useState("");
  const [filterState, setFilterState] = useState<FilterState>(() => [
    ...EVALUATION_OBSERVATION_EXCLUSION_FILTERS,
  ]);
  const [sampling, setSampling] = useState(1);
  const { timeRange } = useTableDateRange(projectId);
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );
  const createRunScope = api.evalsV2.createRunScope.useMutation({
    onError: (error) => trpcErrorToast(error),
  });

  const create = async () => {
    try {
      await createRunScope.mutateAsync({
        projectId,
        name: name.trim(),
        targetObject: "event",
        filter: filterState,
        sampling,
      });
    } catch {
      return;
    }

    await utils.evalsV2.runScopes
      .invalidate({ projectId })
      .catch(() => undefined);
    showSuccessToast({
      title: "Run scope created",
      description: `${name.trim()} is ready to attach to evaluators.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>New run scope</DialogTitle>
          <DialogDescription>
            Define which observations connected evaluators should run on.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="gap-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-run-scope-name">Name</Label>
            <Input
              id="new-run-scope-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
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
              timeRange={absoluteTimeRange}
            />
          </section>
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={createRunScope.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            loading={createRunScope.isPending}
            disabled={!name.trim()}
            onClick={() => create().catch(() => undefined)}
          >
            Create run scope
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
