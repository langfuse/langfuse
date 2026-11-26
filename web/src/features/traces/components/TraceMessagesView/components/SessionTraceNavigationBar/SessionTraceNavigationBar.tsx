import { ArrowDown, ArrowUp, type IconComponent } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { type TraceMessagesNeighbor } from "@/src/features/traces/components/TraceMessagesView/hooks/useTraceMessagesNavigation";

export function SessionTraceNavigationBar({
  position,
  total,
  sessionHref,
  previous,
  next,
}: {
  position: number;
  total: number;
  sessionHref: string;
  previous?: TraceMessagesNeighbor;
  next?: TraceMessagesNeighbor;
}) {
  return (
    <div className="bg-background sticky top-0 z-1 flex h-9 shrink-0 items-center gap-1 border-b px-2">
      <p className="text-muted-foreground px-1 text-sm tabular-nums">
        Trace {position} / {total}
      </p>
      <SessionTraceNavControl
        label="Previous trace"
        icon={ArrowUp}
        neighbor={previous}
      />
      <SessionTraceNavControl
        label="Next trace"
        icon={ArrowDown}
        neighbor={next}
      />
      <div className="ml-auto">
        <Button text="Session" variant="ghost" size="sm" href={sessionHref} />
      </div>
    </div>
  );
}

function SessionTraceNavControl({
  label,
  icon: Icon,
  neighbor,
}: {
  label: string;
  icon: IconComponent;
  neighbor?: TraceMessagesNeighbor;
}) {
  if (!neighbor) {
    return (
      <Tooltip label={label}>
        {({ getTriggerProps }) => (
          <span className="inline-flex" {...getTriggerProps()}>
            <IconButton
              icon={Icon}
              label={label}
              size="sm"
              variant="toolbar"
              disabled
            />
          </span>
        )}
      </Tooltip>
    );
  }

  return (
    <Tooltip label={label}>
      {({ getTriggerProps }) => (
        <IconButton
          icon={Icon}
          label={label}
          size="sm"
          variant="toolbar"
          href={neighbor.href}
          shallow={neighbor.shallow}
          {...getTriggerProps()}
        />
      )}
    </Tooltip>
  );
}
