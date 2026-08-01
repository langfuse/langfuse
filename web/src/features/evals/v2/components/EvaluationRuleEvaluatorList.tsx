import { useState } from "react";
import { Check, ChevronDown, TriangleAlert, X } from "lucide-react";
import {
  type FilterState,
  observationVariableMappingList,
  type ObservationVariableMapping,
} from "@langfuse/shared";

import { Button } from "@/src/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { VariableMappingCard as VariableMapping } from "@/src/features/evals/v2/components/production/variable-mapping/VariableMappingCard";
import {
  MAPPABLE_COLUMNS,
  type VariableFieldState,
} from "@/src/features/evals/v2/components/VariableMappingPopover";
import { evaluationVariableMappingResolves } from "@/src/features/evals/v2/lib/evaluationVariableMapping";
import { formatMappingLabel } from "@/src/features/evals/v2/lib/jsonPathSegments";
import { ruleTimeRangeFilter } from "@/src/features/evals/v2/lib/useRuleMatchCount";
import { api } from "@/src/utils/api";
import { type AbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { cn } from "@/src/utils/tailwind";

export type EvaluationRuleFormEvaluator = {
  id: string;
  scoreName: string;
  variableMapping: ObservationVariableMapping[];
};

function EvaluationRuleMappingStatus({
  mappedCount,
  variableCount,
}: {
  mappedCount: number;
  variableCount: number;
}) {
  const complete = mappedCount === variableCount;

  return (
    <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
      {mappedCount}/{variableCount}{" "}
      {variableCount === 1 ? "variable" : "variables"} mapped
      {complete ? (
        <Check
          className="text-dark-green h-3.5 w-3.5"
          aria-label="All variables mapped"
        />
      ) : (
        <TriangleAlert
          className="text-dark-yellow h-3.5 w-3.5"
          aria-label="Some variables are not mapped"
        />
      )}
    </span>
  );
}

export function parseEvaluationRuleVariableMapping(mapping: unknown) {
  return observationVariableMappingList.catch([]).parse(mapping);
}

function EvaluationRuleEvaluatorItem({
  evaluator,
  sourceObject,
  sourceUnavailableMessage,
  readOnly,
  defaultOpen,
  onMappingChange,
  onRemove,
}: {
  evaluator: EvaluationRuleFormEvaluator;
  sourceObject: Record<string, unknown> | null;
  sourceUnavailableMessage: string;
  readOnly: boolean;
  defaultOpen: boolean;
  onMappingChange: (mapping: ObservationVariableMapping[]) => void;
  onRemove: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [activeVariable, setActiveVariable] = useState<string | null>(null);
  const overview = evaluator.variableMapping.map((mapping) => {
    const columnLabel =
      MAPPABLE_COLUMNS.find((column) => column.id === mapping.selectedColumnId)
        ?.label ?? mapping.selectedColumnId;
    return {
      variable: mapping.templateVariable,
      label: formatMappingLabel(columnLabel, mapping.jsonSelector ?? null),
      unmapped: !mapping.selectedColumnId,
    };
  });
  const mappedVariableCount = evaluator.variableMapping.filter((mapping) =>
    sourceObject
      ? evaluationVariableMappingResolves(sourceObject, mapping)
      : mapping.selectedColumnId.trim() !== "",
  ).length;
  const getFieldState = (templateVariable: string): VariableFieldState => {
    const mapping = evaluator.variableMapping.find(
      (candidate) => candidate.templateVariable === templateVariable,
    );
    return {
      selectedColumnId: mapping?.selectedColumnId || null,
      jsonSelector: mapping?.jsonSelector ?? null,
    };
  };
  const updateMapping = (
    templateVariable: string,
    next: VariableFieldState,
  ) => {
    onMappingChange(
      evaluator.variableMapping.map((mapping) =>
        mapping.templateVariable === templateVariable
          ? {
              ...mapping,
              selectedColumnId: next.selectedColumnId ?? "",
              jsonSelector: next.jsonSelector,
            }
          : mapping,
      ),
    );
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <li className="min-w-0 text-sm">
        <div className="flex min-w-0 items-center px-1 py-1">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="hover:bg-muted flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left"
              aria-label={`${open ? "Collapse" : "Configure"} ${evaluator.scoreName} variable mapping`}
            >
              <ChevronDown
                className={cn(
                  "text-muted-foreground h-4 w-4 shrink-0 transition-transform",
                  open && "rotate-180",
                )}
              />
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="min-w-0 truncate" title={evaluator.scoreName}>
                  {evaluator.scoreName}
                </span>
                <EvaluationRuleMappingStatus
                  mappedCount={mappedVariableCount}
                  variableCount={evaluator.variableMapping.length}
                />
              </span>
            </button>
          </CollapsibleTrigger>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${evaluator.scoreName}`}
            disabled={readOnly}
            onClick={() => Promise.resolve(onRemove()).catch(() => undefined)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <CollapsibleContent>
          <div className="bg-muted/20 flex flex-col gap-3 border-t px-3 py-3">
            <div>
              <p className="font-bold">Variable mapping</p>
              <p className="text-muted-foreground text-xs">
                This rule starts with the evaluator&apos;s default mapping.
                Changes here only apply to this rule.
              </p>
            </div>
            <div
              inert={readOnly ? true : undefined}
              aria-disabled={readOnly || undefined}
              className={readOnly ? "opacity-60" : undefined}
            >
              <VariableMapping
                overview={overview}
                activeVariable={activeVariable}
                onActiveVariableChange={setActiveVariable}
                selector="drill"
                getFieldState={getFieldState}
                onChangeField={updateMapping}
                sourceObject={sourceObject}
                hasMatchingObservations={sourceObject !== null}
                sourceUnavailableMessage={sourceUnavailableMessage}
              />
            </div>
          </div>
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
}

export function EvaluationRuleEvaluatorList({
  projectId,
  filterState,
  timeRange,
  evaluators,
  readOnly = false,
  initialExpandedEvaluatorId,
  onMappingChange,
  onRemove,
}: {
  projectId: string;
  filterState: FilterState;
  timeRange: AbsoluteTimeRange | null;
  evaluators: EvaluationRuleFormEvaluator[];
  readOnly?: boolean;
  initialExpandedEvaluatorId?: string;
  onMappingChange: (
    evaluatorId: string,
    mapping: ObservationVariableMapping[],
  ) => void;
  onRemove: (evaluatorId: string) => void | Promise<void>;
}) {
  const firstObservation = api.events.all.useQuery(
    {
      projectId,
      filter: filterState.concat(ruleTimeRangeFilter(timeRange)),
      searchQuery: null,
      searchType: [],
      orderBy: { column: "startTime", order: "DESC" },
      page: 1,
      limit: 1,
    },
    {
      enabled: evaluators.length > 0,
      refetchOnWindowFocus: false,
      meta: { silentHttpCodes: [422] },
    },
  );
  const sample = firstObservation.data?.observations[0] ?? null;
  const canLoadSample = Boolean(sample?.id && sample.traceId);
  const sampleDetails = api.evalsV2.sampleObservation.useQuery(
    {
      projectId,
      observationId: sample?.id ?? "",
      traceId: sample?.traceId ?? "",
      startTime: sample?.startTime ?? null,
    },
    { enabled: canLoadSample },
  );
  const sourceObject = sampleDetails.data
    ? (sampleDetails.data as Record<string, unknown>)
    : null;
  const sourceUnavailableMessage = firstObservation.isPending
    ? "Loading the first matching observation…"
    : !sample
      ? "No observations match the current rule."
      : sampleDetails.isPending
        ? "Loading the first matching observation…"
        : "The first matching observation could not be loaded.";

  if (evaluators.length === 0) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm">
        No evaluators attached yet.
      </div>
    );
  }

  return (
    <ul
      className="divide-border divide-y overflow-hidden rounded-md border"
      aria-label="Selected evaluators"
    >
      {evaluators.map((evaluator) => (
        <EvaluationRuleEvaluatorItem
          key={evaluator.id}
          evaluator={evaluator}
          sourceObject={sourceObject}
          sourceUnavailableMessage={sourceUnavailableMessage}
          readOnly={readOnly}
          defaultOpen={evaluator.id === initialExpandedEvaluatorId}
          onMappingChange={(mapping) => onMappingChange(evaluator.id, mapping)}
          onRemove={() => onRemove(evaluator.id)}
        />
      ))}
    </ul>
  );
}
