import { expect, fn } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { Dropzone } from ".";

const meta = preview.meta({
  component: Dropzone,
});

export const Empty = meta.story({
  args: {
    accept: { "text/csv": [".csv"] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    onDrop: fn(),
    variant: "panel",
  },
});

export const WithFile = meta.story({
  args: {
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    onDrop: fn(),
    src: [new File(["name,value\nexample,1"], "example.csv")],
    variant: "panel",
  },
});

export const Compact = meta.story({
  args: {
    maxFiles: 3,
    maxSize: 5 * 1024 * 1024,
    onDrop: fn(),
    variant: "compact",
  },
});

export const CompactWithFiles = meta.story({
  args: {
    maxFiles: 3,
    maxSize: 5 * 1024 * 1024,
    onDrop: fn(),
    src: [
      new File([new Uint8Array(1024 * 1024)], "first.txt"),
      new File([new Uint8Array(512 * 1024)], "second.txt"),
    ],
    variant: "compact",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("2 files • 1.50 MB")).toBeVisible();
  },
});
