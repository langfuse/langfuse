import type { ReactNode } from "react";

import { Stepper } from "@/src/features/evals/v2/components/Stepper/Stepper";
import { useTranslations } from "next-intl";

export function VariableMappingStep({
  open,
  onOpenChange,
  mappingEditor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mappingEditor: ReactNode;
}) {
  const t = useTranslations("evaluationAnalytics.evaluations");
  return (
    <Stepper
      number={2}
      title={t("setup.variableMapping.title")}
      description={t("setup.variableMapping.description")}
      open={open}
      onOpenChange={onOpenChange}
    >
      {mappingEditor}
    </Stepper>
  );
}
