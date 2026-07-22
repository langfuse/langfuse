import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import {
  TraceDetailBody,
  traceDetailTitle,
} from "@/src/components/trace/TraceDetailBody";
import { Button } from "@/src/components/ui/button";
import { Switch } from "@/src/components/design-system/Switch/Switch";
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
import { Slider } from "@/src/components/ui/slider";
import { EvaluationRuleFieldLabel } from "@/src/features/evals/v2/components/EvaluationRuleFieldLabel";
import {
  EVALUATION_OBSERVATION_EXCLUSION_FILTERS,
  EXAMPLE_FILTERS,
  mergeExampleFilters,
  RuleFilterSearchBar,
} from "@/src/features/evals/v2/components/EvaluationRuleSection";
import { EvaluationRulePreviewTable } from "@/src/features/evals/v2/components/EvaluationRulePreviewTable";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { api } from "@/src/utils/api";
import { toAbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { type FilterState } from "@langfuse/shared";

export function CreateEvaluationRuleDialog({
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
  const [enabled, setEnabled] = useState(true);
  const [traceId, setTraceId] = useState<string | null>(null);
  const trace = usePeekData({
    projectId,
    traceId: traceId ?? undefined,
  });
  const { timeRange } = useTableDateRange(projectId);
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );
  const createRule = api.evalsV2.createRule.useMutation({
    onError: (error) => trpcErrorToast(error),
  });

  const create = async () => {
    try {
      await createRule.mutateAsync({
        projectId,
        name: name.trim(),
        targetObject: "event",
        filter: filterState,
        sampling,
        enabled,
      });
    } catch {
      return;
    }

    await utils.evalsV2.rules.invalidate({ projectId }).catch(() => undefined);
    showSuccessToast({
      title: "Rule created",
      description: `Evaluators can now be attached to ${name.trim()}.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size={traceId ? "xxl" : "lg"}>
        <DialogHeader>
          {traceId ? (
            <div className="flex min-w-0 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Back to new rule"
                onClick={() => setTraceId(null)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <DialogTitle
                className="truncate"
                title={traceDetailTitle(trace.data, traceId)}
              >
                {traceDetailTitle(trace.data, traceId)}
              </DialogTitle>
            </div>
          ) : (
            <>
              <DialogTitle>New rule</DialogTitle>
              <DialogDescription>
                Choose which incoming observations trigger the evaluators
                attached to this rule.
              </DialogDescription>
            </>
          )}
        </DialogHeader>

        {traceId ? (
          <DialogBody className="min-h-0 gap-0 p-0">
            <TraceDetailBody trace={trace.data} context="peek" />
          </DialogBody>
        ) : (
          <DialogBody className="gap-6">
            <section className="flex flex-col gap-2">
              <EvaluationRuleFieldLabel
                htmlFor="new-evaluation-rule-enabled"
                tooltip="Lets attached evaluators run on matching incoming observations."
              >
                Enabled
              </EvaluationRuleFieldLabel>
              <Switch
                id="new-evaluation-rule-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
                aria-label="Enable evaluation rule"
                color="green"
              />
            </section>

            <div className="flex flex-col gap-2">
              <EvaluationRuleFieldLabel
                htmlFor="new-evaluation-rule-name"
                tooltip="Use a short, recognizable name for this rule."
              >
                Name
              </EvaluationRuleFieldLabel>
              <Input
                id="new-evaluation-rule-name"
                value={name}
                placeholder="e.g. Production observations"
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
            </div>

            <section className="flex min-w-0 flex-col gap-2">
              <EvaluationRuleFieldLabel tooltip="Only matching observations are evaluated. Add filters to narrow the incoming data included.">
                Filters
              </EvaluationRuleFieldLabel>
              <RuleFilterSearchBar
                projectId={projectId}
                filterState={filterState}
                setFilterState={setFilterState}
              />
              <div className="flex flex-wrap items-center gap-2">
                {EXAMPLE_FILTERS.map((example) => (
                  <Button
                    key={example.label}
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setFilterState(
                        mergeExampleFilters(filterState, example.filters),
                      )
                    }
                  >
                    <example.icon className="mr-1.5 h-3.5 w-3.5" />
                    {example.label}
                  </Button>
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <EvaluationRuleFieldLabel tooltip="The share of matching observations to evaluate. 100% evaluates every match.">
                Sampling
              </EvaluationRuleFieldLabel>
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
              <EvaluationRuleFieldLabel tooltip="Preview recent observations that currently match this rule.">
                Matching observations
              </EvaluationRuleFieldLabel>
              <EvaluationRulePreviewTable
                projectId={projectId}
                filterState={filterState}
                timeRange={absoluteTimeRange}
                onSelectObservation={(row) => {
                  if (row.traceId) setTraceId(row.traceId);
                }}
              />
            </section>
          </DialogBody>
        )}

        {!traceId ? (
          <DialogFooter className="px-6 py-4">
            <Button
              type="button"
              variant="outline"
              disabled={createRule.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              loading={createRule.isPending}
              disabled={!name.trim()}
              onClick={() => create().catch(() => undefined)}
            >
              Create rule
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
