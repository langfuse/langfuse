import { useStore } from "zustand";

import { Slider } from "@/src/components/ui/slider";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import {
  SAMPLING_SLIDER_MIN,
  SAMPLING_SLIDER_STEP,
} from "@/src/features/evals/v2/constants/ruleSampling";
import type { RuleSetupStore } from "@/src/features/evals/v2/types/rules";
import { useTranslations } from "next-intl";

export function RuleSamplingSection({ store }: { store: RuleSetupStore }) {
  const t = useTranslations("evaluationAnalytics.evaluations");
  const sampling = useStore(store, (state) => state.sampling);
  const setSampling = useStore(store, (state) => state.actions.setSampling);

  return (
    <section className="mt-2 max-w-xl space-y-2">
      <div>
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-bold">{t("rules.sampling.title")}</h3>
          <InfoTooltip label={t("rules.sampling.about")}>
            {t("rules.sampling.tooltip")}
          </InfoTooltip>
        </div>
        <p className="text-muted-foreground text-sm">
          {t("rules.sampling.description")}
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
