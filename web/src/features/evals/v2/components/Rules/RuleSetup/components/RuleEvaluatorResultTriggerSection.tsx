import { Plus } from "lucide-react";
import { useState } from "react";
import { useStore } from "zustand";
import type { ScoreResultTrigger } from "@langfuse/shared";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import type { RuleSetupStore } from "@/src/features/evals/v2/types/rules";
import { useDebounce } from "@/src/hooks/useDebounce";
import { api } from "@/src/utils/api";
import {
  DEFAULT_SCORE_RESULT_PREDICATE,
  RuleEvaluatorResultPredicateRow,
} from "./RuleEvaluatorResultPredicateRow";

type ScorePredicate = ScoreResultTrigger["predicates"][number];

export function RuleEvaluatorResultTriggerSection({
  projectId,
  store,
}: {
  projectId: string;
  store: RuleSetupStore;
}) {
  const trigger = useStore(store, (state) => state.scoreResultTrigger);
  const setTrigger = store.getState().actions.setScoreResultTrigger;
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(setSearchQuery, 300, false);
  const selectableEvaluators = useSelectableEvaluators({
    projectId,
    searchQuery,
    selectedEvaluatorId: trigger?.evaluatorId ?? null,
  });
  const handleEvaluatorChange = (evaluatorId: string) => {
    setTrigger({
      evaluatorId,
      predicates:
        trigger && trigger.predicates.length > 0
          ? trigger.predicates
          : [DEFAULT_SCORE_RESULT_PREDICATE],
    });
    debouncedSearch("");
    store.getState().actions.setPreviewSourceRuleId(null);
    store.getState().actions.setPreviewFilter([]);
  };
  const handleSearchChange = (value: string) => {
    debouncedSearch(value);
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
    setTrigger({
      ...trigger,
      predicates: [...trigger.predicates, DEFAULT_SCORE_RESULT_PREDICATE],
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <p className="text-sm">Filter evaluator results</p>
        <Badge text="Experimental" color="yellow" size="sm" />
      </div>
      <p className="text-muted-foreground text-sm">
        Run when one evaluator execution returns scores matching every
        condition.
      </p>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm" htmlFor="trigger-evaluator">
          Evaluator
        </label>
        <SelectInput
          id="trigger-evaluator"
          value={trigger?.evaluatorId ?? ""}
          options={selectableEvaluators}
          onValueChange={handleEvaluatorChange}
          placeholder="Select an evaluator"
          emptyMessage="No evaluators found."
          search={{
            placeholder: "Search evaluators...",
            onValueChange: handleSearchChange,
          }}
        />
      </div>

      {trigger?.predicates.map((predicate, index) => (
        <RuleEvaluatorResultPredicateRow
          key={index}
          index={index}
          predicate={predicate}
          canRemove={trigger.predicates.length > 1}
          onChange={handlePredicateChange}
          onRemove={handlePredicateRemove}
        />
      ))}

      <div>
        <Button
          text="Add score condition"
          variant="ghost"
          size="sm"
          icon={Plus}
          disabled={!trigger || trigger.predicates.length >= 20}
          onClick={handleAddPredicate}
        />
      </div>
    </div>
  );
}

function useSelectableEvaluators({
  projectId,
  searchQuery,
  selectedEvaluatorId,
}: {
  projectId: string;
  searchQuery: string;
  selectedEvaluatorId: string | null;
}) {
  const evaluatorOptions = api.evalsV2.options.useQuery({
    projectId,
    limit: 100,
    search: searchQuery.trim() || undefined,
  });
  const selectedEvaluator = api.evalsV2.get.useQuery(
    {
      projectId,
      evaluatorId: selectedEvaluatorId ?? "",
    },
    {
      enabled:
        selectedEvaluatorId !== null &&
        !(evaluatorOptions.data ?? []).some(
          (evaluator) => evaluator.id === selectedEvaluatorId,
        ),
    },
  );
  const availableEvaluators = [
    ...(selectedEvaluator.data ? [selectedEvaluator.data] : []),
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
