import preview from "../../../../.storybook/preview";
import { CodeBlock } from "./Codeblock";

const meta = preview.meta({
  component: CodeBlock,
});

export const Default = meta.story({
  args: {
    language: "typescript",
    value: 'const greeting = "Hello, Langfuse!";',
    theme: "light",
  },
});

export const CardHeader = meta.story({
  args: {
    language: "typescript",
    value: 'const greeting = "Hello, Langfuse!";',
    theme: "light",
    variant: "card",
  },
});
