/* eslint-disable @repo/no-style-props */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { type ObjectType } from "@/src/features/score-analytics/lib/analytics-url-state";
import { useTranslations } from "next-intl";

interface ObjectTypeFilterProps {
  value: ObjectType;
  onChange: (value: ObjectType) => void;
  className?: string;
}

export function ObjectTypeFilter({
  value,
  onChange,
  className,
}: ObjectTypeFilterProps) {
  const t = useTranslations("evaluationAnalytics.scoreAnalytics");
  const options: Array<{ value: ObjectType; label: string }> = [
    { value: "all", label: t("allObjects") },
    { value: "trace", label: t("traces") },
    { value: "session", label: t("sessions") },
    { value: "observation", label: t("observations") },
    { value: "dataset_run", label: t("datasetRuns") },
  ];

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className} aria-label={t("objectType")}>
        <SelectValue placeholder={t("objectType")} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
