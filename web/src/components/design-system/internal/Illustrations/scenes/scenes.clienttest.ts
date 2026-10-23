// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { ViewBox } from "../engine/projection";
import { AGENTS_DEFAULTS } from "./agents/content";
import { layoutAgents } from "./agents/layout";
import { ANNOTATION_DEFAULTS } from "./annotation/content";
import { layoutAnnotation } from "./annotation/layout";
import { EVALUATION_DEFAULTS } from "./evaluation/content";
import { layoutEvaluation } from "./evaluation/layout";
import { EXPERIMENTS_DEFAULTS } from "./experiments/content";
import { layoutExperiments } from "./experiments/layout";
import { SCENE_FRAMES } from "./frames";
import { HALO_DEFAULTS } from "./halo/content";
import { layoutHalo } from "./halo/layout";
import { METRICS_DEFAULTS } from "./metrics/content";
import { layoutMetrics } from "./metrics/layout";
import { OBSERVABILITY_DEFAULTS } from "./observability/content";
import { layoutObservability } from "./observability/layout";
import { PLAYGROUND_DEFAULTS } from "./playground/content";
import { layoutPlayground } from "./playground/layout";
import { PROMPT_DEFAULTS } from "./prompt/content";
import { layoutPrompt } from "./prompt/layout";
import type { SceneVariant } from "./registry";

/** Every scene's layout for its defaults; a scene missing here fails the typecheck. */
const DEFAULT_LAYOUTS: {
  [V in SceneVariant]: () => { viewBox: ViewBox; runDuration: number };
} = {
  observability: () => layoutObservability(OBSERVABILITY_DEFAULTS),
  evaluation: () => layoutEvaluation(EVALUATION_DEFAULTS),
  prompt: () => layoutPrompt(PROMPT_DEFAULTS),
  playground: () => layoutPlayground(PLAYGROUND_DEFAULTS),
  experiments: () => layoutExperiments(EXPERIMENTS_DEFAULTS),
  annotation: () => layoutAnnotation(ANNOTATION_DEFAULTS),
  metrics: () => layoutMetrics(METRICS_DEFAULTS),
  agents: () => layoutAgents(AGENTS_DEFAULTS),
  halo: () => layoutHalo(HALO_DEFAULTS),
};

const variants = Object.keys(DEFAULT_LAYOUTS) as SceneVariant[];

describe("every scene", () => {
  it.each(variants)("%s finishes a run within three seconds", (variant) => {
    expect(DEFAULT_LAYOUTS[variant]().runDuration).toBeLessThanOrEqual(3000);
  });

  it.each(variants)(
    "%s fills its loading frame with its defaults, so nothing moves when it loads",
    (variant) => {
      expect(DEFAULT_LAYOUTS[variant]().viewBox).toEqual(SCENE_FRAMES[variant]);
    },
  );
});
