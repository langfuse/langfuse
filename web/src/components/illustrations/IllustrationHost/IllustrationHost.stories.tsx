import preview from "../../../../.storybook/preview";
import { LangfuseIllustration } from "../LangfuseIllustration/LangfuseIllustration";
import { IllustrationHost } from "./IllustrationHost";

const meta = preview.meta({
  component: IllustrationHost,
  args: {
    children: (
      <a
        href="#evaluation"
        className="border-border bg-card grid max-w-md gap-3 rounded-lg border p-4"
      >
        <span className="flex flex-col gap-1">
          <span className="text-foreground text-sm font-bold">Evaluation</span>
          <span className="text-muted-foreground text-xs">
            Hover anywhere on the card, or tab to it: the scene replays and its
            hero lifts.
          </span>
        </span>
        <LangfuseIllustration
          variant="evaluation"
          motion="hover"
          floor="panel"
          accent="none"
          a11y="decorative"
        />
      </a>
    ),
  },
  argTypes: {
    children: { control: false },
  },
});

export const Default = meta.story({});
