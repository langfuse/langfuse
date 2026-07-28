import { cva, type VariantProps } from "class-variance-authority";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/utils/tailwind";

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

// The global score-level color coding: one hue per level, used identically on
// every surface (do not restate these colors at call sites). Hue pairs live in
// globals.css (light + dark themes): observation=blue, trace=violet,
// session=teal, experiment=yellow.
const scoreTagVariants = cva(
  "inline-flex shrink-0 items-center rounded-sm px-1 py-0 text-xs",
  {
    variants: {
      level: {
        observation: "bg-light-blue text-dark-blue",
        trace: "bg-light-violet text-dark-violet",
        session: "bg-light-teal text-dark-teal",
        experiment: "bg-light-yellow text-dark-yellow",
      },
    },
  },
);

const scoreDotVariants = cva("inline-block size-2 shrink-0 rounded-full", {
  variants: {
    level: {
      observation: "bg-dark-blue",
      trace: "bg-dark-violet",
      session: "bg-dark-teal",
      experiment: "bg-dark-yellow",
    },
  },
});

export interface ScoreTagProps extends VariantProps<typeof scoreTagVariants> {
  level: ScoreLevel;
  /**
   * Dense-view variant (trace tree / timeline rows): a color dot carrying the
   * level name via tooltip + aria-label instead of a visible word.
   */
  compact?: boolean;
  className?: string;
}

/**
 * Tags a score with the level it was created at, using the global score-level
 * color coding. Never color-alone: the full variant shows the level word, the
 * compact dot carries it via tooltip and aria-label.
 */
export const ScoreTag = ({
  level,
  compact = false,
  className,
}: ScoreTagProps) => {
  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            aria-label={SCORE_LEVEL_DESCRIPTIONS[level]}
            className={cn(scoreDotVariants({ level }), className)}
          />
        </TooltipTrigger>
        <TooltipContent className="text-xs">
          {SCORE_LEVEL_DESCRIPTIONS[level]}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn(scoreTagVariants({ level }), className)}>
          {SCORE_LEVEL_LABELS[level]}
        </span>
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        {SCORE_LEVEL_DESCRIPTIONS[level]}
      </TooltipContent>
    </Tooltip>
  );
};
