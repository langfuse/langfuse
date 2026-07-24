import { Fragment } from "react";

import preview from "../../.storybook/preview";
import { ScoreTag, SCORE_LEVEL_LABELS, type ScoreLevel } from "./score-tag";

const meta = preview.meta({
  component: ScoreTag,
});

export const Default = meta.story({
  args: {
    level: "trace",
  },
});

export const Compact = meta.story({
  args: {
    level: "trace",
    compact: true,
  },
});

const ALL_LEVELS = Object.keys(SCORE_LEVEL_LABELS) as ScoreLevel[];

// The global score-level color coding at a glance: all four levels, full pill
// and compact dot. Flip the toolbar theme to check the dark-mode tokens.
export const VariantMatrix = meta.story({
  args: {
    level: "trace",
  },
  render: () => (
    <div className="grid w-fit grid-cols-[auto_auto_auto] items-center gap-x-6 gap-y-2 text-sm">
      <span className="text-muted-foreground text-xs">Level</span>
      <span className="text-muted-foreground text-xs">Full</span>
      <span className="text-muted-foreground text-xs">Compact</span>
      {ALL_LEVELS.map((level) => (
        <Fragment key={level}>
          <span>{SCORE_LEVEL_LABELS[level]}</span>
          <span>
            <ScoreTag level={level} />
          </span>
          <span className="inline-flex items-center">
            <ScoreTag level={level} compact />
          </span>
        </Fragment>
      ))}
    </div>
  ),
});

// The tag next to real score chips, at the density it ships in: full pill in
// list/option rows, compact dot in dense tree/timeline rows.
export const InContext = meta.story({
  args: {
    level: "trace",
  },
  render: () => (
    <div className="flex w-fit flex-col gap-3">
      <div className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
        <span className="font-mono">scores.CSAT</span>
        <span className="text-muted-foreground text-xs">numeric score</span>
        <ScoreTag level="trace" />
      </div>
      <div className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
        <span className="font-mono">scores.accuracy</span>
        <span className="text-muted-foreground text-xs">numeric score</span>
        <ScoreTag level="observation" />
      </div>
      <div className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
        <span>generate-answer</span>
        <span className="bg-tertiary text-tertiary-foreground inline-flex items-center gap-1 rounded-md px-1">
          accuracy: 0.92
          <ScoreTag level="observation" compact />
        </span>
        <span className="bg-tertiary text-tertiary-foreground inline-flex items-center gap-1 rounded-md px-1">
          CSAT: 1
          <ScoreTag level="trace" compact />
        </span>
      </div>
    </div>
  ),
});
