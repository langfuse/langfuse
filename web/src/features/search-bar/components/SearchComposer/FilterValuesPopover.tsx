import { useState } from "react";
import { X } from "@langfuse/icons";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Button } from "@/src/components/design-system/Button/Button";
import { CategoricalFilterSelect } from "@/src/features/filters/components/CategoricalFilterSelect";
import type { ManagedEnvironmentPolicyConfig } from "@/src/features/filters/lib/managedEnvironmentPolicy";
import { type ScoreTypeContext } from "../../lib/adapter";
import { SCORE_COLUMNS, type FieldRegistry } from "../../lib/fields";
import { type ObservedOptions } from "../../lib/observed-options";
import { validateQuery } from "../../lib/validate";
import {
  applyTokenFacetAction,
  tokenFacetModel,
  type TokenFacetAction,
  type TokenFacetState,
} from "../../lib/fns/tokenFacet";

export function FilterValuesPopover({
  state,
  registry,
  scoreTypes,
  observed,
  canRequestValues = false,
  managedEnvironmentPolicy,
  erroredColumns,
  onApply,
  onClose,
}: {
  state: TokenFacetState;
  registry: FieldRegistry;
  scoreTypes: ScoreTypeContext | undefined;
  observed: ObservedOptions | undefined;
  canRequestValues?: boolean;
  managedEnvironmentPolicy?: ManagedEnvironmentPolicyConfig;
  erroredColumns: ReadonlySet<string> | undefined;
  onApply: (previousQuery: string, nextState: TokenFacetState) => boolean;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const ref = registry.resolveField(state.template.key);
  const { optionKey, requestable } = optionSource(ref, state.template.key);
  const optionValues = observed?.[optionKey] ?? [];
  const displayValues = optionValues.map((option) => ({
    value:
      ref?.type === "field"
        ? (ref.field.displayValueByFilterValue?.get(option.value) ??
          option.value)
        : option.value,
    count: option.count,
  }));
  const available = displayValues.map((option) => option.value);
  const model = tokenFacetModel(
    state,
    available,
    registry,
    managedEnvironmentPolicy,
  );
  const counts = new Map(
    displayValues.map((option) => [option.value, option.count ?? 0]),
  );
  const pending =
    canRequestValues &&
    requestable &&
    observed?.[optionKey] === undefined &&
    !erroredColumns?.has(optionKey);
  const apply = (action: TokenFacetAction) => {
    const next = applyTokenFacetAction(
      state,
      available,
      action,
      registry,
      managedEnvironmentPolicy,
    );
    if (next === state) return;
    const validation = validateQuery(next.query, scoreTypes, registry);
    if (!validation.valid) {
      setError(
        validation.diagnostics.find(
          (diagnostic) => diagnostic.severity === "error",
        )?.message ?? "This selection cannot be applied.",
      );
      return;
    }
    if (!onApply(state.query, next)) {
      setError(
        "The query changed. Close and reopen the value picker to continue.",
      );
      return;
    }
    setError(null);
  };

  return (
    <div className="ph-no-capture flex min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-3">
        <span className="text-sm font-bold">
          {ref?.type === "field"
            ? ref.field.label
            : (state.template.rawKey ?? state.template.key)}
        </span>
        <div className="flex items-center gap-2">
          {state.expression !== null ? (
            <Button
              text="Clear"
              variant="text"
              size="sm"
              onClick={() => apply({ kind: "clear" })}
            />
          ) : null}
          <IconButton
            icon={X}
            label="Close value picker"
            size="sm"
            onClick={onClose}
          />
        </div>
      </div>
      {pending ? (
        <p role="status" className="text-muted-foreground px-3 text-xs">
          Loading values…
        </p>
      ) : null}
      <div className="max-h-[min(420px,55vh)] overflow-y-auto py-1">
        <CategoricalFilterSelect
          filterKey={state.template.key}
          loading={pending && model.options.length === 0}
          options={model.options}
          counts={counts}
          showCounts={optionValues.some((option) => option.count !== undefined)}
          value={model.value}
          operator={model.operator}
          onChange={(values) => apply({ kind: "selection", values })}
          onOnlyChange={(value) => apply({ kind: "only", value })}
          onOperatorChange={
            model.array
              ? (operator) => apply({ kind: "operator", operator })
              : undefined
          }
        />
      </div>
      {error ? (
        <p role="alert" className="text-destructive px-3 text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function optionSource(
  ref: ReturnType<FieldRegistry["resolveField"]>,
  key: string,
) {
  if (ref?.type === "field")
    return {
      optionKey: ref.field.filterColumn ?? ref.field.id,
      requestable:
        ref.field.syncMode === "exactOption" ||
        ref.field.syncMode === "arrayOption",
    };
  if (ref?.type === "scores")
    return {
      optionKey: `${SCORE_COLUMNS[ref.level].categorical}.${ref.key}`,
      requestable: false,
    };
  return { optionKey: key, requestable: false };
}
