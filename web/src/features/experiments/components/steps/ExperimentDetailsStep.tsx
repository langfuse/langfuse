import React from "react";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { type ExperimentDetailsStepProps } from "@/src/features/experiments/types/stepProps";
import { StepHeader } from "@/src/features/experiments/components/shared/StepHeader";
import { useTranslations } from "next-intl";

export const ExperimentDetailsStep: React.FC<ExperimentDetailsStepProps> = ({
  formState,
}) => {
  const t = useTranslations("evaluationAnalytics.experiments");
  const { form } = formState;
  return (
    <div className="space-y-6">
      <StepHeader
        title={t("steps.details.title")}
        description={t("steps.details.description")}
      />

      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("steps.details.experimentName")}</FormLabel>
            <FormControl>
              <Input
                {...field}
                placeholder={t("steps.details.experimentNamePlaceholder")}
                className="w-full"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("steps.details.descriptionOptional")}</FormLabel>
            <FormControl>
              <Textarea
                {...field}
                placeholder={t("steps.details.descriptionPlaceholder")}
                className="min-h-[100px] w-full"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};
