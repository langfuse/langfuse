import { expect, fn, userEvent } from "storybook/test";
import { vi } from "vitest";

import preview from "../../../../.storybook/preview";
import { AnnotateDrawerToolbarButton } from "./AnnotateDrawerController";

vi.mock("./AnnotateDrawerContent", () => ({
  AnnotateDrawerContent: () => null,
}));

const meta = preview.meta({
  component: AnnotateDrawerToolbarButton,
});

export const Default = meta.story({
  args: {
    annotationCount: 0,
    buttonVariant: "secondary",
    disabled: false,
    onClick: fn(),
    showAnnotationCount: false,
    size: "default",
  },
});

export const WithAnnotationCount = meta.story({
  args: {
    annotationCount: 3,
    buttonVariant: "secondary",
    disabled: false,
    onClick: fn(),
    showAnnotationCount: true,
    size: "default",
  },
});

export const Disabled = meta.story({
  args: {
    annotationCount: 3,
    buttonVariant: "secondary",
    disabled: true,
    onClick: fn(),
    showAnnotationCount: true,
    size: "default",
  },
});

const openDrawer = fn();

export const OpensDrawer = meta.story({
  name: "(Test) Opens Drawer",
  args: {
    annotationCount: 0,
    buttonVariant: "secondary",
    disabled: false,
    onClick: openDrawer,
    showAnnotationCount: false,
    size: "default",
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Annotate" }));
    await expect(openDrawer).toHaveBeenCalledOnce();
  },
});
