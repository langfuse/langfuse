import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";

export function TraceAggregationToggle({
  aggregationLevel,
  onAggregationLevelChange,
}: {
  aggregationLevel: "trace" | "session";
  onAggregationLevelChange: (aggregationLevel: "trace" | "session") => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={aggregationLevel}
      onValueChange={(value) => {
        if (value === "trace" || value === "session") {
          onAggregationLevelChange(value);
        }
      }}
      variant="outline"
      className="gap-0"
    >
      <ToggleGroupItem
        value="trace"
        aria-label="Aggregate by trace"
        className="h-8 rounded-r-none px-2.5 text-xs"
      >
        Trace
      </ToggleGroupItem>
      <ToggleGroupItem
        value="session"
        aria-label="Aggregate by session"
        className="h-8 rounded-l-none border-l-0 px-2.5 text-xs"
      >
        Session
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
