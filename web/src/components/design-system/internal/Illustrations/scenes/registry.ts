import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { SceneLook } from "../engine/useScene";
import type { AgentsContent } from "./agents/content";
import type { AnnotationContent } from "./annotation/content";
import type { EvaluationContent } from "./evaluation/content";
import type { ExperimentsContent } from "./experiments/content";
import type { HaloContent } from "./halo/content";
import type { MetricsContent } from "./metrics/content";
import type { ObservabilityContent } from "./observability/content";
import type { PlaygroundContent } from "./playground/content";
import type { PromptContent } from "./prompt/content";

/** Each scene's content, the sample data it draws. */
export type SceneContent = {
  observability: ObservabilityContent;
  evaluation: EvaluationContent;
  prompt: PromptContent;
  playground: PlaygroundContent;
  experiments: ExperimentsContent;
  annotation: AnnotationContent;
  metrics: MetricsContent;
  agents: AgentsContent;
  halo: HaloContent;
};

export type SceneVariant = keyof SceneContent;

export type SceneProps<V extends SceneVariant> = SceneLook & {
  content: Partial<SceneContent[V]> | undefined;
};

/**
 * Every scene, each loaded on first use: langfuse.com's seven tool images in its order, then the agents and Halo
 * scenes drawn for the app. Created once here, so no render makes a new lazy component.
 */
export const SCENES: {
  [V in SceneVariant]: LazyExoticComponent<ComponentType<SceneProps<V>>>;
} = {
  observability: lazy(() =>
    import("./observability/ObservabilityScene").then((module) => ({
      default: module.ObservabilityScene,
    })),
  ),
  evaluation: lazy(() =>
    import("./evaluation/EvaluationScene").then((module) => ({
      default: module.EvaluationScene,
    })),
  ),
  prompt: lazy(() =>
    import("./prompt/PromptScene").then((module) => ({
      default: module.PromptScene,
    })),
  ),
  playground: lazy(() =>
    import("./playground/PlaygroundScene").then((module) => ({
      default: module.PlaygroundScene,
    })),
  ),
  experiments: lazy(() =>
    import("./experiments/ExperimentsScene").then((module) => ({
      default: module.ExperimentsScene,
    })),
  ),
  annotation: lazy(() =>
    import("./annotation/AnnotationScene").then((module) => ({
      default: module.AnnotationScene,
    })),
  ),
  metrics: lazy(() =>
    import("./metrics/MetricsScene").then((module) => ({
      default: module.MetricsScene,
    })),
  ),
  agents: lazy(() =>
    import("./agents/AgentsScene").then((module) => ({
      default: module.AgentsScene,
    })),
  ),
  halo: lazy(() =>
    import("./halo/HaloScene").then((module) => ({
      default: module.HaloScene,
    })),
  ),
};
