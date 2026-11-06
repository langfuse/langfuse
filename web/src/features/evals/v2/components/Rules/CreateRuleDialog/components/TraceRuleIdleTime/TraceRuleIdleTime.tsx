import { useState } from "react";
import { TRPCClientError } from "@trpc/client";
import { DEFAULT_TOPIC_FACETS } from "@langfuse/shared/topics";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { Input } from "@/src/components/design-system/Input/Input";
import { Button } from "@/src/components/ui/button";
import { PopoverController } from "@/src/components/ui/popover";
import { selectTriggerClassName } from "@/src/components/ui/select";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";

const FALLBACK_IDLE_MS = 600_000;

function secondsLabel(traceIdleMs: number | null | undefined) {
  return String((traceIdleMs ?? FALLBACK_IDLE_MS) / 1000);
}

function formatProjectIdleTime(traceIdleMs: number | null | undefined) {
  const seconds = Math.round((traceIdleMs ?? FALLBACK_IDLE_MS) / 1000);
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

/**
 * Project idle time, copied from Topics settings. The trigger shows the stored
 * project value. Writes only through `topics.saveSetup`.
 */
export function TraceRuleIdleTime({ projectId }: { projectId: string }) {
  const utils = api.useUtils();
  const settings = api.topics.tracingReadinessSettings.useQuery({ projectId });
  const saveSetup = api.topics.saveSetup.useMutation();
  const projectSeconds = secondsLabel(settings.data?.traceIdleMs);
  const [idleSeconds, setIdleSeconds] = useState(projectSeconds);
  const [synced, setSynced] = useState(projectSeconds);
  const [focused, setFocused] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (
    !settings.isPending &&
    projectSeconds !== synced &&
    !saveSetup.isPending &&
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
    if (!Number.isInteger(seconds) || seconds < 60 || seconds > 3600) {
      setNote("Wait between 60 and 3,600 seconds.");
      return;
    }
    setNote(null);
    try {
      const [rules, models, facets] = await Promise.all([
        utils.topics.rules.fetch({ projectId }),
        utils.topics.modelSettings.fetch({ projectId }),
        utils.topics.facets.fetch({ projectId }),
      ]);
      const rule = rules[0];
      if (!rule || !models.summary || !models.embedding || !models.clustering) {
        setIdleSeconds(projectSeconds);
        setNote("Topics is not set up, so the idle time was not saved.");
        return;
      }
      const assigned = new Set(rule.facetIds);
      const facetSelection = DEFAULT_TOPIC_FACETS.map((facet) => ({
        name: facet.name,
        enabled: facets.some(
          (item) =>
            item.isBuiltIn && item.name === facet.name && assigned.has(item.id),
        ),
      }));
      if (!facetSelection.some((facet) => facet.enabled)) {
        setIdleSeconds(projectSeconds);
        setNote("Topics has no enabled facet, so the idle time was not saved.");
        return;
      }
      await saveSetup.mutateAsync({
        projectId,
        summary: models.summary,
        embedding: models.embedding,
        embeddingDimensions: models.embeddingDimensions,
        clustering: models.clustering,
        facets: facetSelection,
        customFacetIds: facets.flatMap((facet) =>
          !facet.isBuiltIn && assigned.has(facet.id) ? [facet.id] : [],
        ),
        filter: rule.filter,
        traceIdleMs: seconds * 1000,
        ruleId: rule.id,
      });
      const saved = { traceIdleMs: seconds * 1000 };
      const savedSeconds = String(seconds);
      utils.topics.tracingReadinessSettings.setData({ projectId }, saved);
      setSynced(savedSeconds);
      setIdleSeconds(savedSeconds);
      await utils.topics.tracingReadinessSettings.invalidate({ projectId });
      utils.topics.tracingReadinessSettings.setData({ projectId }, saved);
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
                  min={60}
                  max={3600}
                  value={idleSeconds}
                  disabled={saveSetup.isPending}
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
