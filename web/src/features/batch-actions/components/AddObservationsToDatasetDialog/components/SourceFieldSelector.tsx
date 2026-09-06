import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import type { SourceField } from "../types";
import { useTranslations } from "next-intl";

type SourceFieldSelectorProps = {
  value: SourceField;
  onChange: (field: SourceField) => void;
  disabled?: boolean;
};

export function SourceFieldSelector({
  value,
  onChange,
  disabled = false,
}: SourceFieldSelectorProps) {
  const t = useTranslations("operationsUi.batchActions.addToDataset.fields");
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as SourceField)}
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="input">{t("input")}</SelectItem>
        <SelectItem value="output">{t("output")}</SelectItem>
        <SelectItem value="metadata">{t("metadata")}</SelectItem>
      </SelectContent>
    </Select>
  );
}
