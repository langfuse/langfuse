import { useStore } from "zustand";

import { Slider } from "@/src/components/ui/slider";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import {
  SAMPLING_SLIDER_MIN,
  SAMPLING_SLIDER_STEP,
} from "@/src/features/evals/v2/constants/ruleSampling";
import type { RuleSetupStore } from "@/src/features/evals/v2/types/rules";

export function RuleSamplingSection({ store }: { store: RuleSetupStore }) {
  const sampling = useStore(store, (state) => state.sampling);
  const setSampling = useStore(store, (state) => state.actions.setSampling);

  return (
    <section className="mt-2 max-w-xl space-y-2">
      <div>
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-bold">Sampling rate</h3>
          <InfoTooltip label="About sampling rate">
            The percentage of matching observations that will be evaluated.
            Lower sampling rates reduce evaluation volume and cost.
          </InfoTooltip>
        </div>
        <p className="text-muted-foreground text-sm">
          Set the percentage of matching observations this rule evaluates.
        </p>
      </div>
      <Slider
        min={SAMPLING_SLIDER_MIN}
        max={1}
        step={SAMPLING_SLIDER_STEP}
        value={[sampling]}
        showInput
        displayAsPercentage
        onValueChange={(value) => setSampling(value[0] ?? sampling)}
      />
    </section>
  );
}
