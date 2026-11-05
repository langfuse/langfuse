import { useState } from "react";
import { TRPCClientError } from "@trpc/client";
import { DEFAULT_TOPIC_FACETS } from "@langfuse/shared/topics";

import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  TOPIC_SETUP_WAIT_MINUTES,
  type TopicSetupWaitMinutes,
} from "@/src/features/topics/topic-setup-flow";
import { api } from "@/src/utils/api";

function formatIdleMinutes(traceIdleMs: number) {
  const minutes = traceIdleMs / 60_000;
  return Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
}

function projectIdleLabel(traceIdleMs: number | null | undefined) {
  if (traceIdleMs == null) {
    return "Project idle time is the deployment default.";
  }
  return `Project idle time is ${formatIdleMinutes(traceIdleMs)} min.`;
}

function headerLabel(traceIdleMs: number | null | undefined, pending: boolean) {
  if (pending) return "Idle time";
  if (traceIdleMs == null) return "Idle time: default";
  return `Idle time: ${formatIdleMinutes(traceIdleMs)} min`;
}

/**
 * Project idle time, using the Topics wait control and `topics.saveSetup`.
 * "Project" leaves the stored value alone and shows it.
 */
export function TraceRuleIdleTime({
  projectId,
  placement,
}: {
  projectId: string;
  placement: "header" | "section";
}) {
  const utils = api.useUtils();
  const settings = api.topics.tracingReadinessSettings.useQuery({ projectId });
  const saveSetup = api.topics.saveSetup.useMutation();
  const [choice, setChoice] = useState<"project" | TopicSetupWaitMinutes>(
    "project",
  );
  const [note, setNote] = useState<string | null>(null);

  const selectMinutes = async (minutes: TopicSetupWaitMinutes) => {
    setChoice(minutes);
    setNote(null);
    try {
      const [rules, models, facets] = await Promise.all([
        utils.topics.rules.fetch({ projectId }),
        utils.topics.modelSettings.fetch({ projectId }),
        utils.topics.facets.fetch({ projectId }),
      ]);
      const rule = rules[0];
      if (!rule || !models.summary || !models.embedding || !models.clustering) {
        setChoice("project");
        setNote(
          settings.data?.traceIdleMs == null
            ? "Topics is not set up, so the project idle time stays the deployment default."
            : `Topics is not set up, so the project idle time stays ${settings.data.traceIdleMs / 60_000} min.`,
        );
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
        setChoice("project");
        setNote(
          "Topics has no enabled facet, so the project idle time is unchanged.",
        );
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
        traceIdleMs: minutes * 60_000,
        ruleId: rule.id,
      });
      await utils.topics.tracingReadinessSettings.invalidate({ projectId });
    } catch (error) {
      setChoice("project");
      setNote(
        error instanceof TRPCClientError
          ? error.message
          : "Could not save the project idle time.",
      );
    }
  };

  const controls = (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-3">
        {placement === "header" ? (
          <span className="text-sm">Wait before evaluating</span>
        ) : null}
        <div className="flex gap-1.5">
          <button
            type="button"
            className={
              choice === "project"
                ? "bg-primary text-primary-foreground border-primary rounded-full border px-3 py-1 text-sm"
                : "rounded-full border px-3 py-1 text-sm"
            }
            aria-pressed={choice === "project"}
            disabled={saveSetup.isPending}
            onClick={() => {
              setChoice("project");
              setNote(null);
            }}
          >
            Project
          </button>
          {TOPIC_SETUP_WAIT_MINUTES.map((minutes) => {
            const selected = choice === minutes;
            return (
              <button
                key={minutes}
                type="button"
                className={
                  selected
                    ? "bg-primary text-primary-foreground border-primary rounded-full border px-3 py-1 text-sm"
                    : "rounded-full border px-3 py-1 text-sm"
                }
                aria-pressed={selected}
                disabled={saveSetup.isPending}
                onClick={() => {
                  selectMinutes(minutes).catch(() => undefined);
                }}
              >
                {minutes} min
              </button>
            );
          })}
        </div>
      </div>
      {choice === "project" ? (
        <p className="text-muted-foreground text-xs">
          {settings.isPending
            ? "Loading project idle time."
            : projectIdleLabel(settings.data?.traceIdleMs)}
        </p>
      ) : null}
      {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
    </div>
  );

  if (placement === "section") return controls;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="border-border-contrast"
          disabled={saveSetup.isPending}
        >
          {headerLabel(settings.data?.traceIdleMs, settings.isPending)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto">
        {controls}
      </PopoverContent>
    </Popover>
  );
}
