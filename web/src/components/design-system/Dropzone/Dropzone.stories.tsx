import { fn } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { Dropzone } from "./Dropzone";

const meta = preview.meta({
  component: Dropzone,
});

export const Empty = meta.story({
  args: {
    accept: { "text/csv": [".csv"] },
    isDisabled: false,
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    minSize: undefined,
    onDrop: fn(),
    onError: undefined,
    src: undefined,
    variant: "panel",
  },
});

export const WithFile = meta.story({
  args: {
    accept: undefined,
    isDisabled: false,
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    minSize: undefined,
    onDrop: fn(),
    onError: undefined,
    src: [new File(["name,value\nexample,1"], "example.csv")],
    variant: "panel",
  },
});

export const Compact = meta.story({
  args: {
    accept: undefined,
    isDisabled: false,
    maxFiles: 3,
    maxSize: 5 * 1024 * 1024,
    minSize: undefined,
    onDrop: fn(),
    onError: undefined,
    src: undefined,
    variant: "compact",
  },
});

export const CompactWithFiles = meta.story({
  args: {
    accept: undefined,
    isDisabled: false,
    maxFiles: 3,
    maxSize: 5 * 1024 * 1024,
    minSize: undefined,
    onDrop: fn(),
    onError: undefined,
    src: [
      new File([new Uint8Array(1024 * 1024)], "first.txt"),
      new File([new Uint8Array(512 * 1024)], "second.txt"),
    ],
    variant: "compact",
  },
});
