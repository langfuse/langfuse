import { FieldHeader } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/FieldHeader";
import { RegionSelect } from "@/src/features/ai-gateway/components/RegionSelect";
import type { RegionGroup } from "@/src/features/ai-gateway/types/regionGroup";

export type RegionFieldProps = {
  id: string;
  label: string;
  description: string;
  groups: RegionGroup[];
  value: string;
  onChange: (region: string) => void;
};

/** Picks the cloud region a connection sends its requests to. */
export function RegionField({
  id,
  label,
  description,
  groups,
  value,
  onChange,
}: RegionFieldProps) {
  return (
    <div>
      <FieldHeader htmlFor={id} label={label} description={description} />
      <RegionSelect id={id} groups={groups} value={value} onChange={onChange} />
    </div>
  );
}
