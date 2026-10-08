import preview from "../../../../.storybook/preview";
import { expect } from "storybook/test";
import { themes } from "prism-react-renderer";
import { Codeblock as CodeBlock } from "./Codeblock";

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

export const LightThemeTokenRendering = Default.extend({
  name: "(Test) Light Theme Token Rendering",
  play: async ({ args, canvasElement, canvas }) => {
    const preview = canvasElement.querySelector("pre")!;
    await expect(preview).toHaveTextContent(args.value);
    const keyword = preview.querySelector(".token.keyword")!;
    await expect(keyword).toHaveTextContent("const");
    await expect(preview.querySelector(".token.string")).toHaveTextContent(
      '"Hello, Langfuse!"',
    );
    const theme = args.theme === "dark" ? themes.vsDark : themes.github;
    const keywordStyle = theme.styles.find((style) =>
      style.types.includes("keyword"),
    )!.style;
    await expect(keyword).toHaveStyle(keywordStyle);
    await expect(
      canvas.getByRole("button", { name: "Copy code" }),
    ).toBeVisible();
  },
});

export const DarkThemeTokenRendering = LightThemeTokenRendering.extend({
  name: "(Test) Dark Theme Token Rendering",
  args: { theme: "dark" },
});

export const HtmlSafety = Default.extend({
  name: "(Test) HTML Is Highlighted Without Executing It",
  args: {
    language: "markup",
    value: '<script>alert("unsafe")</script>',
  },
  play: async ({ args, canvasElement }) => {
    const preview = canvasElement.querySelector("pre")!;
    await expect(preview.textContent).toBe(args.value);
    await expect(preview.querySelector("script")).toBeNull();
    await expect(preview.querySelector(".token.tag")).toBeInTheDocument();
  },
});
