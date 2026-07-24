import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import {
  TraceDetailBody,
  traceDetailTitle,
} from "@/src/components/trace/TraceDetailBody";
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
import { EvaluationRuleAttachmentValidationAlert } from "@/src/features/evals/v2/components/EvaluationRuleAttachmentValidationAlert";
import { EvaluationRuleAttachmentValidationDialog } from "@/src/features/evals/v2/components/EvaluationRuleAttachmentValidationDialog";
import { EvaluationRuleForm } from "@/src/features/evals/v2/components/EvaluationRuleForm";
import {
  EVALUATION_OBSERVATION_EXCLUSION_FILTERS,
  generateEvaluationRuleName,
} from "@/src/features/evals/v2/components/EvaluationRuleSection";
import { useValidatedRuleDraftEvaluator } from "@/src/features/evals/v2/hooks/useValidatedRuleDraftEvaluator";
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
  initialEvaluatorIds = [],
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEvaluatorIds?: string[];
}) {
  const utils = api.useUtils();
  const [nameOpen, setNameOpen] = useState(false);
  const [name, setName] = useState("");
  const [nameCustomized, setNameCustomized] = useState(false);
  const [filterState, setFilterState] = useState<FilterState>(() => [
    ...EVALUATION_OBSERVATION_EXCLUSION_FILTERS,
  ]);
  const [sampling, setSampling] = useState(1);
  const [selectedEvaluatorIds, setSelectedEvaluatorIds] = useState<string[]>(
    () => [...initialEvaluatorIds],
  );
  const [validatedEvaluatorIds, setValidatedEvaluatorIds] = useState<string[]>(
    [],
  );
  const [traceId, setTraceId] = useState<string | null>(null);
  const validation = useValidatedRuleDraftEvaluator({ projectId });
  const trace = usePeekData({
    projectId,
    traceId: traceId ?? undefined,
  });
  const { timeRange } = useTableDateRange(projectId);
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );
  const rules = api.evalsV2.rules.useQuery({ projectId }, { enabled: open });
  const evaluatorOptions = api.evalsV2.evaluatorOptions.useQuery(
    { projectId },
    { enabled: open },
  );
  const selectedEvaluators = selectedEvaluatorIds.flatMap((evaluatorId) => {
    const evaluator = evaluatorOptions.data?.find(
      (candidate) => candidate.id === evaluatorId,
    );
    return evaluator ? [evaluator] : [];
  });
  const evaluatorsValidated =
    selectedEvaluatorIds.length > 0 &&
    selectedEvaluatorIds.every((evaluatorId) =>
      validatedEvaluatorIds.includes(evaluatorId),
    );
  const availableEvaluators = (evaluatorOptions.data ?? []).filter(
    (evaluator) => evaluator.targetObject === "event",
  );
  const createRule = api.evalsV2.createRule.useMutation({
    onError: (error) => trpcErrorToast(error),
  });

  const updateFilters = (nextFilters: FilterState) => {
    setFilterState(nextFilters);
    setValidatedEvaluatorIds([]);
    setNameOpen(false);
    validation.resetIssue();
  };

  const validateEvaluator = async (evaluatorId: string) => {
    if (selectedEvaluatorIds.includes(evaluatorId)) {
      const nextSelectedIds = selectedEvaluatorIds.filter(
        (selectedId) => selectedId !== evaluatorId,
      );
      setSelectedEvaluatorIds(nextSelectedIds);
      setValidatedEvaluatorIds((current) =>
        current.filter((validatedId) => validatedId !== evaluatorId),
      );
      if (nextSelectedIds.length === 0) setNameOpen(false);
      validation.resetIssue();
      return;
    }

    const nextSelectedIds = [...selectedEvaluatorIds, evaluatorId];
    setSelectedEvaluatorIds(nextSelectedIds);
    validation.resetIssue();

    const valid = await validation.validate({
      evaluatorId,
      filter: filterState,
    });
    if (!valid) return;

    const nextValidatedIds = [...validatedEvaluatorIds, evaluatorId];
    setValidatedEvaluatorIds(nextValidatedIds);
    if (!nameCustomized) {
      setName(
        generateEvaluationRuleName({
          filter: filterState,
          targetObject: "event",
          existingNames: (rules.data ?? []).map((rule) => rule.name),
        }),
      );
    }
    setNameOpen(true);
  };

  const validateSelectedEvaluators = async () => {
    const validatedIds: string[] = [];
    for (const evaluatorId of selectedEvaluatorIds) {
      const valid = await validation.validate({
        evaluatorId,
        filter: filterState,
      });
      if (!valid) {
        setValidatedEvaluatorIds(validatedIds);
        return;
      }
      validatedIds.push(evaluatorId);
    }

    setValidatedEvaluatorIds(validatedIds);
    if (!nameCustomized) {
      setName(
        generateEvaluationRuleName({
          filter: filterState,
          targetObject: "event",
          existingNames: (rules.data ?? []).map((rule) => rule.name),
        }),
      );
    }
    setNameOpen(true);
  };

  const create = async () => {
    if (!evaluatorsValidated) return;
    try {
      await createRule.mutateAsync({
        projectId,
        name: name.trim(),
        targetObject: "event",
        filter: filterState,
        sampling,
        enabled: true,
        evaluatorIds: selectedEvaluatorIds,
      });
    } catch {
      return;
    }

    await Promise.all([
      utils.evalsV2.rules.invalidate({ projectId }),
      utils.evalsV2.invalidate(),
      ...selectedEvaluatorIds.map((evaluatorId) =>
        utils.evals.configById.invalidate({ projectId, id: evaluatorId }),
      ),
    ]).catch(() => undefined);
    showSuccessToast({
      title: "Rule created",
      description:
        selectedEvaluators.length === 1
          ? `${name.trim()} is active with ${selectedEvaluators[0]?.scoreName ?? "the evaluator"} attached.`
          : `${name.trim()} is active with ${selectedEvaluators.length} evaluators attached.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size={traceId ? "xxl" : "xl"}
        className={traceId ? undefined : "max-w-6xl"}
      >
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
                Define what data is evaluated, attach evaluators, then name the
                rule.
              </DialogDescription>
            </>
          )}
        </DialogHeader>

        <EvaluationRuleAttachmentValidationDialog
          open={validation.pendingEvaluatorId !== null}
        />

        {traceId ? (
          <DialogBody className="min-h-0 gap-0 p-0">
            <TraceDetailBody trace={trace.data} context="peek" />
          </DialogBody>
        ) : (
          <DialogBody className="gap-3">
            <EvaluationRuleForm
              projectId={projectId}
              name={name}
              onNameChange={(nextName) => {
                setName(nextName);
                setNameCustomized(true);
              }}
              filterState={filterState}
              onFilterStateChange={updateFilters}
              sampling={sampling}
              onSamplingChange={(nextSampling) => {
                setSampling(nextSampling);
                setValidatedEvaluatorIds([]);
                setNameOpen(false);
                validation.resetIssue();
              }}
              evaluators={selectedEvaluators}
              availableEvaluators={availableEvaluators}
              onToggleEvaluator={validateEvaluator}
              timeRange={absoluteTimeRange}
              onOpenTrace={setTraceId}
              validationRequired={
                selectedEvaluatorIds.length > 0 && !evaluatorsValidated
              }
              validating={validation.pendingEvaluatorId !== null}
              onValidateEvaluators={validateSelectedEvaluators}
              validationContent={
                validation.issue ? (
                  <EvaluationRuleAttachmentValidationAlert
                    projectId={projectId}
                    evaluatorId={validation.issue.evaluatorId}
                    issue={validation.issue}
                  />
                ) : null
              }
              nameOpen={nameOpen}
              onNameOpenChange={setNameOpen}
              defaultNameOpen={false}
              nameHint="The rule becomes active when it is created."
              idPrefix="new-evaluation-rule"
              columnVisibilityStorageKeySuffix="create-rule"
            />
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
              disabled={!name.trim() || !evaluatorsValidated}
              onClick={() => create().catch(() => undefined)}
            >
              Save
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
