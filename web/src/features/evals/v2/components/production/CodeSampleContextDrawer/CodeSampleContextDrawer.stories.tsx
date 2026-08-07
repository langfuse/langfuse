import { fn } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { CodeSampleContextDrawer } from "./CodeSampleContextDrawer";

const meta = preview.meta({ component: CodeSampleContextDrawer });

const sampleObservation = {
  input: JSON.stringify({ question: "What is the capital of France?" }),
  output: JSON.stringify({ answer: "Paris" }),
  metadata: { environment: "production" },
};

export const Python = meta.story({
  args: {
    open: true,
    onOpenChange: fn(),
    sampleObservation,
    sampleLabel: "Geography question",
    language: "PYTHON",
  },
});

export const TypeScript = meta.story({
  args: {
    open: true,
    onOpenChange: fn(),
    sampleObservation,
    sampleLabel: "Geography question",
    language: "TYPESCRIPT",
  },
});

export const Collapsed = meta.story({
  args: {
    open: false,
    onOpenChange: fn(),
    sampleObservation,
    sampleLabel: "Geography question",
    language: "TYPESCRIPT",
  },
});

export const NoSample = meta.story({
  args: {
    open: false,
    onOpenChange: fn(),
    sampleObservation: null,
    sampleLabel: null,
    language: "PYTHON",
  },
});
