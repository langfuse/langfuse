import { useState, useEffect } from "react";
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
import { Switch } from "@/src/components/ui/switch";
import { CreateLLMApiKeyDialog } from "@/src/features/public-api/components/CreateLLMApiKeyDialog";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { cn } from "@/src/utils/tailwind";
import {
  type LLMAdapter,
  type supportedModels,
  type UIModelParams,
} from "@langfuse/shared";
import { Settings2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";

import { LLMApiKeyComponent } from "./LLMApiKeyComponent";
import { FormDescription } from "@/src/components/ui/form";

export type ModelParamsContext = {
  modelParams: UIModelParams;
  availableProviders: string[];
  availableModels: string[];
  updateModelParamValue: <Key extends keyof UIModelParams>(
    key: Key,
    value: UIModelParams[Key]["value"],
  ) => void;
  setModelParamEnabled?: (key: keyof UIModelParams, enabled: boolean) => void;
  formDisabled?: boolean;
  modelParamsDescription?: string;
  customHeader?: React.ReactNode;
};

export const ModelParameters: React.FC<ModelParamsContext> = ({
  modelParams,
  availableProviders,
  availableModels,
  updateModelParamValue,
  setModelParamEnabled,
  formDisabled = false,
  modelParamsDescription,
  customHeader,
}) => {
  const projectId = useProjectIdFromURL();
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  const [modelSettingsUsed, setModelSettingsUsed] = useState(false);

  useEffect(() => {
    const hasEnabledModelSetting = Object.keys(modelParams).some(
      (key) =>
        !["adapter", "provider", "model"].includes(key) &&
        modelParams[key as keyof typeof modelParams].enabled,
    );

    if (hasEnabledModelSetting) {
      setModelSettingsUsed(true);
    } else {
      setModelSettingsUsed(false);
    }
  }, [setModelSettingsUsed, modelParams]);

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
        <CreateLLMApiKeyDialog />
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-2 pb-1 pr-1 pt-2">
      <div className="flex items-center justify-between">
        {customHeader ? customHeader : <p className="font-semibold">Model</p>}
        <Popover open={modelSettingsOpen} onOpenChange={setModelSettingsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="relative h-7 w-7"
              disabled={formDisabled}
            >
              <Settings2 size={14} />
              {modelSettingsUsed && (
                <div className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-4" align="end" sideOffset={5}>
            <div className="mb-3">
              <h4 className="mb-1 text-sm font-medium">
                Model Advanced Settings
              </h4>
              <p className="text-xs text-muted-foreground">
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
              <ModelParamsSlider
                title="Output token limit"
                modelParamsKey="max_tokens"
                formDisabled={formDisabled}
                enabled={modelParams.max_tokens.enabled}
                setModelParamEnabled={setModelParamEnabled}
                value={modelParams.max_tokens.value}
                min={1}
                max={16384}
                step={1}
                tooltip="The maximum number of tokens that can be generated in the chat completion."
                updateModelParam={updateModelParamValue}
              />
              <ModelParamsSlider
                title="Top P"
                modelParamsKey="top_p"
                formDisabled={formDisabled}
                enabled={modelParams.top_p.enabled}
                setModelParamEnabled={setModelParamEnabled}
                value={modelParams.top_p.value}
                min={0}
                max={1}
                step={0.01}
                tooltip="An alternative to sampling with temperature, called nucleus sampling, where the model considers the results of the tokens with top_p probability mass. So 0.1 means only the tokens comprising the top 10% probability mass are considered. We generally recommend altering this or temperature but not both."
                updateModelParam={updateModelParamValue}
              />
              <LLMApiKeyComponent {...{ projectId, modelParams }} />
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-4">
        <div className="space-y-3">
          <ModelParamsSelect
            title="Provider"
            modelParamsKey="provider"
            disabled={formDisabled}
            value={modelParams.provider.value}
            options={availableProviders}
            updateModelParam={updateModelParamValue}
          />
          <ModelParamsSelect
            title="Model name"
            modelParamsKey="model"
            disabled={formDisabled}
            value={modelParams.model.value}
            options={[...new Set(availableModels)]}
            updateModelParam={updateModelParamValue}
            modelParamsDescription={modelParamsDescription}
          />
        </div>

        {modelParams.model.value?.startsWith("o1-") ? (
          <p className="mt-1 text-xs text-dark-yellow">
            For {modelParams.model.value}, the system message and the
            temperature, max_tokens and top_p setting are not supported while it
            is in beta.{" "}
            <a
              href="https://platform.openai.com/docs/guides/reasoning/beta-limitations"
              target="_blank"
              rel="noreferrer noopener"
            >
              More info ↗
            </a>
          </p>
        ) : null}
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
};
const ModelParamsSelect = ({
  title,
  modelParamsKey,
  value,
  options,
  updateModelParam,
  disabled,
  modelParamsDescription,
}: ModelParamsSelectProps) => {
  return (
    <div className="flex items-center gap-4">
      <div className="w-24 flex-shrink-0">
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
          disabled={disabled}
          onValueChange={(value) =>
            updateModelParam(
              modelParamsKey,
              value as (typeof supportedModels)[LLMAdapter][number],
            )
          }
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
            <SelectSeparator />
            <CreateLLMApiKeyDialog />
          </SelectContent>
        </Select>
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
              updateModelParam(
                modelParamsKey,
                Math.max(Math.min(parseFloat(event.target.value), max), min),
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
