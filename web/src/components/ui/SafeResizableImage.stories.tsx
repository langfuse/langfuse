import { useState } from "react";
import { expect, fireEvent, fn } from "storybook/test";
import preview from "@/.storybook/preview";
import { SafeResizableImage } from "./SafeResizableImage";

const meta = preview.meta({
  component: SafeResizableImage,
  args: { src: "/icon.svg", alt: "Preview" },
});

export const ApplicationMedia = meta.story({
  name: "(Test) Application media",
  args: { fitContent: true, compactWidth: "200px" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("img", { name: "Preview" })).toHaveAttribute(
      "src",
      "/icon.svg",
    );
  },
});

export const UnsafeSource = meta.story({
  name: "(Test) Unsafe source",
  args: { src: "javascript:alert(1)" },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("img")).not.toBeInTheDocument();
    await expect(canvas.getByText("Cannot load image")).toBeVisible();
  },
});

export const LoadErrorAndRecovery = meta.story({
  name: "(Test) Load error and recovery",
  render: function Render(args) {
    const [src, setSrc] = useState("/icon.svg?version=a");
    return (
      <>
        <button onClick={() => setSrc("/icon.svg?version=b")}>
          Replace source
        </button>
        <SafeResizableImage {...args} state={undefined} src={src} />
      </>
    );
  },
  play: async ({ canvas, userEvent }) => {
    await fireEvent.error(canvas.getByRole("img"));
    await expect(canvas.queryByRole("img")).not.toBeInTheDocument();
    await expect(canvas.getByText("Cannot load image")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Replace source" }),
    );
    await expect(canvas.getByRole("img")).toHaveAttribute(
      "src",
      "/icon.svg?version=b",
    );
  },
});

export const Ready = meta.story({
  args: {
    src: undefined,
    state: {
      status: "ready",
      Image: ({ alt }) => (
        <svg
          role="img"
          aria-label={alt}
          width={64}
          height={64}
          viewBox="0 0 64 64"
        >
          <rect width={64} height={64} rx={8} fill="currentColor" />
        </svg>
      ),
      imageProps: { src: "/icon.svg", onLoadError: fn() },
    },
  },
});

const onLoad = fn();
export const Consent = meta.story({
  name: "(Test) Supplied consent",
  args: {
    src: undefined,
    state: { status: "consent", src: "https://example.com/image.png", onLoad },
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.queryByRole("img")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Load Image" }));
    await expect(onLoad).toHaveBeenCalledOnce();
  },
});

export const Loading = meta.story({
  args: { src: undefined, state: { status: "loading" } },
});

export const Error = meta.story({
  args: {
    src: undefined,
    state: {
      status: "error",
      src: "https://example.com/image.png",
      message: "Cannot load image",
    },
  },
});

export const ToggleSize = meta.story({
  name: "(Test) Toggle size",
  args: { fitContent: true, compactWidth: "200px" },
  play: async ({ canvas, userEvent }) => {
    const image = canvas.getByRole("img");
    await userEvent.hover(image);
    await userEvent.click(canvas.getByRole("button", { name: "Expand image" }));
    await expect(
      canvas.getByRole("button", { name: "Shrink image" }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("img")).toBe(image);
    await userEvent.click(canvas.getByRole("button", { name: "Shrink image" }));
    await expect(
      canvas.getByRole("button", { name: "Expand image" }),
    ).toBeInTheDocument();
  },
});
