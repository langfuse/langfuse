import { MultiSelectInput } from "@/src/components/design-system/MultiSelectInput/MultiSelectInput";
import type { ApiFormat } from "@/src/features/ai-gateway/fns/getGatewayModelApiFormats";

export type ApiFormatFilterProps = {
  formats: readonly ApiFormat[];
  value: ApiFormat[];
  onChange: (value: ApiFormat[]) => void;
};

/** Narrows a model table to the models serving any of the selected API formats. */
export function ApiFormatFilter({
  formats,
  value,
  onChange,
}: ApiFormatFilterProps) {
  return (
    <div className="w-56 max-w-full">
      <MultiSelectInput
        aria-label="API formats"
        value={value}
        options={formats.map((apiFormat) => ({
          value: apiFormat,
          label: apiFormat,
        }))}
        onValueChange={onChange}
        placeholder="All API formats"
        selectedLabel={
          value.length === 1 ? value[0] : `${value.length} formats`
        }
        searchPlaceholder="Search API formats..."
        emptyMessage="No API formats found."
      />
    </div>
  );
}
