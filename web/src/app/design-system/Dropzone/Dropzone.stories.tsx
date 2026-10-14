import { expect, fn, userEvent } from "storybook/test";
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

export const Disabled = meta.story({
  args: {
    accept: undefined,
    isDisabled: true,
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    minSize: undefined,
    onDrop: fn(),
    onError: undefined,
    src: undefined,
    variant: "panel",
  },
});

export const WithConstraints = meta.story({
  args: {
    accept: { "image/png": [".png"] },
    isDisabled: false,
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024,
    minSize: 1024,
    onDrop: fn(),
    onError: undefined,
    src: undefined,
    variant: "panel",
  },
});

export const WithManyFiles = meta.story({
  args: {
    accept: undefined,
    isDisabled: false,
    maxFiles: 5,
    maxSize: 5 * 1024 * 1024,
    minSize: undefined,
    onDrop: fn(),
    onError: undefined,
    src: [
      new File([""], "first.txt"),
      new File([""], "second.txt"),
      new File([""], "third.txt"),
      new File([""], "fourth.txt"),
    ],
    variant: "panel",
  },
});

export const AcceptsFile = meta.story({
  name: "(Test) Accepts File",
  args: {
    accept: { "text/plain": [".txt"] },
    isDisabled: false,
    maxFiles: 1,
    maxSize: 1024,
    minSize: undefined,
    onDrop: fn(),
    onError: fn(),
    src: undefined,
    variant: "panel",
  },
  play: async ({ args, canvasElement }) => {
    const input = canvasElement.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Dropzone file input not found");
    }

    const file = new File(["content"], "example.txt", {
      type: "text/plain",
    });
    await userEvent.upload(input, file);

    await expect(args.onDrop).toHaveBeenCalledWith([file]);
    await expect(args.onError).not.toHaveBeenCalled();
  },
});

export const RejectsOversizedFile = meta.story({
  name: "(Test) Rejects Oversized File",
  args: {
    accept: undefined,
    isDisabled: false,
    maxFiles: 1,
    maxSize: 1,
    minSize: undefined,
    onDrop: fn(),
    onError: fn(),
    src: undefined,
    variant: "panel",
  },
  play: async ({ args, canvasElement }) => {
    const input = canvasElement.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Dropzone file input not found");
    }

    await userEvent.upload(input, new File(["too large"], "example.txt"));

    await expect(args.onError).toHaveBeenCalledOnce();
    await expect(args.onDrop).not.toHaveBeenCalled();
  },
});
