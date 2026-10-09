import preview from "../../../../.storybook/preview";
import { expect, spyOn, userEvent, within } from "storybook/test";
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
    await expect(preview).toHaveTextContent(String(args.value));
    const keyword = preview.querySelector(".token.keyword")!;
    await expect(keyword).toHaveTextContent("const");
    await expect(preview.querySelector(".token.string")).toHaveTextContent(
      '"Hello, Langfuse!"',
    );
    const theme = args.theme === "dark" ? themes.vsDark : themes.github;
    const keywordStyle = theme.styles
      .filter((rule) => {
        if (!rule.types.includes("keyword")) return false;
        if (
          rule.languages &&
          !rule.languages.includes(args.language ?? "text")
        ) {
          return false;
        }
        return true;
      })
      .reduce<(typeof theme.styles)[number]["style"]>(
        (style, rule) => ({ ...style, ...rule.style }),
        {},
      );
    await expect(keyword).toHaveStyle(keywordStyle);
    await expect(
      canvas.getByRole("button", { name: "Copy code" }),
    ).toBeVisible();
  },
});

export const Json = meta.story({
  name: "(Test) Copies Selected JSON Format",
  args: {
    label: "Example",
    value: '{"items":[1,2],"message":"hello"}',
    allowFormatting: true,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const writeText = spyOn(
      navigator.clipboard,
      "writeText",
    ).mockResolvedValue();
    try {
      const formattingButton = canvas.getByRole("button", {
        name: "Pretty-print JSON",
      });
      await expect(formattingButton).toHaveAttribute("aria-pressed", "true");
      await userEvent.click(canvas.getByRole("button", { name: "Copy code" }));
      await expect(writeText).toHaveBeenLastCalledWith(
        JSON.stringify(JSON.parse(String(args.value)), null, 2),
      );
      await expect(
        canvas.getByRole("button", { name: "Copied" }),
      ).toBeVisible();
      await userEvent.click(formattingButton);
      await expect(formattingButton).toHaveAttribute("aria-pressed", "false");
      await userEvent.click(canvas.getByRole("button", { name: "Copied" }));
      await expect(writeText).toHaveBeenLastCalledWith(args.value);
    } finally {
      writeText.mockRestore();
    }
  },
});

export const PlainText = meta.story({
  args: {
    label: "Example",
    value: "hello world",
    allowFormatting: true,
  },
});

export const ConstrainedHeight = meta.story({
  args: {
    label: "Example",
    value: { items: Array.from({ length: 100 }, (_, index) => index) },
    allowFormatting: true,
  },
  render: (args) => (
    <div className="grid max-h-48">
      <CodeBlock {...args} />
    </div>
  ),
});

export const LargeValue = meta.story({
  args: {
    label: "Example",
    value: "x".repeat(10_001),
    allowFormatting: true,
  },
});

export const InvalidJson = meta.story({
  name: "(Test) Does Not Offer Formatting For Invalid JSON",
  args: {
    label: "Example",
    value: '{"broken":',
    allowFormatting: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Example language" }),
    );
    await userEvent.click(
      within(document.body).getByRole("option", { name: "JSON" }),
    );
    await expect(
      canvas.queryByRole("button", { name: "Pretty-print JSON" }),
    ).not.toBeInTheDocument();
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
