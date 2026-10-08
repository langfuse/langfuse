import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useStore } from "zustand";
import type { ScoreResultTrigger } from "@langfuse/shared";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import type { RuleSetupStore } from "@/src/features/evals/v2/types/rules";
import { useDebounce } from "@/src/hooks/useDebounce";
import { api } from "@/src/utils/api";

type ScorePredicate = ScoreResultTrigger["predicates"][number];

const DATA_TYPE_OPTIONS = [
  { value: "BOOLEAN", label: "Boolean" },
  { value: "NUMERIC", label: "Numeric" },
  { value: "CATEGORICAL", label: "Categorical" },
  { value: "TEXT", label: "Text" },
] as const;

const DEFAULT_PREDICATE: ScorePredicate = {
  scoreName: "",
  dataType: "BOOLEAN",
  operator: "=",
  value: false,
};

function predicateForDataType(
  dataType: ScorePredicate["dataType"],
  scoreName: string,
): ScorePredicate {
  switch (dataType) {
    case "BOOLEAN":
      return { scoreName, dataType, operator: "=", value: false };
    case "NUMERIC":
      return { scoreName, dataType, operator: "=", value: 0 };
    case "CATEGORICAL":
    case "TEXT":
      return { scoreName, dataType, operator: "=", value: "" };
  }
}

function getOperatorOptions(dataType: ScorePredicate["dataType"]) {
  if (dataType === "NUMERIC") {
    return ["=", "!=", ">", ">=", "<", "<="].map((value) => ({
      value,
      label: value,
    }));
  }
  if (dataType === "BOOLEAN") return [{ value: "=", label: "=" }];
  return ["=", "!="].map((value) => ({ value, label: value }));
}

export function RuleEvaluatorResultTriggerSection({
  projectId,
  store,
}: {
  projectId: string;
  store: RuleSetupStore;
}) {
  const trigger = useStore(store, (state) => state.scoreResultTrigger);
  const setTrigger = store.getState().actions.setScoreResultTrigger;
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(setSearchQuery, 300, false);
  const evaluatorOptions = api.evalsV2.options.useQuery({
    projectId,
    limit: 100,
    search: searchQuery.trim() || undefined,
  });
  const selectedEvaluator = api.evalsV2.get.useQuery(
    {
      projectId,
      evaluatorId: trigger?.evaluatorId ?? "",
    },
    {
      enabled:
        Boolean(trigger?.evaluatorId) &&
        !(evaluatorOptions.data ?? []).some(
          (evaluator) => evaluator.id === trigger?.evaluatorId,
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

  const setPredicates = (predicates: ScorePredicate[]) => {
    if (!trigger) return;
    setTrigger({ ...trigger, predicates });
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
          onValueChange={(evaluatorId) => {
            setTrigger({
              evaluatorId,
              predicates: trigger?.predicates.length
                ? trigger.predicates
                : [DEFAULT_PREDICATE],
            });
            setSearch("");
            debouncedSearch("");
            store.getState().actions.setPreviewSourceRuleId(null);
            store.getState().actions.setPreviewFilter([]);
          }}
          placeholder="Select an evaluator"
          emptyMessage="No evaluators found."
          search={{
            placeholder: "Search evaluators...",
            value: search,
            onValueChange: (value) => {
              setSearch(value);
              debouncedSearch(value);
            },
          }}
        />
      </div>

      {trigger
        ? trigger.predicates.map((predicate, index) => {
            const operatorOptions = getOperatorOptions(predicate.dataType);

            return (
              <div
                key={index}
                className="grid grid-cols-[minmax(10rem,1fr)_9rem_6rem_minmax(8rem,1fr)_2rem] items-end gap-2"
              >
                <div className="flex flex-col gap-1.5">
                  <label className="text-muted-foreground text-xs">
                    Score name
                  </label>
                  <Input
                    value={predicate.scoreName}
                    onChange={(event) => {
                      const predicates = [...trigger.predicates];
                      predicates[index] = {
                        ...predicate,
                        scoreName: event.target.value,
                      };
                      setPredicates(predicates);
                    }}
                    placeholder="e.g. toxicity"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-muted-foreground text-xs">Type</label>
                  <SelectInput
                    value={predicate.dataType}
                    options={[...DATA_TYPE_OPTIONS]}
                    onValueChange={(dataType) => {
                      const predicates = [...trigger.predicates];
                      predicates[index] = predicateForDataType(
                        dataType,
                        predicate.scoreName,
                      );
                      setPredicates(predicates);
                    }}
                    placeholder="Type"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-muted-foreground text-xs">
                    Operator
                  </label>
                  <SelectInput
                    value={predicate.operator}
                    options={operatorOptions}
                    onValueChange={(operator) => {
                      const predicates = [...trigger.predicates];
                      predicates[index] = {
                        ...predicate,
                        operator,
                      } as ScorePredicate;
                      setPredicates(predicates);
                    }}
                    placeholder="Operator"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-muted-foreground text-xs">Value</label>
                  {predicate.dataType === "BOOLEAN" ? (
                    <SelectInput
                      value={String(predicate.value)}
                      options={[
                        { value: "false", label: "false" },
                        { value: "true", label: "true" },
                      ]}
                      onValueChange={(value) => {
                        const predicates = [...trigger.predicates];
                        predicates[index] = {
                          ...predicate,
                          value: value === "true",
                        };
                        setPredicates(predicates);
                      }}
                      placeholder="Value"
                    />
                  ) : (
                    <Input
                      type={
                        predicate.dataType === "NUMERIC" ? "number" : "text"
                      }
                      value={predicate.value}
                      onChange={(event) => {
                        const predicates = [...trigger.predicates];
                        predicates[index] = {
                          ...predicate,
                          value:
                            predicate.dataType === "NUMERIC"
                              ? event.target.valueAsNumber
                              : event.target.value,
                        } as ScorePredicate;
                        setPredicates(predicates);
                      }}
                      placeholder="Value"
                    />
                  )}
                </div>
                <IconButton
                  icon={Trash2}
                  label="Remove score condition"
                  disabled={trigger.predicates.length === 1}
                  onClick={() =>
                    setPredicates(
                      trigger.predicates.filter(
                        (_, predicateIndex) => predicateIndex !== index,
                      ),
                    )
                  }
                />
              </div>
            );
          })
        : null}

      <div>
        <Button
          text="Add score condition"
          variant="ghost"
          size="sm"
          icon={Plus}
          disabled={!trigger || trigger.predicates.length >= 20}
          onClick={() =>
            trigger
              ? setPredicates([...trigger.predicates, DEFAULT_PREDICATE])
              : undefined
          }
        />
      </div>
    </div>
  );
}
