import { expect, waitFor } from "storybook/test";
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
            Hover anywhere on the card: the scene replays and its hero lifts.
            Tab to it: the hero lifts without replaying.
          </span>
        </span>
        <LangfuseIllustration
          variant="evaluation"
          size="fill"
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

export const KeyboardFocus = meta.story({
  name: "(Test) Keyboard focus",
  play: async ({ canvasElement, userEvent }) => {
    // Once the scene has loaded, tabbing to the card lifts its hero but doesn't play the scene
    const scene = await waitFor(() => {
      const drawn = canvasElement.querySelector("svg g")?.closest("svg");
      expect(drawn).toBeTruthy();
      return drawn!;
    });
    await userEvent.tab();
    await waitFor(() => expect(scene).toHaveAttribute("data-host-active"));
    await expect(scene).not.toHaveAttribute("data-running");
  },
});

export const Touch = meta.story({
  name: "(Test) Touch",
  play: async ({ canvasElement }) => {
    // A finger landing on the card, for a tap or a scroll, neither plays the scene nor lifts its hero; a mouse does both
    const scene = await waitFor(() => {
      const drawn = canvasElement.querySelector("svg g")?.closest("svg");
      expect(drawn).toBeTruthy();
      return drawn!;
    });
    const card = canvasElement.querySelector("[data-illustration-host]")!;
    const enter = (pointerType: string) =>
      card.dispatchEvent(new PointerEvent("pointerenter", { pointerType }));

    enter("touch");
    // Two frames: time enough for a replay to render
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    await expect(scene).not.toHaveAttribute("data-running");
    await expect(scene).not.toHaveAttribute("data-host-active");

    enter("mouse");
    await waitFor(() => expect(scene).toHaveAttribute("data-running"));
    await expect(scene).toHaveAttribute("data-host-active");
  },
});
