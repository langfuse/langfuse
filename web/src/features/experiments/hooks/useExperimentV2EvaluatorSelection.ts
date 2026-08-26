import { useMemo, useState } from "react";

import type {
  RuleDraft,
  RuleEvaluatorOption,
} from "@/src/features/evals/v2/types/rules";
import { prepareModernRuleVariableMapping } from "@/src/features/evals/v2/fns/variableMapping/prepareModernRuleVariableMapping";
import { useDebounce } from "@/src/hooks/useDebounce";
import { api, type RouterOutputs } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import {
  EvalTemplateType,
  EvalTargetObject,
  isExperimentEvaluationRule,
  observationVariableMappingList,
  stripExperimentRootFilter,
} from "@langfuse/shared";

type EvaluationRule =
  RouterOutputs["evalsV2"]["rules"]["list"]["rules"][number];

export function getDatasetExperimentRules(
  rules: EvaluationRule[] | undefined,
  datasetId: string,
) {
  return (rules ?? []).filter((rule) => {
    if (
      !isExperimentEvaluationRule({
        targetObject: rule.targetObject,
        filter: rule.filter,
      })
    ) {
      return false;
    }

    const filter = stripExperimentRootFilter(rule.filter);
    return (
      filter.length === 1 &&
      filter[0]?.column === "experimentDatasetId" &&
      filter[0].type === "stringOptions" &&
      filter[0].operator === "any of" &&
      filter[0].value.length === 1 &&
      filter[0].value[0] === datasetId
    );
  });
}

export function useExperimentV2EvaluatorSelection({
  projectId,
  datasetId,
  datasetName,
  enabled,
  canWrite,
}: {
  projectId: string;
  datasetId?: string | null;
  datasetName?: string;
  enabled: boolean;
  canWrite: boolean;
}) {
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(setSearchQuery, 300, false);
  const evaluatorOptions = api.evalsV2.options.useQuery(
    {
      projectId,
      limit: 100,
      search: searchQuery.trim() || undefined,
    },
    {
      enabled,
      placeholderData: (previousData) => previousData,
    },
  );
  const rules = api.evalsV2.rules.list.useQuery(
    {
      projectId,
      page: 1,
      limit: 100,
    },
    { enabled: enabled && Boolean(datasetId) },
  );
  const options = useMemo<RuleEvaluatorOption[]>(
    () =>
      (evaluatorOptions.data ?? []).map((evaluator) => ({
        id: evaluator.id,
        name: evaluator.name,
        type: evaluator.type,
        updatedAt: evaluator.updatedAt,
        createdByUser: evaluator.createdByUser,
        ...prepareModernRuleVariableMapping(
          evaluator.latestVersion?.variableMapping,
          evaluator.type,
        ),
      })),
    [evaluatorOptions.data],
  );
  const datasetRules = getDatasetExperimentRules(
    rules.data?.rules,
    datasetId ?? "",
  );
  const selectedEvaluatorNames = [
    ...new Set(
      datasetRules
        .filter((rule) => rule.enabled)
        .flatMap((rule) =>
          rule.assignments.map((assignment) => assignment.evaluator.name),
        ),
    ),
  ];
  const selectedAssignments = useMemo<RuleDraft["assignments"]>(() => {
    const assignments = new Map<string, RuleDraft["assignments"][number]>();

    for (const rule of datasetRules.filter((candidate) => candidate.enabled)) {
      for (const assignment of rule.assignments) {
        if (assignments.has(assignment.evaluatorId)) continue;

        const prepared = prepareModernRuleVariableMapping(
          assignment.evaluator.latestVersion?.variableMapping,
          assignment.evaluator.type,
        );
        assignments.set(assignment.evaluatorId, {
          evaluatorId: assignment.evaluatorId,
          evaluatorName: assignment.evaluator.name,
          evaluatorType: assignment.evaluator.type,
          defaultVariableMapping: prepared.defaultVariableMapping,
          variableMapping:
            assignment.evaluator.type === EvalTemplateType.CODE ||
            assignment.variableMapping == null
              ? prepared.initialVariableMapping
              : observationVariableMappingList
                  .catch([])
                  .parse(assignment.variableMapping),
        });
      }
    }

    return [...assignments.values()];
  }, [datasetRules]);

  const createRule = api.evalsV2.rules.create.useMutation({
    onError: trpcErrorToast,
  });
  const updateRule = api.evalsV2.rules.update.useMutation({
    onError: trpcErrorToast,
  });
  const isUpdating = createRule.isPending || updateRule.isPending;

  const onSaveAssignments = async (assignments: RuleDraft["assignments"]) => {
    if (!datasetId || !canWrite || isUpdating || rules.isPending) return;

    const evaluatorMappings = assignments.map((assignment) => ({
      evaluatorId: assignment.evaluatorId,
      variableMapping: assignment.variableMapping,
    }));
    const targetRule =
      datasetRules.find((rule) => rule.enabled) ?? datasetRules[0];

    if (targetRule) {
      await updateRule.mutateAsync({
        projectId,
        ruleId: targetRule.id,
        enabled: assignments.length > 0,
        evaluatorMappings,
      });
      await Promise.all(
        datasetRules
          .filter((rule) => rule.id !== targetRule.id)
          .map((rule) =>
            updateRule.mutateAsync({
              projectId,
              ruleId: rule.id,
              enabled: false,
              evaluatorMappings: [],
            }),
          ),
      );
    } else if (assignments.length > 0) {
      await createRule.mutateAsync({
        projectId,
        name: `Experiment evaluators for ${datasetName ?? "dataset"}`,
        targetObject: EvalTargetObject.EXPERIMENT,
        filter: [
          {
            column: "experimentDatasetId",
            type: "stringOptions",
            operator: "any of",
            value: [datasetId],
          },
        ],
        sampling: 1,
        enabled: true,
        evaluatorAssignments: evaluatorMappings,
      });
    }

    await utils.evalsV2.rules.list.invalidate();
  };

  return {
    options,
    selectedEvaluatorNames,
    selectedAssignments,
    isPending: enabled && evaluatorOptions.isPending,
    isLoadingAssignments: enabled && Boolean(datasetId) && rules.isPending,
    isUpdating,
    search,
    onSearchChange: (value: string) => {
      setSearch(value);
      debouncedSearch(value);
    },
    onSaveAssignments,
  };
}
