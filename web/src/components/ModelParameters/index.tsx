import { useState, useRef, useCallback } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Slider } from "@/src/components/ui/slider";
import { Textarea } from "@/src/components/ui/textarea";
import { CreateLLMApiKeyDialog } from "@/src/features/public-api/components/CreateLLMApiKeyDialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { cn } from "@/src/utils/tailwind";
import {
  type JSONObject,
  JSONObjectSchema,
  type LLMAdapter,
  MODEL_REASONING_LEVELS,
  type ModelReasoningLevel,
  type supportedModels,
  type UIModelParams,
} from "@langfuse/shared";
import { InfoIcon, PlusIcon, Settings2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";

import { LLMApiKeyComponent } from "./LLMApiKeyComponent";
import { FormDescription } from "@/src/components/ui/form";
import { CodeMirrorEditor } from "../editor";
import { Switch } from "@/src/components/design-system/Switch/Switch";

export type ModelParamsContext = {
  modelParams: UIModelParams;
  availableProviders: string[];
  availableModels: string[];
  providerModelCombinations: string[];
  updateModelParamValue: <Key extends keyof UIModelParams>(
    key: Key,
    value: UIModelParams[Key]["value"],
  ) => void;
  setModelParamEnabled?: (key: keyof UIModelParams, enabled: boolean) => void;
  formDisabled?: boolean;
  modelParamsDescription?: string;
  customHeader?: React.ReactNode;
  layout?: "compact" | "vertical";
  isEmbedded?: boolean;
};

export const ModelParameters: React.FC<ModelParamsContext> = ({
  modelParams,
  availableProviders,
  availableModels,
  providerModelCombinations,
  updateModelParamValue,
  setModelParamEnabled,
  formDisabled = false,
  modelParamsDescription,
  customHeader,
  layout = "vertical",
  isEmbedded = false,
}) => {
  const projectId = useProjectIdFromURL();
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  const modelSettingsUsed = Object.entries(modelParams).some(
    ([key, value]) =>
      !["adapter", "provider", "model", "maxTemperature"].includes(key) &&
      value.enabled,
  );

  // Standalone dialog for the "no providers yet" empty state (renders its own
  // trigger button, not inside a dropdown).
  const [createLlmApiKeyDialogOpen, setCreateLlmApiKeyDialogOpen] =
    useState(false);
  // Coordinates the inline "Add LLM Connection" action inside the combined
  // provider/model Select (compact layout) — see useAddLlmConnectionSelect.
  const providerSelect = useAddLlmConnectionSelect();

  if (!projectId) return null;

  if (availableProviders.length === 0) {
    return (
      <div className="flex flex-col space-y-4 pr-1">
        {customHeader ? (
          customHeader
        ) : (
          <div className="flex items-center justify-between">
            <p className="font-semibold">Model</p>
          </div>
        )}
        <p className="text-xs">No LLM API key set in project. </p>
        <CreateLLMApiKeyDialog
          open={createLlmApiKeyDialogOpen}
          setOpen={setCreateLlmApiKeyDialogOpen}
        />
      </div>
    );
  }

  // Settings button component for reuse
  const SettingsButton = (
    <Popover open={modelSettingsOpen} onOpenChange={setModelSettingsOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label="Configure model settings"
          variant="outline"
          size="icon"
          className="relative h-7 w-7"
          disabled={formDisabled}
        >
          <Settings2 size={14} />
          {modelSettingsUsed && (
            <div className="bg-primary absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="max-h-[calc(var(--radix-popover-content-available-height)-1rem)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto p-4"
        align={layout === "compact" ? "start" : "end"}
        sideOffset={5}
      >
        <div className="mb-3">
          <h4 className="mb-1 text-sm font-medium">Model Advanced Settings</h4>
          <p className="text-muted-foreground text-xs">
            Configure advanced parameters for your model.
          </p>
        </div>
        <div className="space-y-4">
          <ModelParamsSlider
            title="Temperature"
            modelParamsKey="temperature"
            formDisabled={formDisabled}
            enabled={modelParams.temperature.enabled}
            setModelParamEnabled={setModelParamEnabled}
            value={modelParams.temperature.value}
            min={0}
            max={modelParams.maxTemperature.value}
            step={0.01}
            tooltip="The sampling temperature. Higher values will make the output more random, while lower values will make it more focused and deterministic."
            updateModelParam={updateModelParamValue}
          />
          <ModelParamsNumberInput
            title="Output token limit"
            modelParamsKey="maxOutputTokens"
            formDisabled={formDisabled}
            enabled={modelParams.maxOutputTokens.enabled}
            setModelParamEnabled={setModelParamEnabled}
            value={modelParams.maxOutputTokens.value}
            min={1}
            tooltip="The maximum number of tokens that can be generated in the chat completion."
            updateModelParam={updateModelParamValue}
          />
          <ModelParamsSlider
            title="Top P"
            modelParamsKey="topP"
            formDisabled={formDisabled}
            enabled={modelParams.topP.enabled}
            setModelParamEnabled={setModelParamEnabled}
            value={modelParams.topP.value}
            min={0}
            max={1}
            step={0.01}
            tooltip="An alternative to temperature called nucleus sampling. A value of 0.1 limits sampling to tokens comprising the top 10% probability mass. Most use cases should change either Top P or temperature, not both."
            updateModelParam={updateModelParamValue}
          />
          <ModelParamsNumberInput
            title="Top K"
            modelParamsKey="topK"
            formDisabled={formDisabled}
            enabled={modelParams.topK.enabled}
            setModelParamEnabled={setModelParamEnabled}
            value={modelParams.topK.value}
            min={1}
            tooltip="Only sample from the K most likely next tokens. Most use cases should prefer temperature or Top P."
            updateModelParam={updateModelParamValue}
          />
          <ModelParamsSlider
            title="Presence penalty"
            modelParamsKey="presencePenalty"
            formDisabled={formDisabled}
            enabled={modelParams.presencePenalty.enabled}
            setModelParamEnabled={setModelParamEnabled}
            value={modelParams.presencePenalty.value}
            min={-1}
            max={1}
            step={0.01}
            tooltip="Adjusts the likelihood of repeating information already present in the prompt or response."
            updateModelParam={updateModelParamValue}
          />
          <ModelParamsSlider
            title="Frequency penalty"
            modelParamsKey="frequencyPenalty"
            formDisabled={formDisabled}
            enabled={modelParams.frequencyPenalty.enabled}
            setModelParamEnabled={setModelParamEnabled}
            value={modelParams.frequencyPenalty.value}
            min={-1}
            max={1}
            step={0.01}
            tooltip="Adjusts the likelihood of repeatedly using the same words or phrases."
            updateModelParam={updateModelParamValue}
          />
          <ModelParamsReasoningSelect
            value={modelParams.reasoning.value}
            enabled={modelParams.reasoning.enabled}
            formDisabled={formDisabled}
            updateModelParam={updateModelParamValue}
            setModelParamEnabled={setModelParamEnabled}
          />
          <ModelParamsNumberInput
            title="Seed"
            modelParamsKey="seed"
            value={modelParams.seed.value}
            enabled={modelParams.seed.enabled}
            formDisabled={formDisabled}
            tooltip="An integer seed for deterministic sampling when supported by the selected model."
            updateModelParam={updateModelParamValue}
            setModelParamEnabled={setModelParamEnabled}
          />
          <ModelParamsTextListInput
            key={`stop-sequences-${modelParams.provider.value}:${modelParams.model.value}`}
            value={modelParams.stopSequences.value}
            enabled={modelParams.stopSequences.enabled}
            formDisabled={formDisabled}
            updateModelParam={updateModelParamValue}
            setModelParamEnabled={setModelParamEnabled}
          />
          <ProviderOptionsInput
            key={`provider-options-${modelParams.provider.value}:${modelParams.model.value}`}
            value={modelParams.providerOptions.value}
            formDisabled={formDisabled}
            enabled={modelParams.providerOptions.enabled}
            setModelParamEnabled={setModelParamEnabled}
            updateModelParam={updateModelParamValue}
          />
          <LLMApiKeyComponent {...{ projectId, modelParams }} />
        </div>
      </PopoverContent>
    </Popover>
  );

  // Compact layout - single horizontal row following standard codebase patterns
  if (layout === "compact") {
    // Create combined options in "Provider: model" format
    // We create combinations of all available providers with all available models

    // Current combined value in "Provider: model" format
    const currentCombinedValue = `${modelParams.provider.value}: ${modelParams.model.value}`;

    const handleCombinedSelection = (combinedValue: string) => {
      // Parse the combined value back into provider and model
      const colonIndex = combinedValue.indexOf(": ");
      if (colonIndex !== -1) {
        const provider = combinedValue.substring(0, colonIndex);
        const model = combinedValue.substring(colonIndex + 2);
        updateModelParamValue("provider", provider);
        updateModelParamValue("model", model);
      }
    };

    return (
      <div className="flex flex-col space-y-2 pt-2 pr-1 pb-1">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <Select
              open={providerSelect.selectOpen}
              onOpenChange={providerSelect.setSelectOpen}
              disabled={formDisabled}
              onValueChange={(value) => {
                providerSelect.notifySelection();
                handleCombinedSelection(value);
              }}
              value={currentCombinedValue}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(providerModelCombinations ?? []).map((option) => (
                  <SelectItem value={option} key={option}>
                    {option}
                  </SelectItem>
                ))}
                <AddLlmConnectionSelectAction
                  onOpen={providerSelect.openConnectionDialog}
                />
              </SelectContent>
            </Select>
            {/* Dialog lives OUTSIDE the SelectContent so closing the Select does
                not unmount it (see useAddLlmConnectionSelect). */}
            <CreateLLMApiKeyDialog
              hideTrigger
              open={providerSelect.dialogOpen}
              setOpen={providerSelect.handleDialogOpenChange}
            />
            {modelParamsDescription ? (
              <FormDescription className="mt-1 text-xs">
                {modelParamsDescription}
              </FormDescription>
            ) : undefined}
          </div>
          <div className="shrink-0">{SettingsButton}</div>
        </div>
      </div>
    );
  }

  // Vertical layout (default) - existing behavior
  return (
    <div
      className={cn("flex flex-col", !isEmbedded && "space-y-2 pt-2 pr-1 pb-1")}
    >
      {!isEmbedded ? (
        <div className="flex items-center justify-between">
          {customHeader ? customHeader : <p className="font-semibold">Model</p>}
          {SettingsButton}
        </div>
      ) : (
        <div className="mb-2 flex justify-end">{SettingsButton}</div>
      )}

      <div className="space-y-4">
        <div className="space-y-3">
          <ModelParamsSelect
            title="Provider"
            modelParamsKey="provider"
            disabled={formDisabled}
            value={modelParams.provider.value}
            options={availableProviders}
            updateModelParam={updateModelParamValue}
            layout="vertical"
          />
          <ModelParamsSelect
            title="Model name"
            modelParamsKey="model"
            disabled={formDisabled}
            value={modelParams.model.value}
            options={[...new Set(availableModels)]}
            updateModelParam={updateModelParamValue}
            modelParamsDescription={modelParamsDescription}
            layout="vertical"
          />
        </div>
      </div>
    </div>
  );
};

type ModelParamsSelectProps = {
  title: string;
  modelParamsKey: keyof UIModelParams;
  value: string;
  options: string[];
  updateModelParam: ModelParamsContext["updateModelParamValue"];
  disabled?: boolean;
  modelParamsDescription?: string;
  layout?: "vertical" | "compact";
};
const ModelParamsSelect = ({
  title,
  modelParamsKey,
  value,
  options,
  updateModelParam,
  disabled,
  modelParamsDescription,
  layout = "vertical",
}: ModelParamsSelectProps) => {
  const providerSelect = useAddLlmConnectionSelect();

  const handleValueChange = (next: string) => {
    providerSelect.notifySelection();
    updateModelParam(
      modelParamsKey,
      next as (typeof supportedModels)[LLMAdapter][number],
    );
  };

  // Dialog lives OUTSIDE the SelectContent so closing the Select does not
  // unmount it (see useAddLlmConnectionSelect).
  const connectionDialog = (
    <CreateLLMApiKeyDialog
      hideTrigger
      open={providerSelect.dialogOpen}
      setOpen={providerSelect.handleDialogOpenChange}
    />
  );

  // Compact layout - simplified, space-efficient (no individual labels)
  if (layout === "compact") {
    return (
      <div className="space-y-1">
        <Select
          open={providerSelect.selectOpen}
          onOpenChange={providerSelect.setSelectOpen}
          disabled={disabled}
          onValueChange={handleValueChange}
          value={value}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem value={option} key={option}>
                {option}
              </SelectItem>
            ))}
            <AddLlmConnectionSelectAction
              onOpen={providerSelect.openConnectionDialog}
            />
          </SelectContent>
        </Select>
        {connectionDialog}
        {modelParamsDescription ? (
          <FormDescription className="mt-1 text-xs">
            {modelParamsDescription}
          </FormDescription>
        ) : undefined}
      </div>
    );
  }

  // Vertical layout (default) - existing behavior
  return (
    <div className="flex items-center gap-4">
      <div className="w-24 shrink-0">
        <p
          className={cn(
            "text-xs font-semibold",
            disabled && "text-muted-foreground",
          )}
        >
          {title}
        </p>
      </div>
      <div className="flex-1">
        <Select
          open={providerSelect.selectOpen}
          onOpenChange={providerSelect.setSelectOpen}
          disabled={disabled}
          onValueChange={handleValueChange}
          value={value}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem value={option} key={option}>
                {option}
              </SelectItem>
            ))}
            <AddLlmConnectionSelectAction
              onOpen={providerSelect.openConnectionDialog}
            />
          </SelectContent>
        </Select>
        {connectionDialog}
        {modelParamsDescription ? (
          <FormDescription className="mt-1 text-xs">
            {modelParamsDescription}
          </FormDescription>
        ) : undefined}
      </div>
    </div>
  );
};

type ModelParamsSliderProps = {
  title: string;
  modelParamsKey: keyof UIModelParams;
  value: number;
  tooltip: string;
  min: number;
  max: number;
  step: number;
  updateModelParam: ModelParamsContext["updateModelParamValue"];
  enabled?: boolean;
  formDisabled?: boolean;
  setModelParamEnabled?: ModelParamsContext["setModelParamEnabled"];
};
const ModelParamsSlider = ({
  title,
  modelParamsKey,
  value,
  tooltip,
  min,
  max,
  step,
  updateModelParam,
  setModelParamEnabled,
  enabled,
  formDisabled,
}: ModelParamsSliderProps) => {
  return (
    <div className="space-y-3" title={tooltip}>
      <div className="flex flex-row">
        <p
          className={cn(
            "flex-1 text-xs font-semibold",
            (!enabled || formDisabled) && "text-muted-foreground",
          )}
        >
          {title}
        </p>
        <div className="flex flex-row space-x-3">
          <Input
            className="h-6 w-14 appearance-none px-2 text-right"
            type="number"
            disabled={!enabled || formDisabled}
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event) => {
              const nextValue = Number.parseFloat(event.target.value);
              if (Number.isNaN(nextValue)) return;
              updateModelParam(
                modelParamsKey,
                Math.max(Math.min(nextValue, max), min),
              );
            }}
          />
          {setModelParamEnabled ? (
            <Switch
              title={`Control sending the ${title} parameter`}
              disabled={formDisabled}
              checked={enabled}
              onCheckedChange={(checked) => {
                setModelParamEnabled(modelParamsKey, checked);
              }}
            />
          ) : null}
        </div>
      </div>
      <Slider
        disabled={!enabled || formDisabled}
        min={min}
        max={max}
        step={step}
        onValueChange={(value) => {
          if (value[0] !== undefined)
            updateModelParam(modelParamsKey, value[0]);
        }}
        value={[value]}
      />
    </div>
  );
};

type ModelParamsReasoningSelectProps = {
  value: ModelReasoningLevel;
  updateModelParam: ModelParamsContext["updateModelParamValue"];
  setModelParamEnabled: ModelParamsContext["setModelParamEnabled"];
  enabled: boolean;
  formDisabled: boolean;
};

const ModelParamsReasoningSelect = ({
  value,
  updateModelParam,
  setModelParamEnabled,
  enabled,
  formDisabled,
}: ModelParamsReasoningSelectProps) => (
  <div className="space-y-3">
    <div className="flex items-center gap-3">
      <div className="flex flex-1 items-center gap-1">
        <span
          className={cn(
            "text-xs font-semibold",
            (!enabled || formDisabled) && "text-muted-foreground",
          )}
        >
          Reasoning effort
        </span>
        <Tooltip>
          <TooltipTrigger aria-label="About reasoning effort">
            <InfoIcon className="text-muted-foreground size-3" />
          </TooltipTrigger>
          <TooltipContent className="max-w-[240px] p-2">
            Portable AI SDK reasoning intent. The provider adapter maps this to
            reasoning effort, adaptive thinking, or a token budget. Exact
            provider options override this setting.
          </TooltipContent>
        </Tooltip>
      </div>
      <Switch
        title="Control sending the reasoning effort parameter"
        disabled={formDisabled}
        checked={enabled}
        onCheckedChange={(checked) =>
          setModelParamEnabled?.("reasoning", checked)
        }
      />
    </div>
    <Select
      disabled={!enabled || formDisabled}
      value={value}
      onValueChange={(next) =>
        updateModelParam("reasoning", next as ModelReasoningLevel)
      }
    >
      <SelectTrigger className="h-8 capitalize">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MODEL_REASONING_LEVELS.map((level) => (
          <SelectItem className="capitalize" key={level} value={level}>
            {level.replace("-", " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

type ModelParamsNumberInputProps = {
  title: string;
  modelParamsKey: "maxOutputTokens" | "seed" | "topK";
  value: number;
  tooltip: string;
  min?: number;
  updateModelParam: ModelParamsContext["updateModelParamValue"];
  setModelParamEnabled: ModelParamsContext["setModelParamEnabled"];
  enabled: boolean;
  formDisabled: boolean;
};

const ModelParamsNumberInput = ({
  title,
  modelParamsKey,
  value,
  tooltip,
  min,
  updateModelParam,
  setModelParamEnabled,
  enabled,
  formDisabled,
}: ModelParamsNumberInputProps) => (
  <div className="flex items-center gap-3" title={tooltip}>
    <p
      className={cn(
        "flex-1 text-xs font-semibold",
        (!enabled || formDisabled) && "text-muted-foreground",
      )}
    >
      {title}
    </p>
    <Input
      className="h-7 w-28 appearance-none px-2 text-right"
      type="number"
      step={1}
      min={min}
      disabled={!enabled || formDisabled}
      value={value}
      onChange={(event) => {
        const nextValue = Number.parseInt(event.target.value, 10);
        if (Number.isNaN(nextValue)) return;
        updateModelParam(
          modelParamsKey,
          min === undefined ? nextValue : Math.max(nextValue, min),
        );
      }}
    />
    <Switch
      title={`Control sending the ${title} parameter`}
      disabled={formDisabled}
      checked={enabled}
      onCheckedChange={(checked) =>
        setModelParamEnabled?.(modelParamsKey, checked)
      }
    />
  </div>
);

type ModelParamsTextListInputProps = {
  value: string[];
  updateModelParam: ModelParamsContext["updateModelParamValue"];
  setModelParamEnabled: ModelParamsContext["setModelParamEnabled"];
  enabled: boolean;
  formDisabled: boolean;
};

const ModelParamsTextListInput = ({
  value,
  updateModelParam,
  setModelParamEnabled,
  enabled,
  formDisabled,
}: ModelParamsTextListInputProps) => {
  const [inputValue, setInputValue] = useState(value.join("\n"));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p
            className={cn(
              "text-xs font-semibold",
              (!enabled || formDisabled) && "text-muted-foreground",
            )}
          >
            Stop sequences
          </p>
          <p className="text-muted-foreground text-[11px]">
            One sequence per line
          </p>
        </div>
        <Switch
          title="Control sending stop sequences"
          disabled={formDisabled}
          checked={enabled}
          onCheckedChange={(checked) =>
            setModelParamEnabled?.("stopSequences", checked)
          }
        />
      </div>
      <Textarea
        className="min-h-16 text-xs"
        disabled={!enabled || formDisabled}
        value={inputValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          setInputValue(nextValue);
          updateModelParam(
            "stopSequences",
            nextValue.split("\n").filter((line) => line.length > 0),
          );
        }}
      />
    </div>
  );
};

type ProviderOptionsInputProps = {
  value: JSONObject | undefined;
  updateModelParam: ModelParamsContext["updateModelParamValue"];
  setModelParamEnabled: ModelParamsContext["setModelParamEnabled"];
  enabled: boolean;
  formDisabled: boolean;
};
const ProviderOptionsInput = ({
  value,
  updateModelParam,
  setModelParamEnabled,
  enabled,
  formDisabled,
}: ProviderOptionsInputProps) => {
  const [inputValue, setInputValue] = useState<string>(
    value ? JSON.stringify(value, null, 2) : "{}",
  );
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-row">
        <div className="flex-1 flex-row space-x-1">
          <span
            className={cn(
              "text-xs font-semibold",
              (!enabled || formDisabled) && "text-muted-foreground",
            )}
          >
            Additional options
          </span>
          <Tooltip>
            <TooltipTrigger aria-label="About additional model options">
              <InfoIcon className="text-muted-foreground size-3" />
            </TooltipTrigger>
            <TooltipContent className="max-w-[200px] p-2">
              Namespaced AI SDK provider options for exact provider controls,
              for example {`{ "openai": { ... } }`}. These override matching
              portable settings.
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex flex-row space-x-3">
          {setModelParamEnabled ? (
            <Switch
              title="Control sending the additional options parameter"
              disabled={formDisabled}
              checked={enabled}
              onCheckedChange={(checked) => {
                setModelParamEnabled("providerOptions", checked);
              }}
            />
          ) : null}
        </div>
      </div>

      {enabled && (
        <div>
          <CodeMirrorEditor
            value={inputValue}
            onChange={(value) => {
              setInputValue(value);

              try {
                const parsed = JSONObjectSchema.parse(JSON.parse(value));
                updateModelParam("providerOptions", parsed);
                setError(null);
              } catch {
                setError("Invalid JSON Object");
              }
            }}
            editable={enabled && !formDisabled}
            mode="json"
            lineNumbers={false}
          />
          {error && (
            <span className="pt-6">
              <p className="text-[12px] text-red-500">{error}</p>
            </span>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Coordinates a provider/model `Select` that offers an inline "Add LLM
 * Connection" action which opens the {@link CreateLLMApiKeyDialog}.
 *
 * A dropdown should not stay open while it spawns a modal (see the overlay
 * lifecycle note in web/AGENTS.md): the still-open Radix Select content sits in
 * the `popover` layer, above the `modal` layer, so it would paint over the
 * dialog and the two focus/dismiss scopes would fight. We therefore control the
 * Select's open state, close it as the dialog opens, and — because a Radix
 * Select unmounts its content when it closes (which would tear down a dialog
 * nested inside it) — the dialog is rendered as a SIBLING of the Select, not a
 * child of its content.
 *
 * When the dialog closes we reopen the dropdown, but only if the user hasn't
 * committed a selection in the meantime, so they can finish the pick they came
 * for (e.g. choose the connection they just added).
 */
function useAddLlmConnectionSelect() {
  const [selectOpen, setSelectOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const madeSelectionRef = useRef(false);

  const openConnectionDialog = useCallback(() => {
    madeSelectionRef.current = false;
    setSelectOpen(false);
    setDialogOpen(true);
  }, []);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    setDialogOpen(open);
    if (!open && !madeSelectionRef.current) {
      setSelectOpen(true);
    }
  }, []);

  const notifySelection = useCallback(() => {
    madeSelectionRef.current = true;
  }, []);

  return {
    selectOpen,
    setSelectOpen,
    dialogOpen,
    openConnectionDialog,
    handleDialogOpenChange,
    notifySelection,
  };
}

/**
 * The inline "Add LLM Connection" action rendered at the bottom of a provider
 * Select. Gated by `llmApiKeys:create` so we don't show a dead button (and so we
 * don't leave a dangling separator) for users without access. On click it hands
 * off to the coordinator, which closes the dropdown before opening the dialog.
 */
function AddLlmConnectionSelectAction({ onOpen }: { onOpen: () => void }) {
  const projectId = useProjectIdFromURL();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "llmApiKeys:create",
  });

  if (!hasAccess) return null;

  return (
    <>
      <SelectSeparator />
      <Button type="button" variant="secondary" onClick={onOpen}>
        <PlusIcon className="mr-1.5 -ml-0.5 h-5 w-5" aria-hidden="true" />
        Add LLM Connection
      </Button>
    </>
  );
}
