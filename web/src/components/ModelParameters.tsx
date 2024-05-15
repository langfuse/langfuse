import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Slider } from "@/src/components/ui/slider";
import { Switch } from "@/src/components/ui/switch";
import { cn } from "@/src/utils/tailwind";
import {
  ModelProvider,
  supportedModels,
  type UIModelParams,
} from "@langfuse/shared";

export type ModelParamsContext = {
  modelParams: UIModelParams;
  availableModels?: UIModelParams[];
  updateModelParamValue: <Key extends keyof UIModelParams>(
    key: Key,
    value: UIModelParams[Key]["value"],
  ) => void;
  setModelParamEnabled?: (key: keyof UIModelParams, enabled: boolean) => void;
  formDisabled?: boolean;
};

export const ModelParameters: React.FC<ModelParamsContext> = ({
  modelParams,
  availableModels,
  updateModelParamValue,
  setModelParamEnabled,
  formDisabled = false,
}) => {
  return (
    <div className="flex flex-col space-y-4">
      <p className="font-semibold">Model</p>
      <div className="space-y-6">
        <ModelParamsSelect
          title="Provider"
          modelParamsKey="provider"
          disabled={formDisabled}
          value={modelParams.provider.value}
          options={
            availableModels
              ? [...new Set(availableModels.map((m) => m.provider.value))]
              : Object.values(ModelProvider)
          }
          updateModelParam={updateModelParamValue}
        />
        <ModelParamsSelect
          title="Model name"
          modelParamsKey="model"
          disabled={formDisabled}
          value={modelParams.model.value}
          options={Object.values(
            availableModels
              ? availableModels
                  .filter(
                    (m) => m.provider.value === modelParams.provider.value,
                  )
                  .map((m) => m.model.value)
              : supportedModels[modelParams.provider.value],
          )}
          updateModelParam={updateModelParamValue}
        />
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
          max={4096}
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
};
const ModelParamsSelect = ({
  title,
  modelParamsKey,
  value,
  options,
  updateModelParam,
  disabled,
}: ModelParamsSelectProps) => {
  return (
    <div className="space-y-2">
      <p className={cn("text-xs font-semibold", disabled && "text-gray-400")}>
        {title}
      </p>
      <Select
        disabled={disabled}
        onValueChange={(value) =>
          updateModelParam(
            modelParamsKey,
            value as (typeof supportedModels)[ModelProvider][number],
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
        </SelectContent>
      </Select>
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
            (!enabled || formDisabled) && "text-gray-400",
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
