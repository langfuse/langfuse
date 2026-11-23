import { useState } from "react";
import { TRPCClientError } from "@trpc/client";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { Input } from "@/src/components/design-system/Input/Input";
import { Button } from "@/src/components/ui/button";
import { PopoverController } from "@/src/components/ui/popover";
import { selectTriggerClassName } from "@/src/components/ui/select";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";

const IDLE_SECONDS_MIN = 60;
const IDLE_SECONDS_MAX = 3_600;

function secondsLabel(traceIdleMs: number | null | undefined) {
  if (traceIdleMs == null) return "";
  return String(Math.round(traceIdleMs / 1000));
}

function formatProjectIdleTime(traceIdleMs: number | null | undefined) {
  if (traceIdleMs == null) return "Default";
  const seconds = Math.round(traceIdleMs / 1000);
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

/**
 * How long a trace must be quiet before this project evaluates it.
 * A blank value is the deployment default; this app does not know that default.
 */
export function TraceRuleIdleTime({ projectId }: { projectId: string }) {
  const utils = api.useUtils();
  const settings = api.evalsV2.rules.tracingReadinessSettings.useQuery({
    projectId,
  });
  const saveIdleTime =
    api.evalsV2.rules.saveTracingReadinessSettings.useMutation();
  const projectSeconds = secondsLabel(settings.data?.traceIdleMs);
  const [idleSeconds, setIdleSeconds] = useState(projectSeconds);
  const [synced, setSynced] = useState(projectSeconds);
  const [focused, setFocused] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (
    !settings.isPending &&
    projectSeconds !== synced &&
    !saveIdleTime.isPending &&
    !focused
  ) {
    setSynced(projectSeconds);
    setIdleSeconds(projectSeconds);
  }

  const commit = async () => {
    if (idleSeconds === projectSeconds) {
      setNote(null);
      return;
    }
    const seconds = Number(idleSeconds);
    if (
      !Number.isInteger(seconds) ||
      seconds < IDLE_SECONDS_MIN ||
      seconds > IDLE_SECONDS_MAX
    ) {
      setNote("Wait between 60 and 3,600 seconds.");
      return;
    }
    setNote(null);
    try {
      const saved = await saveIdleTime.mutateAsync({
        projectId,
        traceIdleMs: seconds * 1000,
      });
      const savedSeconds = secondsLabel(saved.traceIdleMs);
      utils.evalsV2.rules.tracingReadinessSettings.setData(
        { projectId },
        saved,
      );
      setSynced(savedSeconds);
      setIdleSeconds(savedSeconds);
      await utils.evalsV2.rules.tracingReadinessSettings.invalidate({
        projectId,
      });
      utils.evalsV2.rules.tracingReadinessSettings.setData(
        { projectId },
        saved,
      );
    } catch (error) {
      setIdleSeconds(projectSeconds);
      setNote(
        error instanceof TRPCClientError
          ? error.message
          : "Could not save the idle time.",
      );
    }
  };

  const shown = settings.isPending
    ? "…"
    : formatProjectIdleTime(settings.data?.traceIdleMs);

  return (
    <div className="flex flex-col gap-1.5">
      <PopoverController
        align="start"
        contentClassName="w-80"
        disabled={settings.isPending}
        modal={false}
        renderContent={() => (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-24 shrink-0">
                <Input
                  aria-label="Project-level idle time in seconds"
                  type="number"
                  inputMode="numeric"
                  min={IDLE_SECONDS_MIN}
                  max={IDLE_SECONDS_MAX}
                  value={idleSeconds}
                  disabled={saveIdleTime.isPending}
                  onChange={(event) => {
                    setIdleSeconds(event.target.value);
                    setNote(null);
                  }}
                  onFocus={() => setFocused(true)}
                  onBlur={() => {
                    commit()
                      .finally(() => setFocused(false))
                      .catch(() => undefined);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.currentTarget.blur();
                  }}
                />
              </div>
              <p className="text-muted-foreground text-sm">
                seconds to wait after the last observation.
              </p>
            </div>
            {note ? (
              <p className="text-muted-foreground text-xs">{note}</p>
            ) : null}
          </div>
        )}
      >
        {({ Trigger }) => (
          <Trigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={settings.isPending}
              aria-label="Project-level idle time"
              className={cn(
                selectTriggerClassName,
                "h-auto min-h-8 w-auto max-w-full min-w-0 justify-start",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate" title={shown}>
                  {shown}
                </span>
                <Badge color="filled" text="Project-level idle time" />
              </span>
              <DropdownIndicator />
            </Button>
          </Trigger>
        )}
      </PopoverController>
    </div>
  );
}
