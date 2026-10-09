import { expect } from "storybook/test";
import preview from "../../../.storybook/preview";
import { PrettyJsonView } from "./PrettyJsonView";

const mediaPayload = {
  type: "image",
  mediaType: "image/png",
  content: "data:image/png;base64,iVBORw0KGgo=",
};

const meta = preview.meta({
  component: PrettyJsonView,
});

export const NarrowFormattedMediaLayout = meta.story({
  name: "(Test) Narrow formatted media layout",
  render: () => (
    <div
      data-testid="narrow-formatted-media"
      className="w-[205px] overflow-hidden rounded-2xl bg-blue-50 p-4"
    >
      <p className="mb-2 text-sm">Show this S3 image.</p>
      <PrettyJsonView json={mediaPayload} currentView="pretty" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const outer = canvasElement.querySelector<HTMLElement>(
      '[data-testid="narrow-formatted-media"]',
    );
    const table = canvasElement.querySelector<HTMLTableElement>("table");
    const chip = canvasElement.querySelector<HTMLButtonElement>(
      "button[data-media-tag]",
    );

    await expect(outer).not.toBeNull();
    await expect(table).not.toBeNull();
    await expect(chip).not.toBeNull();

    if (!outer || !table || !chip) return;

    await expect(outer.scrollWidth).toBe(outer.clientWidth);
    await expect(table.getBoundingClientRect().right).toBeLessThanOrEqual(
      outer.getBoundingClientRect().right,
    );
  },
});
