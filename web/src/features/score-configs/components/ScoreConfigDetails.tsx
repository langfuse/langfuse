import { isNumericDataType } from "@/src/features/scores/lib/helpers";
import { isPresent, type ScoreConfigDomain } from "@langfuse/shared";
import { useTranslations } from "next-intl";

export function ScoreConfigDetails({ config }: { config: ScoreConfigDomain }) {
  const t = useTranslations("systemUi.scoreConfigs");
  const { name, description, minValue, maxValue, dataType } = config;
  const isNameTruncated = name.length > 20;

  return (
    <div className="bg-background p-2 text-xs text-wrap">
      {!!description && <p>{t("descriptionLabel", { description })}</p>}
      {isNumericDataType(dataType) &&
      (isPresent(minValue) || isPresent(maxValue)) ? (
        <p>{t("range", { min: minValue ?? "-∞", max: maxValue ?? "∞" })}</p>
      ) : null}
      {isNameTruncated && <p>{t("fullName", { name })}</p>}
    </div>
  );
}
