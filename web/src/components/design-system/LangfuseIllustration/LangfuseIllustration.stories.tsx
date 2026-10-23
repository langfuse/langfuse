import { expect, waitFor } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { AGENTS_DEFAULTS } from "../internal/Illustrations/scenes/agents/content";
import { ANNOTATION_DEFAULTS } from "../internal/Illustrations/scenes/annotation/content";
import { EVALUATION_DEFAULTS } from "../internal/Illustrations/scenes/evaluation/content";
import { EXPERIMENTS_DEFAULTS } from "../internal/Illustrations/scenes/experiments/content";
import { HALO_DEFAULTS } from "../internal/Illustrations/scenes/halo/content";
import { METRICS_DEFAULTS } from "../internal/Illustrations/scenes/metrics/content";
import { OBSERVABILITY_DEFAULTS } from "../internal/Illustrations/scenes/observability/content";
import { PLAYGROUND_DEFAULTS } from "../internal/Illustrations/scenes/playground/content";
import { PROMPT_DEFAULTS } from "../internal/Illustrations/scenes/prompt/content";
import {
  SCENES,
  type SceneVariant,
} from "../internal/Illustrations/scenes/registry";
import { LangfuseIllustration } from "./LangfuseIllustration";

const variants = Object.keys(SCENES) as SceneVariant[];

const look = {
  motion: "once",
  floor: "panel",
  accent: "none",
  a11y: "described",
} as const;

const meta = preview.meta({
  component: LangfuseIllustration,
  argTypes: {
    content: {
      control: "object",
      description:
        "The scene's sample data, merged over its built-in example: every text, number and true/false value is editable here. Nested enums: a score's status is pass | fail | neutral; a value's format is percent | decimal | duration | currency | count | compact.",
    },
  },
});

export const Default = meta.story({
  args: { variant: "observability", ...look },
});

export const Described = meta.story({
  name: "(Test) Described",
  args: { variant: "observability", ...look },
  play: async ({ canvas }) => {
    const scene = await canvas.findByRole("img");
    await expect(scene).toHaveAccessibleName(
      /^A trace: handle-chatbot-message/,
    );
  },
});

export const Decorative = meta.story({
  name: "(Test) Decorative",
  args: { variant: "observability", ...look, a11y: "decorative" },
  play: async ({ canvasElement }) => {
    // Once the scene has loaded, it's drawn but not exposed as an image
    await waitFor(() =>
      expect(canvasElement.querySelector("svg g")).not.toBeNull(),
    );
    await expect(canvasElement.querySelector("[role=img]")).toBeNull();
  },
});

export const Observability = meta.story({
  args: { variant: "observability", ...look, content: OBSERVABILITY_DEFAULTS },
});

export const Evaluation = meta.story({
  args: { variant: "evaluation", ...look, content: EVALUATION_DEFAULTS },
});

export const Prompt = meta.story({
  args: { variant: "prompt", ...look, content: PROMPT_DEFAULTS },
});

export const Playground = meta.story({
  args: { variant: "playground", ...look, content: PLAYGROUND_DEFAULTS },
});

export const Experiments = meta.story({
  args: { variant: "experiments", ...look, content: EXPERIMENTS_DEFAULTS },
});

export const Annotation = meta.story({
  args: { variant: "annotation", ...look, content: ANNOTATION_DEFAULTS },
});

export const Metrics = meta.story({
  args: { variant: "metrics", ...look, content: METRICS_DEFAULTS },
});

export const Agents = meta.story({
  args: { variant: "agents", ...look, content: AGENTS_DEFAULTS },
});

export const Halo = meta.story({
  args: { variant: "halo", ...look, content: HALO_DEFAULTS },
});

export const CustomContent = meta.story({
  args: {
    variant: "observability",
    ...look,
    floor: "grid",
    accent: "highlight",
    content: {
      spans: [
        { name: "chat-completion", duration: 1.24, cost: 0.0021, start: 0 },
        { name: "retrieve-context", duration: 0.18, cost: 0.000012, start: 0 },
        { name: "openai.chat", duration: 1.02, cost: 0.002088, start: 0.2 },
      ],
      selected: 2,
      axis: [0, 0.25, 0.5, 0.75, 1, 1.25],
    },
  },
});

export const VariantMatrix = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] gap-6">
      {variants.map((variant) => (
        <LangfuseIllustration
          key={variant}
          variant={variant}
          motion="once"
          floor="panel"
          accent="none"
          a11y="described"
        />
      ))}
    </div>
  ),
});
