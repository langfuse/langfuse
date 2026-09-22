import { useMemo, useRef } from "react";

import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { ModelParameters } from "@/src/components/ModelParameters";
import { Label } from "@/src/components/ui/label";
import { getDefaultAdapterParams } from "@/src/features/playground/page/hooks/useModelParams";
import {
  getLlmConnectionOptions,
  resolveConnectionProvider,
} from "@/src/features/playground/page/hooks/llmConnectionOptions";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import { getEnabledModelParamState } from "@/src/utils/getFinalModelParams";
import {
  LLMAdapter,
  parsePromptModelConfig,
  PROMPT_MODEL_CONFIG_INVALID_MESSAGE,
  type UIModelParams,
} from "@langfuse/shared";

/** Keys this section owns inside the prompt's config JSON. */
const OWNED_KEYS = [
  "provider",
  "model",
  "temperature",
  "top_p",
  "max_tokens",
  "maxReasoningTokens",
  "providerOptions",
] as const;

/** Params the picker shows but a prompt never stores. */
const UI_ONLY_KEYS = ["adapter", "maxTemperature"] as const;

type PromptModelConfigSectionProps = {
  value: string;
  onChange: (value: string) => void;
};

const parseConfigObject = (value: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(value);

    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

export const PromptModelConfigSection: React.FC<
  PromptModelConfigSectionProps
> = ({ value, onChange }) => {
  const projectId = useProjectIdFromURL();
  const connections = api.llmApiKey.all.useQuery(
    { projectId: projectId as string },
    { enabled: Boolean(projectId) },
  );

  const configObject = parseConfigObject(value);
  const parsedModelConfig = parsePromptModelConfig(configObject);
  const isEnabled = parsedModelConfig.status !== "none";

  const pinned =
    parsedModelConfig.status === "valid" ? parsedModelConfig.modelConfig : {};
  const { provider, model, ...pinnedParams } = pinned;

  const {
    availableProviders,
    availableModels,
    providerModelCombinations,
    selectedConnection,
  } = useMemo(
    () =>
      getLlmConnectionOptions({
        connections: connections.data?.data ?? [],
        selectedProvider:
          resolveConnectionProvider(connections.data?.data ?? [], {
            provider,
            model,
          }) ?? "",
        extraModel: { provider, model },
      }),
    [connections.data?.data, provider, model],
  );

  const adapter = selectedConnection?.adapter ?? LLMAdapter.OpenAI;
  const modelParams: UIModelParams = {
    ...getDefaultAdapterParams(adapter),
    ...getEnabledModelParamState(pinnedParams),
    provider: { value: selectedConnection?.provider ?? "", enabled: true },
    model: { value: model ?? "", enabled: true },
  };

  // The model picker sets provider and model in two synchronous calls, so
  // writes are applied to the last one rather than to this render's value.
  const latestConfig = useRef(configObject);
  latestConfig.current = configObject;

  const writeConfig = (
    mutate: (previous: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    const next = mutate({ ...(latestConfig.current ?? {}) });
    latestConfig.current = next;

    onChange(JSON.stringify(next, null, 2));
  };

  const setEnabled = (enabled: boolean) => {
    if (!enabled) {
      return writeConfig((previous) => {
        OWNED_KEYS.forEach((key) => delete previous[key]);

        return previous;
      });
    }

    const [firstProvider, firstModel] = (
      providerModelCombinations[0] ?? ""
    ).split(": ");

    writeConfig((previous) => ({
      ...previous,
      ...(firstProvider ? { provider: firstProvider } : {}),
      ...(firstModel ? { model: firstModel } : {}),
    }));
  };

  const updateModelParamValue: React.ComponentProps<
    typeof ModelParameters
  >["updateModelParamValue"] = (key, paramValue) => {
    if (UI_ONLY_KEYS.includes(key as (typeof UI_ONLY_KEYS)[number])) return;

    writeConfig((previous) => ({ ...previous, [key]: paramValue }));
  };

  const setModelParamEnabled: React.ComponentProps<
    typeof ModelParameters
  >["setModelParamEnabled"] = (key, enabled) => {
    if (UI_ONLY_KEYS.includes(key as (typeof UI_ONLY_KEYS)[number])) return;

    writeConfig((previous) => {
      if (enabled) {
        previous[key] = modelParams[key].value;
      } else {
        delete previous[key];
      }

      return previous;
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>Model</Label>
      <p className="text-muted-foreground text-sm">
        Pin the model and inference parameters this prompt should run with. They
        are stored on the prompt&apos;s config and pre-fill the playground and
        experiment runs.
      </p>
      {configObject === null ? (
        <p className="text-muted-foreground text-sm">
          Set the config below to a JSON object to pin a model.
        </p>
      ) : (
        <>
          <label className="flex flex-row items-center gap-3 rounded-md border p-3">
            <Checkbox
              checked={isEnabled}
              onCheckedChange={(checked) => setEnabled(Boolean(checked))}
            />
            <span className="text-sm">Pin a model on this prompt</span>
          </label>
          {parsedModelConfig.status === "invalid" && (
            <p className="text-dark-yellow text-sm">
              {PROMPT_MODEL_CONFIG_INVALID_MESSAGE}
            </p>
          )}
          {parsedModelConfig.status === "valid" && (
            <ModelParameters
              {...{
                modelParams,
                availableModels,
                providerModelCombinations,
                availableProviders,
                updateModelParamValue,
                setModelParamEnabled,
                isEmbedded: true,
              }}
            />
          )}
        </>
      )}
    </div>
  );
};
