import { fn } from "storybook/test";
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
    content: "Attach another file",
    emptyState: "Attach files",
    maxFiles: 3,
    maxSize: 5 * 1024 * 1024,
    onDrop: fn(),
    variant: "compact",
  },
});
