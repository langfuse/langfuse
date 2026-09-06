import type { ComponentProps } from "react";

import { AIAssistedInput } from "@/src/components/ui/ai-assisted-input";
import { Label } from "@/src/components/ui/label";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { Stepper } from "@/src/features/evals/v2/components/Stepper/Stepper";
import { useTranslations } from "next-intl";

export function NameStep({
  step,
  open,
  onOpenChange,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  nameAIAssistance,
  descriptionAIAssistance,
}: {
  step: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (name: string) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
  nameAIAssistance: ComponentProps<typeof AIAssistedInput>["aiAssistance"];
  descriptionAIAssistance: ComponentProps<
    typeof AIAssistedInput
  >["aiAssistance"];
}) {
  const t = useTranslations("evaluationAnalytics.evaluations");
  return (
    <Stepper
      number={step}
      title={t("setup.name.title")}
      description={t("setup.name.description")}
      open={open}
      onOpenChange={onOpenChange}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="evaluator-name" className="flex items-center gap-1.5">
            {t("setup.name.nameLabel")}
            <InfoTooltip label={t("setup.name.aboutNames")}>
              {t("setup.name.nameTooltip")}
            </InfoTooltip>
          </Label>
          <AIAssistedInput
            id="evaluator-name"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder={
              nameAIAssistance.state === "generating"
                ? t("setup.name.generatingName")
                : t("setup.name.namePlaceholder")
            }
            aiAssistance={nameAIAssistance}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="evaluator-description">
            {t("setup.name.descriptionLabel")}{" "}
            <span className="text-muted-foreground font-normal">
              {t("optional")}
            </span>
          </Label>
          <AIAssistedInput
            id="evaluator-description"
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder={
              descriptionAIAssistance.state === "generating"
                ? t("setup.name.generatingDescription")
                : t("setup.name.descriptionPlaceholder")
            }
            fieldName={t("setup.name.descriptionLabel")}
            aiAssistance={descriptionAIAssistance}
          />
        </div>
      </div>
    </Stepper>
  );
}
