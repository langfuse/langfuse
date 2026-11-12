import {
  ConnectionSelect,
  type ConnectionSelectProps,
} from "@/src/features/ai-gateway/components/ConnectionSelect/ConnectionSelect";

export type ConnectionFilterProps = Pick<
  ConnectionSelectProps,
  "connections" | "value" | "onChange"
>;

export function ConnectionFilter(props: ConnectionFilterProps) {
  return (
    <div className="w-56 max-w-full">
      <ConnectionSelect
        {...props}
        aria-label="Connection"
        placeholder="Select a connection"
      />
    </div>
  );
}
