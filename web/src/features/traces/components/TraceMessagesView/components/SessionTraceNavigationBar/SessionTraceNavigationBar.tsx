import { ChevronLeft, ChevronRight, type IconComponent } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";

export function SessionTraceNavigationBar({
  position,
  total,
  sessionHref,
  onPrevious,
  onNext,
}: {
  position: number;
  total: number;
  sessionHref: string;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  return (
    <div className="bg-background sticky top-0 z-1 flex h-9 shrink-0 items-center gap-1 border-b px-2">
      <SessionTraceNavButton
        label="Previous trace"
        icon={ChevronLeft}
        onClick={onPrevious}
      />
      <p className="text-muted-foreground px-1 text-sm tabular-nums">
        Trace {position} / {total}
      </p>
      <SessionTraceNavButton
        label="Next trace"
        icon={ChevronRight}
        onClick={onNext}
      />
      <div className="ml-auto">
        <Button text="Session" variant="ghost" size="sm" href={sessionHref} />
      </div>
    </div>
  );
}

function SessionTraceNavButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: IconComponent;
  onClick?: () => void;
}) {
  if (!onClick) {
    return (
      <Tooltip label={label}>
        {({ getTriggerProps }) => (
          <span className="inline-flex" {...getTriggerProps()}>
            <IconButton
              icon={icon}
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
          icon={icon}
          label={label}
          size="sm"
          variant="toolbar"
          {...getTriggerProps({ onClick })}
        />
      )}
    </Tooltip>
  );
}
