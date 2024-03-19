import { SupportedModel } from "@/src/components/playground/types";
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

export const ModelParameters = () => {
  const { modelParams, updateModelParams } = usePlaygroundContext();

  const minTemp = 0;
  const maxTemp = 2;

  return (
    <div className="flex flex-col space-y-4">
      <p className="font-semibold">Model</p>
      <div className="space-y-8">
        <div className="space-y-2">
          <p className="text-xs font-semibold">Model name</p>
          <Select
            onValueChange={(value) =>
              updateModelParams("model", value as SupportedModel)
            }
            value={modelParams.model}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a verified email to display" />
            </SelectTrigger>
            <SelectContent>
              {Object.values(SupportedModel).map((model) => (
                <SelectItem value={model} key={model}>
                  {model}
                </SelectItem>
              ))}
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
              max={2}
              step={0.01}
              value={modelParams.temperature}
              onChange={(event) => {
                updateModelParams(
                  "temperature",
                  Math.max(
                    Math.min(parseFloat(event.target.value), maxTemp),
                    minTemp,
                  ),
                );
              }}
            />
          </div>
          <Slider
            min={0}
            max={2}
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
