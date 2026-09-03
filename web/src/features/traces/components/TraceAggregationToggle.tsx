import { Tabs } from "@/src/components/design-system/Tabs/Tabs";

export function TraceAggregationToggle({
  aggregationLevel,
  onAggregationLevelChange,
}: {
  aggregationLevel: "trace" | "session" | "observation";
  onAggregationLevelChange: (
    aggregationLevel: "trace" | "session" | "observation",
  ) => void;
}) {
  return (
    <Tabs
      value={aggregationLevel}
      onValueChange={(value) => {
        if (
          value === "trace" ||
          value === "session" ||
          value === "observation"
        ) {
          onAggregationLevelChange(value);
        }
      }}
    >
      <Tabs.List aria-label="Trace detail scope">
        <Tabs.Trigger value="trace" label="Trace" />
        <Tabs.Trigger value="session" label="Session" />
        <Tabs.Trigger value="observation" label="Observation" />
      </Tabs.List>
    </Tabs>
  );
}
