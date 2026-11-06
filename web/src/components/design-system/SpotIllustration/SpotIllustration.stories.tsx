import preview from "../../../../.storybook/preview";
import {
  DESIGNS,
  type DrawingName,
} from "../internal/Illustrations/drawings/designs";
import { IllustrationHost } from "../IllustrationHost/IllustrationHost";
import { SpotIllustration } from "./SpotIllustration";

const drawings = Object.keys(DESIGNS) as DrawingName[];
const sizes = ["sm", "md", "lg"] as const;

const meta = preview.meta({
  component: SpotIllustration,
  argTypes: {
    drawing: {
      control: "select",
      options: drawings,
      description: "Which drawing to show.",
    },
  },
  render: (args) => (
    // A new key per change replays the entrance with the new settings
    <SpotIllustration key={Object.values(args).join("-")} {...args} />
  ),
});

export const Default = meta.story({
  args: {
    drawing: "instrument",
    size: "md",
    motion: "subtle",
    backdrop: "none",
    accent: "none",
  },
});

export const Highlighted = meta.story({
  args: {
    drawing: "firstTrace",
    size: "md",
    motion: "subtle",
    backdrop: "grid",
    accent: "highlight",
  },
});

export const InACard = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <IllustrationHost>
      <a
        href="#prompts"
        className="border-border bg-card grid max-w-xs gap-2 rounded-lg border p-4"
      >
        <span className="text-foreground text-sm font-bold">
          Improve a prompt
        </span>
        <span className="text-muted-foreground text-xs">
          Hover anywhere on the card to play the drawing.
        </span>
        <span className="justify-self-end">
          <SpotIllustration
            drawing="prompts"
            size="sm"
            motion="hover"
            backdrop="none"
            accent="none"
          />
        </span>
      </a>
    </IllustrationHost>
  ),
});

export const VariantMatrix = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div className="flex flex-wrap items-end gap-6">
      {sizes.map((size) => (
        <SpotIllustration
          key={size}
          drawing="traces"
          size={size}
          motion="subtle"
          backdrop="grid"
          accent="none"
        />
      ))}
    </div>
  ),
});
