import { expect, fn, userEvent } from "storybook/test";
import { vi } from "vitest";

import preview from "../../../../.storybook/preview";
import { AnnotateDrawerMenuButton } from "./AnnotateDrawerController";

vi.mock("./AnnotateDrawerContent", () => ({
  AnnotateDrawerContent: () => null,
}));

const meta = preview.meta({
  component: AnnotateDrawerMenuButton,
});

export const Default = meta.story({
  args: {
    annotationCount: 0,
    disabled: false,
    onClick: fn(),
    showAnnotationCount: false,
  },
});

export const WithAnnotationCount = meta.story({
  args: {
    annotationCount: 3,
    disabled: false,
    onClick: fn(),
    showAnnotationCount: true,
  },
});

export const Disabled = meta.story({
  args: {
    annotationCount: 3,
    disabled: true,
    onClick: fn(),
    showAnnotationCount: true,
  },
});

const openDrawer = fn();

export const OpensDrawer = meta.story({
  name: "(Test) Opens Drawer",
  args: {
    annotationCount: 0,
    disabled: false,
    onClick: openDrawer,
    showAnnotationCount: false,
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Annotate" }));
    await expect(openDrawer).toHaveBeenCalledOnce();
  },
});
