import { expect, fireEvent, within } from "storybook/test";

import preview from "../../../../../../.storybook/preview";
import { MediaTag } from "@/src/components/MediaTag/MediaTag";
import { type MediaDescriptor } from "@/src/components/ui/media/mediaUtils";
import { IOTableCell } from "./IOTableCell";

const MEDIA_REF =
  "@@@langfuseMedia:type=image/png|id=cc48838a-3da8-4ca4-a007-2cf8df930e69|source=bytes@@@";

const renderMediaReference = (descriptor: MediaDescriptor) => (
  <MediaTag contentType={descriptor.contentType} status="idle" />
);

const meta = preview.meta({
  component: IOTableCell,
  args: { renderMediaReference },
  parameters: {
    layout: "fullscreen",
  },
});

export const Default = meta.story({
  args: {
    data: { prompt: "What is Langfuse?", model: "gpt-5" },
  },
});

export const SingleLine = meta.story({
  args: {
    data: "Langfuse is an open-source LLM engineering platform.",
    singleLine: true,
  },
});

export const Input = meta.story({
  args: {
    data: { prompt: "What is Langfuse?" },
    variant: "input",
  },
});

export const Output = meta.story({
  args: {
    data: { answer: "An open-source LLM engineering platform." },
    variant: "output",
  },
});

export const Compact = meta.story({
  args: {
    data: { model: "gpt-5" },
    size: "compact",
  },
});

export const Loading = meta.story({
  args: {
    isLoading: true,
  },
});

export const TestMediaTitleSuppression = meta.story({
  name: "(Test) Media suppresses native title",
  args: {
    data: `Here is an image: ${MEDIA_REF} - nice.`,
    singleLine: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cell = canvasElement.querySelector("[title]");
    if (!(cell instanceof HTMLElement)) throw new Error("Cell not found");

    await expect(cell).toHaveAttribute(
      "title",
      expect.stringContaining("Here is an image"),
    );
    fireEvent.pointerOver(canvas.getByRole("button", { name: "PNG media" }));
    await expect(cell).not.toHaveAttribute("title");
    fireEvent.pointerOver(cell);
    await expect(cell).toHaveAttribute(
      "title",
      expect.stringContaining("Here is an image"),
    );
  },
});

export const TestExpandSuppressesNativeTitle = meta.story({
  name: "(Test) Expand preview suppresses native title",
  args: {
    data: "Langfuse is an open-source LLM engineering platform.",
    enableExpandOnHover: true,
    singleLine: true,
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[title]")).toBeNull();
  },
});

export const TestMediaReferenceRendering = meta.story({
  name: "(Test) Media references render without quotes",
  args: {
    data: { images: [MEDIA_REF, MEDIA_REF] },
    singleLine: true,
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getAllByRole("button", { name: "PNG media" }),
    ).toHaveLength(2);
    await expect(canvasElement).not.toHaveTextContent('"PNG"');
  },
});

export const TestStringifiedJson = meta.story({
  name: "(Test) Stringified JSON renders as a tree",
  args: {
    data: '{"foo":"bar"}',
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement).toHaveTextContent("foo");
    await expect(canvasElement).toHaveTextContent("bar");
  },
});

export const TestTruncatesLongContent = meta.story({
  name: "(Test) Truncates long content",
  args: {
    data: "x".repeat(10_050),
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement).toHaveTextContent("truncated");
  },
});

export const TestOutputVariant = meta.story({
  name: "(Test) Output variant",
  args: {
    data: { answer: "Langfuse" },
    variant: "output",
  },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector(".bg-accent-light-green"),
    ).toBeInTheDocument();
  },
});
