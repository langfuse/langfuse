import { SearchInput } from "@/src/components/design-system/SearchInput/SearchInput";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";

const WITHOUT_GATEWAY_KEYS = "without-gateway";
const ALL_KEYS = "all";

const GATEWAY_KEY_FILTER_OPTIONS: Array<{
  value: GatewayKeyFilterValue;
  label: string;
}> = [
  { value: WITHOUT_GATEWAY_KEYS, label: "Exclude gateway keys" },
  { value: ALL_KEYS, label: "All API keys" },
];

type ApiKeySettingsTableFiltersProps = {
  searchQuery: string;
  onSearchQueryChange: (searchQuery: string) => void;
  gatewayKeyFilter?: {
    includeGatewayKeys: boolean;
    onIncludeGatewayKeysChange: (includeGatewayKeys: boolean) => void;
  };
};

export function ApiKeySettingsTableFilters({
  searchQuery,
  onSearchQueryChange,
  gatewayKeyFilter,
}: ApiKeySettingsTableFiltersProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-80 max-w-full">
        <SearchInput
          value={searchQuery}
          onChange={onSearchQueryChange}
          onSubmit={onSearchQueryChange}
          placeholder="Search by name"
        />
      </div>
      {gatewayKeyFilter ? <GatewayKeyFilter {...gatewayKeyFilter} /> : null}
    </div>
  );
}

function GatewayKeyFilter({
  includeGatewayKeys,
  onIncludeGatewayKeysChange,
}: NonNullable<ApiKeySettingsTableFiltersProps["gatewayKeyFilter"]>) {
  const handleValueChange = (value: GatewayKeyFilterValue) =>
    onIncludeGatewayKeysChange(value === ALL_KEYS);

  return (
    <div className="w-52">
      <SelectInput
        aria-label="Filter API keys"
        value={includeGatewayKeys ? ALL_KEYS : WITHOUT_GATEWAY_KEYS}
        options={GATEWAY_KEY_FILTER_OPTIONS}
        muted={!includeGatewayKeys}
        onValueChange={handleValueChange}
        placeholder="Exclude gateway keys"
      />
    </div>
  );
}

type GatewayKeyFilterValue = typeof WITHOUT_GATEWAY_KEYS | typeof ALL_KEYS;
