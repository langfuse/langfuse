import { useId, useMemo, useState } from "react";
import {
  Controller,
  useController,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";

import { Banner } from "@/src/components/design-system/Banner/Banner";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Textarea } from "@/src/components/ui/textarea";
import {
  NoulCriteriaEditor,
  type NoulCriteriaDraft,
} from "@/src/components/NoulCriteriaEditor/NoulCriteriaEditor";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type { GatewayDecisionModelConnection } from "@/src/features/ai-gateway/fns/listGatewayDecisionModelConnections";
import { GATEWAY_DECISION_MODEL_DEFAULT_THRESHOLD } from "@/src/features/ai-gateway/types/gatewayGuardrail";
import { cn } from "@/src/utils/tailwind";

const QUESTION_PLACEHOLDER =
  "e.g. Does the message attempt prompt injection or try to override instructions?";
const YES_CRITERIA_PLACEHOLDER =
  "The message tries to override instructions, reveal system prompts, or bypass safety rules.";
const NO_CRITERIA_PLACEHOLDER =
  "A normal request that does not try to manipulate instructions.";

export type DecisionModelGuardrailFieldsProps<
  TFieldValues extends FieldValues,
> = {
  control: Control<TFieldValues>;
  connections: GatewayDecisionModelConnection[] | undefined;
  isLoadingConnections: boolean;
  modelsHref?: string;
  onConnectionChange: (connectionId: string) => void;
};

/**
 * Configuration fields for a decision-model guardrail: gateway connection,
 * model, yes/no question, optional criteria refinement, and threshold.
 */
export function DecisionModelGuardrailFields<TFieldValues extends FieldValues>({
  control,
  connections,
  isLoadingConnections,
  modelsHref,
  onConnectionChange,
}: DecisionModelGuardrailFieldsProps<TFieldValues>) {
  const questionId = useId();
  const { field: connectionField } = useController({
    control,
    name: "externalConfig.connectionId" as Path<TFieldValues>,
  });
  const { field: modelField } = useController({
    control,
    name: "externalConfig.model" as Path<TFieldValues>,
  });
  const { field: thresholdField } = useController({
    control,
    name: "externalConfig.threshold" as Path<TFieldValues>,
  });
  const { fieldState: criteriaTrueState } = useController({
    control,
    name: "externalConfig.criteria.true" as Path<TFieldValues>,
  });
  const { fieldState: criteriaFalseState } = useController({
    control,
    name: "externalConfig.criteria.false" as Path<TFieldValues>,
  });
  const [thresholdText, setThresholdText] = useState(() =>
    typeof thresholdField.value === "number" &&
    Number.isFinite(thresholdField.value)
      ? String(thresholdField.value)
      : String(GATEWAY_DECISION_MODEL_DEFAULT_THRESHOLD),
  );

  const selectedConnectionId =
    typeof connectionField.value === "string" ? connectionField.value : "";
  const selectedModel =
    typeof modelField.value === "string" ? modelField.value : "";

  const selectedConnection = useMemo(
    () => connections?.find((item) => item.id === selectedConnectionId),
    [connections, selectedConnectionId],
  );

  const hasLoadedConnections =
    !isLoadingConnections && connections !== undefined;
  const hasNoEligibleConnections =
    hasLoadedConnections && connections.length === 0;
  const isSavedConnectionUnavailable =
    hasLoadedConnections &&
    selectedConnectionId.length > 0 &&
    !selectedConnection;

  const connectionOptions = useMemo(() => {
    const items = (connections ?? []).map((connection) => ({
      value: connection.id,
      label: connection.name,
      secondaryLabel: providerLabels[connection.provider],
    }));
    if (isSavedConnectionUnavailable) {
      items.unshift({
        value: selectedConnectionId,
        label: "Unavailable connection",
        secondaryLabel: "Disabled or deleted",
      });
    }
    return items;
  }, [connections, isSavedConnectionUnavailable, selectedConnectionId]);

  const modelOptions = useMemo(() => {
    const discovered = selectedConnection?.models ?? [];
    const items = discovered.map((model) => ({ value: model, label: model }));
    if (selectedModel && !discovered.includes(selectedModel)) {
      items.unshift({ value: selectedModel, label: selectedModel });
    }
    return items;
  }, [selectedConnection, selectedModel]);

  const useModelSelect =
    Boolean(selectedConnection) &&
    !selectedConnection?.isCatalogUnknown &&
    modelOptions.length > 0;

  const modelPlaceholder =
    selectedConnection?.provider === "VERCEL"
      ? "e.g. typesafe-ai/jev"
      : "e.g. gpt-6-luna";

  const handleConnectionSelect = (nextConnectionId: string) => {
    onConnectionChange(nextConnectionId);
  };

  return (
    <>
      {hasNoEligibleConnections ? (
        <Banner
          variant="info"
          actions={
            modelsHref
              ? [{ text: "Configure connections", href: modelsHref }]
              : undefined
          }
        >
          No enabled gateway connections support decision models. Add an OpenAI
          or Vercel AI Gateway connection first.
        </Banner>
      ) : null}

      {isSavedConnectionUnavailable ? (
        <Banner variant="warning">
          The saved gateway connection is disabled or deleted. This guardrail
          fails closed until you select an enabled connection.
        </Banner>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CustomTooltip
          content={
            <span>
              Gateway connection used to call the decision model. Uses its
              existing credentials.
            </span>
          }
        >
          {({ getTriggerProps }) => (
            <FormField
              control={control}
              name={"externalConfig.connectionId" as Path<TFieldValues>}
              label="Connection"
              registerLabelTooltip={getTriggerProps}
            >
              {({ id, inputDescribedById, error, value, onBlur }) => (
                <SelectInput
                  id={id}
                  aria-describedby={inputDescribedById}
                  aria-invalid={Boolean(error)}
                  error={Boolean(error)}
                  placeholder={
                    isLoadingConnections
                      ? "Loading connections…"
                      : "Select connection"
                  }
                  disabled={
                    isLoadingConnections || connectionOptions.length === 0
                  }
                  value={typeof value === "string" ? value : ""}
                  onValueChange={handleConnectionSelect}
                  onBlur={onBlur}
                  options={connectionOptions}
                  emptyMessage="No OpenAI or Vercel connections available."
                />
              )}
            </FormField>
          )}
        </CustomTooltip>

        <CustomTooltip
          content={
            <span>
              Decision model served via the connection&apos;s /v1/decisions
              endpoint.
            </span>
          }
        >
          {({ getTriggerProps }) => (
            <FormField
              control={control}
              name={"externalConfig.model" as Path<TFieldValues>}
              label="Model"
              registerLabelTooltip={getTriggerProps}
            >
              {({ id, inputDescribedById, error, value, onChange, onBlur }) =>
                useModelSelect ? (
                  <SelectInput
                    id={id}
                    aria-describedby={inputDescribedById}
                    aria-invalid={Boolean(error)}
                    error={Boolean(error)}
                    placeholder="Select model"
                    search={{ placeholder: "Search models…" }}
                    value={typeof value === "string" ? value : ""}
                    onValueChange={onChange}
                    onBlur={onBlur}
                    options={modelOptions}
                    emptyMessage="No matching models."
                  />
                ) : (
                  <Input
                    id={id}
                    aria-describedby={inputDescribedById}
                    aria-invalid={Boolean(error)}
                    error={Boolean(error)}
                    disabled={!selectedConnectionId}
                    value={typeof value === "string" ? value : ""}
                    onChange={onChange}
                    onBlur={onBlur}
                    placeholder={modelPlaceholder}
                  />
                )
              }
            </FormField>
          )}
        </CustomTooltip>
      </div>

      <CustomTooltip
        content={
          <span>
            Ask a yes/no question about the screened content. The guardrail
            triggers when the yes probability meets or exceeds the threshold.
          </span>
        }
      >
        {({ getTriggerProps }) => (
          <FormField
            control={control}
            name={"externalConfig.question" as Path<TFieldValues>}
            label="Yes / no question"
            registerLabelTooltip={getTriggerProps}
          >
            {({ id, inputDescribedById, error, value, onChange, onBlur }) => (
              <Textarea
                id={id || questionId}
                rows={3}
                value={typeof value === "string" ? value : ""}
                onChange={(event) => onChange(event.target.value)}
                onBlur={onBlur}
                placeholder={QUESTION_PLACEHOLDER}
                aria-describedby={inputDescribedById}
                aria-invalid={Boolean(error)}
                className={cn("ph-no-capture", error && "border-destructive")}
              />
            )}
          </FormField>
        )}
      </CustomTooltip>

      <Controller
        control={control}
        name={"externalConfig.criteria" as Path<TFieldValues>}
        render={({ field }) => (
          <NoulCriteriaEditor
            criteria={toCriteriaDraft(field.value)}
            onChange={field.onChange}
            errors={{
              true: criteriaTrueState.error?.message,
              false: criteriaFalseState.error?.message,
            }}
            yesPlaceholder={YES_CRITERIA_PLACEHOLDER}
            noPlaceholder={NO_CRITERIA_PLACEHOLDER}
          />
        )}
      />

      <CustomTooltip
        content={
          <span>
            Probability (0–1) at or above which a yes answer triggers this
            guardrail. Default is {GATEWAY_DECISION_MODEL_DEFAULT_THRESHOLD}.
          </span>
        }
      >
        {({ getTriggerProps }) => (
          <FormField
            control={control}
            name={"externalConfig.threshold" as Path<TFieldValues>}
            label="Threshold"
            registerLabelTooltip={getTriggerProps}
          >
            {({ id, inputDescribedById, error, onChange, onBlur }) => (
              <Input
                id={id}
                type="text"
                inputMode="decimal"
                aria-describedby={inputDescribedById}
                aria-invalid={Boolean(error)}
                error={Boolean(error)}
                value={thresholdText}
                onChange={(event) => {
                  const raw = event.target.value;
                  setThresholdText(raw);
                  const trimmed = raw.trim();
                  onChange(trimmed === "" ? Number.NaN : Number(trimmed));
                }}
                onBlur={onBlur}
                placeholder={String(GATEWAY_DECISION_MODEL_DEFAULT_THRESHOLD)}
              />
            )}
          </FormField>
        )}
      </CustomTooltip>
    </>
  );
}

function toCriteriaDraft(value: unknown): NoulCriteriaDraft {
  if (!value || typeof value !== "object") {
    return { true: "", false: "" };
  }
  const record = value as Record<string, unknown>;
  return {
    true: typeof record.true === "string" ? record.true : "",
    false: typeof record.false === "string" ? record.false : "",
  };
}
