import {
  supportedModels,
  ModelProvider,
  type UIModelParams,
} from "@langfuse/shared";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Slider } from "@/src/components/ui/slider";

export type ModelParamsContext = {
  modelParams: UIModelParams;
  updateModelParams: <Key extends keyof UIModelParams>(
    key: Key,
    value: UIModelParams[Key],
  ) => void;
};

export const ModelParameters: React.FC<ModelParamsContext> = ({
  modelParams,
  updateModelParams,
}) => {
  return (
    <div className="flex flex-col space-y-4">
      <p className="font-semibold">Model</p>
      <div className="space-y-6">
        <ModelParamsSelect
          title="Provider"
          modelParamsKey="provider"
          value={modelParams.provider}
          options={Object.values(ModelProvider)}
          updateModelParams={updateModelParams}
        />
        <ModelParamsSelect
          title="Model name"
          modelParamsKey="model"
          value={modelParams.model}
          options={Object.values(supportedModels[modelParams.provider])}
          updateModelParams={updateModelParams}
        />
        <ModelParamsSlider
          title="Temperature"
          modelParamsKey="temperature"
          value={modelParams.temperature}
          min={0}
          max={modelParams.maxTemperature}
          step={0.01}
          tooltip="The sampling temperature. Higher values will make the output more random, while lower values like will make it more focused and deterministic."
          updateModelParams={updateModelParams}
        />
        <ModelParamsSlider
          title="Output token limit"
          modelParamsKey="max_tokens"
          value={modelParams.max_tokens}
          min={1}
          max={4096}
          step={1}
          tooltip="The maximum number of tokens that can be generated in the chat completion."
          updateModelParams={updateModelParams}
        />
        <ModelParamsSlider
          title="Top P"
          modelParamsKey="top_p"
          value={modelParams.top_p}
          min={0}
          max={1}
          step={0.01}
          tooltip="An alternative to sampling with temperature, called nucleus sampling, where the model considers the results of the tokens with top_p probability mass. So 0.1 means only the tokens comprising the top 10% probability mass are considered. We generally recommend altering this or temperature but not both."
          updateModelParams={updateModelParams}
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
  updateModelParams: ModelParamsContext["updateModelParams"];
};
const ModelParamsSelect = ({
  title,
  modelParamsKey,
  value,
  options,
  updateModelParams,
}: ModelParamsSelectProps) => {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold">{title}</p>
      <Select
        onValueChange={(value) =>
          updateModelParams(
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
  updateModelParams: ModelParamsContext["updateModelParams"];
};
const ModelParamsSlider = ({
  title,
  modelParamsKey,
  value,
  tooltip,
  min,
  max,
  step,
  updateModelParams,
}: ModelParamsSliderProps) => {
  return (
    <div className="space-y-3" title={tooltip}>
      <div className="flex flex-row">
        <p className="flex-1 text-xs font-semibold">{title}</p>
        <Input
          className="h-6 w-14 appearance-none px-2 text-right"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => {
            updateModelParams(
              modelParamsKey,
              Math.max(Math.min(parseFloat(event.target.value), max), min),
            );
          }}
        />
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        onValueChange={(value) => {
          if (value[0] !== undefined)
            updateModelParams(modelParamsKey, value[0]);
        }}
        value={[value]}
      />
    </div>
  );
};
