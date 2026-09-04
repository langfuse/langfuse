import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { renderFilterIcon } from "@/src/components/ItemBadge";
import { type ObservationType } from "@langfuse/shared";

export function TraceAggregationToggle({
  aggregationLevel,
  canSelectObservation,
  canSelectSession,
  observationType,
  onAggregationLevelChange,
}: {
  aggregationLevel: "trace" | "session" | "observation";
  canSelectObservation: boolean;
  canSelectSession: boolean;
  observationType: ObservationType | null;
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
        <Tabs.Trigger
          value="observation"
          title="Observation"
          disabled={!canSelectObservation}
        >
          {renderFilterIcon(observationType ?? "EVENT")}
          <span>Observation</span>
        </Tabs.Trigger>
        <Tabs.Trigger value="trace" title="Trace">
          {renderFilterIcon("TRACE")}
          <span>Trace</span>
        </Tabs.Trigger>
        <Tabs.Trigger
          value="session"
          title="Session"
          disabled={!canSelectSession}
        >
          {renderFilterIcon("SESSION")}
          <span>Session</span>
        </Tabs.Trigger>
      </Tabs.List>
    </Tabs>
  );
}
