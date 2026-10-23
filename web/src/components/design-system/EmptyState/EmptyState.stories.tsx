import preview from "../../../../.storybook/preview";
import { Button } from "../Button/Button";
import type { DrawingMotion } from "../internal/Illustrations/drawings/Drawing";
import {
  DESIGNS,
  type DrawingName,
} from "../internal/Illustrations/drawings/designs";
import { EmptyState } from "./EmptyState";

/** EmptyState.Illustration's props, as controls on the story. */
type IllustrationArgs = {
  drawing: DrawingName;
  motion: DrawingMotion;
  backdrop: "grid" | "panel" | "none";
  accent: "none" | "highlight";
};

const drawings = Object.keys(DESIGNS) as DrawingName[];

const illustration = { category: "EmptyState.Illustration" };

const illustrationArgTypes = {
  drawing: {
    control: "select",
    options: drawings,
    description: "Which drawing to show.",
    table: illustration,
  },
  motion: {
    control: "radio",
    options: ["subtle", "hover", "off"] satisfies IllustrationArgs["motion"][],
    description:
      "subtle builds once in view and moves while hovered; hover rebuilds on every hover; off stays still.",
    table: illustration,
  },
  backdrop: {
    control: "radio",
    options: ["grid", "panel", "none"] satisfies IllustrationArgs["backdrop"][],
    description:
      "The floor under the drawing: a fading grid, a tinted panel, or nothing.",
    table: illustration,
  },
  accent: {
    control: "radio",
    options: ["none", "highlight"] satisfies IllustrationArgs["accent"][],
    description: "highlight paints the raised element in the primary accent.",
    table: illustration,
  },
} as const;

const meta = preview.type<{ args: IllustrationArgs }>().meta({
  component: EmptyState,
  argTypes: { ...illustrationArgTypes, children: { control: false } },
  render: ({ size, drawing, motion, backdrop, accent }) => (
    // A new key per change replays the entrance with the new settings
    <EmptyState
      key={`${size}-${drawing}-${motion}-${backdrop}-${accent}`}
      size={size}
    >
      <EmptyState.Illustration
        drawing={drawing}
        motion={motion}
        backdrop={backdrop}
        accent={accent}
      />
      <EmptyState.Title level="h2">No traces yet</EmptyState.Title>
      <EmptyState.Description>
        Traces show every step your app takes: each LLM call, tool and
        retrieval, with its timing and cost.
      </EmptyState.Description>
      <EmptyState.Actions>
        <Button text="Set up tracing" />
        <Button
          text="Read the docs"
          variant="secondary"
          href="https://langfuse.com/docs/observability/overview"
        />
      </EmptyState.Actions>
    </EmptyState>
  ),
});

export const Default = meta.story({
  args: {
    size: "md",
    drawing: "traces",
    motion: "subtle",
    backdrop: "grid",
    accent: "none",
    children: null,
  },
});

export const Highlighted = meta.story({
  args: {
    size: "md",
    drawing: "prompts",
    motion: "subtle",
    backdrop: "grid",
    accent: "highlight",
    children: null,
  },
});

export const ExtraLarge = meta.story({
  args: {
    size: "xl",
    drawing: "traces",
    motion: "subtle",
    backdrop: "grid",
    accent: "none",
    children: null,
  },
});

export const VariantMatrix = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-4">
      {drawings.map((drawing) => (
        <EmptyState key={drawing} size="sm">
          <EmptyState.Illustration
            drawing={drawing}
            motion="subtle"
            backdrop="grid"
            accent="none"
          />
          <EmptyState.Title level="h3">{drawing}</EmptyState.Title>
        </EmptyState>
      ))}
    </div>
  ),
});
