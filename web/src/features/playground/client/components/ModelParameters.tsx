import {
  supportedModels,
  ModelProvider,
} from "@/src/features/playground/types";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Slider } from "@/src/components/ui/slider";

import { usePlaygroundContext } from "../context";
import { capitalize } from "lodash";

export const ModelParameters = () => {
  const { modelParams, updateModelParams } = usePlaygroundContext();

  return (
    <div className="flex flex-col space-y-4">
      <p className="font-semibold">Model</p>
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold">Provider</p>
          <Select
            onValueChange={(value) =>
              updateModelParams("provider", value as ModelProvider)
            }
            value={modelParams.provider}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a provider" />
            </SelectTrigger>
            <SelectContent>
              {Object.values(ModelProvider).map((provider) => (
                <SelectItem value={provider} key={provider}>
                  {capitalize(provider)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold">Model name</p>
          <Select
            onValueChange={(value) =>
              updateModelParams(
                "model",
                value as (typeof supportedModels)[ModelProvider][number],
              )
            }
            value={modelParams.model}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a verified email to display" />
            </SelectTrigger>
            <SelectContent>
              {Object.values(supportedModels[modelParams.provider]).map(
                (model) => (
                  <SelectItem value={model} key={model}>
                    {model}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-4">
          <div className="flex flex-row">
            <p className="flex-1 text-xs font-semibold">Temperature</p>
            <Input
              className="h-8 w-20 text-right"
              type="number"
              min={0}
              max={modelParams.max_temperature}
              step={0.01}
              value={modelParams.temperature}
              onChange={(event) => {
                updateModelParams(
                  "temperature",
                  Math.max(
                    Math.min(
                      parseFloat(event.target.value),
                      modelParams.max_temperature,
                    ),
                    0,
                  ),
                );
              }}
            />
          </div>
          <Slider
            min={0}
            max={modelParams.max_temperature}
            step={0.01}
            onValueChange={(value) => {
              if (value[0] !== undefined)
                updateModelParams("temperature", value[0]);
            }}
            value={[modelParams.temperature]}
          />
        </div>
      </div>
    </div>
  );
};
