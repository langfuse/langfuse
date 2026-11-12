import { Tabs } from "@/src/components/design-system/Tabs/Tabs";

const RESTRICTED = "restricted";

type GatewayApiKeysModelsFilterProps = {
  restrictedModelsOnly: boolean;
  onChange: (restrictedModelsOnly: boolean) => void;
};

export function GatewayApiKeysModelsFilter({
  restrictedModelsOnly,
  onChange,
}: GatewayApiKeysModelsFilterProps) {
  const handleValueChange = (value: string) => onChange(value === RESTRICTED);

  return (
    <Tabs
      activationMode="manual"
      value={restrictedModelsOnly ? RESTRICTED : "all"}
      onValueChange={handleValueChange}
    >
      <Tabs.List variant="inset" size="sm" aria-label="Filter by models">
        <Tabs.Trigger value="all" label="All keys" />
        <Tabs.Trigger value={RESTRICTED} label="Restricted models" />
      </Tabs.List>
    </Tabs>
  );
}
