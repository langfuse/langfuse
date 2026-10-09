import { useRef, useState } from "react";
import { useStore } from "zustand";
import {
  createDefaultScoreResultPredicate,
  deriveEvaluatorScoreDefinitions,
  type ScoreResultTrigger,
} from "@langfuse/shared";

import { TextActionButton } from "@/src/components/TextActionButton/TextActionButton";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Skeleton } from "@/src/components/ui/skeleton";
import { SectionHeader } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SectionHeader/SectionHeader";
import type { RuleSetupStore } from "@/src/features/evals/v2/types/rules";
import { useDebounce } from "@/src/hooks/useDebounce";
import { api, type RouterOutputs } from "@/src/utils/api";
import { RuleEvaluatorResultPredicateRow } from "./RuleEvaluatorResultPredicateRow";
import {
  DEFAULT_SCORE_RESULT_PREDICATE,
  predicateForScoreName,
  prepareEvaluatorResultPredicates,
} from "./ruleEvaluatorResultPredicates";

type ScorePredicate = ScoreResultTrigger["predicates"][number];
type EvaluatorDefinition = RouterOutputs["evalsV2"]["get"];
const keepFixedValue = () => undefined;

type RuleEvaluatorResultTriggerSectionProps = {
  projectId: string;
  store: RuleSetupStore;
};

export function RuleEvaluatorResultTriggerSection({
  projectId,
  store,
}: RuleEvaluatorResultTriggerSectionProps) {
  const trigger = useStore(store, (state) => state.scoreResultTrigger);
  const setTrigger = store.getState().actions.setScoreResultTrigger;
  const utils = api.useUtils();
  const evaluatorRequestId = useRef(0);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(setSearchQuery, 300, false);
  const selectedEvaluator = api.evalsV2.get.useQuery(
    {
      projectId,
      evaluatorId: trigger?.evaluatorId ?? "",
    },
    { enabled: trigger !== null },
  );
  const selectableEvaluators = useSelectableEvaluators({
    projectId,
    searchQuery,
    selectedEvaluator: selectedEvaluator.data ?? null,
  });
  const scoreDefinitions = selectedEvaluator.data
    ? deriveEvaluatorScoreDefinitions(
        toScoreDefinitionSource(selectedEvaluator.data),
      )
    : null;
  const attachedRules = api.evalsV2.rules.listRulesForEvaluator.useQuery(
    {
      projectId,
      evaluatorId: trigger?.evaluatorId ?? "",
    },
    { enabled: trigger !== null },
  );
  const attachmentSummary = formatAttachmentSummary(
    (attachedRules.data ?? []).map(({ evaluationRule }) => evaluationRule.name),
  );
  const handleEvaluatorChange = async (evaluatorId: string) => {
    const requestId = ++evaluatorRequestId.current;
    const evaluator = await utils.client.evalsV2.get.query({
      projectId,
      evaluatorId,
    });
    if (requestId !== evaluatorRequestId.current) return;
    const prepared = prepareEvaluatorResultPredicates(
      toScoreDefinitionSource(evaluator),
    );
    setTrigger({
      evaluatorId,
      predicates: prepared.predicates,
    });
    debouncedSearch("");
  };
  const handleEvaluatorValueChange = async (evaluatorId: string) => {
    await handleEvaluatorChange(evaluatorId);
  };
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    debouncedSearch(value);
  };
  const handleSearchOpenChange = (open: boolean) => {
    if (open) return;
    setSearchInput("");
    setSearchQuery("");
    debouncedSearch("");
  };
  const handlePredicateChange = (index: number, predicate: ScorePredicate) => {
    if (!trigger) return;
    const predicates = [...trigger.predicates];
    predicates[index] = predicate;
    setTrigger({ ...trigger, predicates });
  };
  const handlePredicateRemove = (index: number) => {
    if (!trigger) return;
    setTrigger({
      ...trigger,
      predicates: trigger.predicates.filter(
        (_, predicateIndex) => predicateIndex !== index,
      ),
    });
  };
  const handleAddPredicate = () => {
    if (!trigger) return;
    const scoreDefinition =
      scoreDefinitions?.mode === "known"
        ? scoreDefinitions.scores[0]
        : undefined;
    const predicate = scoreDefinition
      ? createDefaultScoreResultPredicate(scoreDefinition)
      : DEFAULT_SCORE_RESULT_PREDICATE;
    setTrigger({
      ...trigger,
      predicates: [...trigger.predicates, predicate],
    });
  };
  const handleScoreNameChange = (index: number, scoreName: string) => {
    if (!trigger || scoreDefinitions?.mode !== "known") return;
    const predicate = predicateForScoreName(scoreName, scoreDefinitions.scores);
    if (!predicate) return;
    handlePredicateChange(index, predicate);
  };
  const knownScores =
    scoreDefinitions?.mode === "freeform"
      ? null
      : (scoreDefinitions?.scores ?? []);
  const addDisabled =
    !trigger ||
    scoreDefinitions === null ||
    scoreDefinitions.mode === "unsupported" ||
    trigger.predicates.length >= 20 ||
    (scoreDefinitions?.mode === "known" &&
      scoreDefinitions.scores.length === 0);

  return (
    <div className="flex flex-col gap-2">
      <SectionHeader
        title="Filter evaluator results"
        meta={null}
        description="Group conditions on the same evaluator to wait for all its scores."
        tooltip="These conditions determine which evaluator results trigger this rule."
        trailing={null}
      />

      <div className="grid grid-cols-[3.25rem_minmax(8rem,0.65fr)_6rem_minmax(12rem,1.5fr)_2rem] items-center gap-2">
        <span className="text-muted-foreground text-sm">Where</span>
        <SelectInput
          value="evaluator"
          options={[{ value: "evaluator", label: "Evaluator" }]}
          onValueChange={keepFixedValue}
          placeholder="Field"
          disabled
        />
        <SelectInput
          value="="
          options={[{ value: "=", label: "=" }]}
          onValueChange={keepFixedValue}
          placeholder="Operator"
          disabled
        />
        <SelectInput
          id="trigger-evaluator"
          value={trigger?.evaluatorId ?? ""}
          options={selectableEvaluators}
          onValueChange={handleEvaluatorValueChange}
          placeholder="Select an evaluator"
          emptyMessage="No evaluators found."
          optionIndicator="checkmark"
          search={{
            placeholder: "Search evaluators...",
            value: searchInput,
            onValueChange: handleSearchChange,
            onOpenChange: handleSearchOpenChange,
          }}
        />
        <span aria-hidden />
      </div>

      {attachmentSummary ? (
        <p className="text-muted-foreground pl-[3.75rem] text-xs">
          ↳ attached via {attachmentSummary}
        </p>
      ) : null}

      {trigger && selectedEvaluator.isPending ? (
        <Skeleton className="ml-[3.75rem] h-9" />
      ) : null}

      {selectedEvaluator.isError ? (
        <p className="text-destructive pl-[3.75rem] text-sm">
          Could not load this evaluator’s score definition.
        </p>
      ) : null}

      {scoreDefinitions?.mode === "known" &&
      scoreDefinitions.scores.length === 0 ? (
        <p className="text-destructive pl-[3.75rem] text-sm">
          This evaluator has no valid saved score definition.
        </p>
      ) : null}

      {scoreDefinitions !== null &&
        trigger?.predicates.map((predicate, index) => (
          <RuleEvaluatorResultPredicateRow
            key={`${trigger.evaluatorId}:${index}:${predicate.scoreName}:${predicate.dataType}`}
            index={index}
            predicate={predicate}
            canRemove={trigger.predicates.length > 1}
            scoreDefinitions={knownScores}
            onChange={handlePredicateChange}
            onScoreNameChange={handleScoreNameChange}
            onRemove={handlePredicateRemove}
          />
        ))}

      <TextActionButton
        text="Add filter"
        disabled={addDisabled}
        onClick={handleAddPredicate}
      />
    </div>
  );
}

function useSelectableEvaluators({
  projectId,
  searchQuery,
  selectedEvaluator,
}: {
  projectId: string;
  searchQuery: string;
  selectedEvaluator: EvaluatorDefinition | null;
}) {
  const evaluatorOptions = api.evalsV2.options.useQuery({
    projectId,
    limit: 100,
    search: searchQuery.trim() || undefined,
  });
  const availableEvaluators = [
    ...(selectedEvaluator ? [selectedEvaluator] : []),
    ...(evaluatorOptions.data ?? []),
  ];
  const selectableEvaluators = availableEvaluators
    .filter((evaluator) => evaluator.type !== "FACET")
    .filter(
      (evaluator, index, evaluators) =>
        evaluators.findIndex((candidate) => candidate.id === evaluator.id) ===
        index,
    )
    .map((evaluator) => ({ value: evaluator.id, label: evaluator.name }));
  return selectableEvaluators;
}

function toScoreDefinitionSource(evaluator: EvaluatorDefinition) {
  const latestVersion = evaluator.versions[0];
  return {
    name: evaluator.name,
    type: evaluator.type,
    outputDefinition: latestVersion?.outputDefinition,
    questions: latestVersion?.questions,
  };
}

function formatAttachmentSummary(ruleNames: string[]) {
  if (ruleNames.length <= 2) return ruleNames.join(", ");
  return `${ruleNames.slice(0, 2).join(", ")} +${ruleNames.length - 2} more`;
}
