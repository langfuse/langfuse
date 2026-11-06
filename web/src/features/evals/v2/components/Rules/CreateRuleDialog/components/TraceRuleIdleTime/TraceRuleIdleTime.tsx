import { useState } from "react";
import { TRPCClientError } from "@trpc/client";
import { DEFAULT_TOPIC_FACETS } from "@langfuse/shared/topics";

import { Input } from "@/src/components/design-system/Input/Input";
import { api } from "@/src/utils/api";

const FALLBACK_IDLE_MS = 600_000;

function secondsLabel(traceIdleMs: number | null | undefined) {
  return String((traceIdleMs ?? FALLBACK_IDLE_MS) / 1000);
}

export function traceIdleHeaderLabel(
  traceIdleMs: number | null | undefined,
  pending: boolean,
) {
  if (pending) return "Idle time";
  return `Idle time: ${secondsLabel(traceIdleMs)} s`;
}

/**
 * Project idle time, copied from Topics settings. Writes only through
 * `topics.saveSetup`, the same mutation Topics uses.
 */
export function TraceRuleIdleTime({ projectId }: { projectId: string }) {
  const utils = api.useUtils();
  const settings = api.topics.tracingReadinessSettings.useQuery({ projectId });
  const saveSetup = api.topics.saveSetup.useMutation();
  const baseline = secondsLabel(settings.data?.traceIdleMs);
  const [idleSeconds, setIdleSeconds] = useState(baseline);
  const [syncedBaseline, setSyncedBaseline] = useState(baseline);
  const [note, setNote] = useState<string | null>(null);
  if (
    !settings.isPending &&
    baseline !== syncedBaseline &&
    !saveSetup.isPending
  ) {
    setSyncedBaseline(baseline);
    setIdleSeconds(baseline);
  }

  const commit = async () => {
    if (idleSeconds === baseline) {
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
        setIdleSeconds(baseline);
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
        setIdleSeconds(baseline);
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
      await utils.topics.tracingReadinessSettings.invalidate({ projectId });
    } catch (error) {
      setIdleSeconds(baseline);
      setNote(
        error instanceof TRPCClientError
          ? error.message
          : "Could not save the idle time.",
      );
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div className="w-24 shrink-0">
          <Input
            aria-label="Seconds to wait after the last observation"
            type="number"
            inputMode="numeric"
            min={60}
            max={3600}
            value={idleSeconds}
            disabled={settings.isPending || saveSetup.isPending}
            onChange={(event) => {
              setIdleSeconds(event.target.value);
              setNote(null);
            }}
            onBlur={() => {
              commit().catch(() => undefined);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.currentTarget.blur();
            }}
          />
        </div>
        <p className="text-muted-foreground text-sm">
          seconds to wait after the last observation before considering the
          trace done and summarizing it.
        </p>
      </div>
      {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
    </div>
  );
}
