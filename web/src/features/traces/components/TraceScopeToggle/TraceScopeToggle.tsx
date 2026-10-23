import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { renderFilterIcon } from "@/src/components/ItemBadge";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";

export function TraceScopeToggle({
  value,
  canSelectSession,
  onValueChange,
}: {
  value: "trace" | "session";
  canSelectSession: boolean;
  onValueChange: (value: "trace" | "session") => void;
}) {
  const sessionTrigger = (
    <Tabs.Trigger value="session" disabled={!canSelectSession}>
      {renderFilterIcon("SESSION")}
      <span>Session</span>
    </Tabs.Trigger>
  );
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        if (next === "trace" || next === "session") onValueChange(next);
      }}
    >
      <Tabs.List aria-label="Trace detail scope" variant="inset" size="sm">
        <Tabs.Trigger value="trace">
          {renderFilterIcon("TRACE")}
          <span>Trace</span>
        </Tabs.Trigger>
        {canSelectSession ? (
          sessionTrigger
        ) : (
          <Tooltip label="Session view requires project access and a trace belonging to a session.">
            {({ getTriggerProps }) => (
              <span {...getTriggerProps()} className="inline-flex">
                {sessionTrigger}
              </span>
            )}
          </Tooltip>
        )}
      </Tabs.List>
    </Tabs>
  );
}
