import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";

export type ConnectionFilterProps = {
  connections: ReadonlyArray<{ id: string; name: string }>;
  value: string;
  onChange: (connectionId: string) => void;
};

export function ConnectionFilter({
  connections,
  value,
  onChange,
}: ConnectionFilterProps) {
  return (
    <div className="w-44 max-w-full">
      <SelectInput
        aria-label="Provider"
        placeholder="Select a provider"
        value={value}
        options={connections.map((connection) => ({
          value: connection.id,
          label: connection.name,
        }))}
        onValueChange={onChange}
      />
    </div>
  );
}
