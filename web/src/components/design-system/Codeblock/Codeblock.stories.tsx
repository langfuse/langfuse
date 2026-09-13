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

export const ReadOnly = meta.story({
  args: {
    language: "typescript",
    value:
      "export default function evaluate({ output }) {\n  return { score: output ? 1 : 0 };\n}",
    theme: "light",
    showLanguage: false,
    variant: "read-only",
  },
});
