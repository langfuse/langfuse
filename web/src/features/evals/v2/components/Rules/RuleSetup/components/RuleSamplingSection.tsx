import { useStore } from "zustand";
import { Info } from "lucide-react";

import { Slider } from "@/src/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import type { RuleSetupStore } from "@/src/features/evals/v2/types/rules";

export function RuleSamplingSection({ store }: { store: RuleSetupStore }) {
  const sampling = useStore(store, (state) => state.sampling);
  const setSampling = useStore(store, (state) => state.actions.setSampling);

  return (
    <section className="mt-2 max-w-xl space-y-2">
      <div>
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-bold">Sampling rate</h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info
                className="text-muted-foreground h-3.5 w-3.5 cursor-help"
                aria-label="About sampling rate"
              />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              The percentage of matching observations that will be evaluated.
              Lower sampling rates reduce evaluation volume and cost.
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-muted-foreground text-sm">
          Choose the share of matching observations to evaluate.
        </p>
      </div>
      <Slider
        min={0.0001}
        max={1}
        step={0.0001}
        value={[sampling]}
        showInput
        displayAsPercentage
        onValueChange={(value) => setSampling(value[0] ?? sampling)}
      />
    </section>
  );
}
