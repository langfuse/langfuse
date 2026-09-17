import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { Badge } from "@/src/components/design-system/Badge/Badge";

/**
 * The context a score was created in — its "level". A score's meaning depends
 * on this context, so every surface that shows a score must show its level
 * (LFE-10596; see the ScoreTag Storybook story for the full guidance).
 *
 * Only `trace` and `observation` are derivable from data today. `session` and
 * `experiment` are defined ahead of the backend writing session_id /
 * experiment_id onto scores, so the coding is stable when they arrive.
 */
export type ScoreLevel = "trace" | "observation" | "session" | "experiment";

export const SCORE_LEVEL_LABELS: Record<ScoreLevel, string> = {
  trace: "Trace",
  observation: "Observation",
  session: "Session",
  experiment: "Experiment",
};

const SCORE_LEVEL_DESCRIPTIONS: Record<ScoreLevel, string> = {
  trace: "Trace-level score: the whole trace was the evaluation context",
  observation:
    "Observation-level score: a single observation was the evaluation context",
  session: "Session-level score: a session was the evaluation context",
  experiment:
    "Experiment-level score: an experiment run was the evaluation context",
};

/**
 * Stored scores carry no explicit level field — level is derived from which
 * context id is set, narrowest first (an observation score also carries its
 * traceId). Callers with an implicit trace context (e.g. the trace detail
 * view) may pass just `observationId`; the fallback is trace.
 */
export const scoreLevelFromScore = (score: {
  observationId?: string | null;
  traceId?: string | null;
  sessionId?: string | null;
  datasetRunId?: string | null;
}): ScoreLevel =>
  score.observationId != null
    ? "observation"
    : score.traceId != null
      ? "trace"
      : score.sessionId != null
        ? "session"
        : score.datasetRunId != null
          ? "experiment"
          : "trace";

export interface ScoreTagProps {
  level: ScoreLevel;
}

/** Tags a score with the level it was created at; the word carries the meaning. */
export const ScoreTag = ({ level }: ScoreTagProps) => {
  return (
    <Tooltip label={SCORE_LEVEL_DESCRIPTIONS[level]}>
      {({ getTriggerProps }) => (
        <span {...getTriggerProps()}>
          <Badge text={SCORE_LEVEL_LABELS[level]} />
        </span>
      )}
    </Tooltip>
  );
};
