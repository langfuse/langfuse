import { Sparkles } from "@langfuse/icons";
import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { TileCard } from "./TileCard";

const meta = preview.meta({
  component: TileCard,
  parameters: { layout: "padded" },
});

const tile = (
  <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md">
    <Sparkles size="base" aria-hidden />
  </span>
);

export const Default = meta.story({
  args: {
    size: "md",
    tile,
    title: "Anthropic",
    description: "API key from console.anthropic.com",
    actionLabel: "Connect",
    onClick: fn(),
  },
});

export const Small = meta.story({
  args: {
    size: "sm",
    tile,
    title: "LLM-as-a-judge",
    description: "Explains each score, for nuanced inputs.",
    onClick: fn(),
  },
});

export const WithLongDescription = meta.story({
  args: {
    size: "md",
    tile,
    title: "Google Vertex AI",
    description:
      "Service account key, project and location for the region the models run in",
    actionLabel: "Connect",
    onClick: fn(),
  },
});

export const Static = meta.story({
  render: () => (
    <TileCard.Static
      size="md"
      tile={tile}
      title="Anthropic"
      description="API key from console.anthropic.com"
    />
  ),
});
