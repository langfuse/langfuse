import preview from "../../../../../.storybook/preview";
import { expect, spyOn } from "storybook/test";
import { ChatMlMessageSchema } from "@/src/components/schemas/ChatMlSchema";
import { MarkdownRenderCharacterLimitContext } from "@/src/components/MarkdownRenderCharacterLimitProvider/MarkdownRenderCharacterLimitContext";
import { PromptMessagePreview } from "./PromptMessagePreview";

const meta = preview.meta({
  component: PromptMessagePreview,
  decorators: [
    (Story) => (
      <MarkdownRenderCharacterLimitContext.Provider value={5_000}>
        <Story />
      </MarkdownRenderCharacterLimitContext.Provider>
    ),
  ],
  beforeEach: () => {
    const preferences = new Map(
      ["collapseSystemPrompt", "traceSystemPrompt:collapsed"].map(
        (key) => [key, localStorage.getItem(key)] as const,
      ),
    );
    const toolsCollapsed = sessionStorage.getItem("toolsSectionCollapsed");
    for (const key of preferences.keys()) localStorage.removeItem(key);
    sessionStorage.removeItem("toolsSectionCollapsed");
    return () => {
      for (const [key, value] of preferences) {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      if (toolsCollapsed === null)
        sessionStorage.removeItem("toolsSectionCollapsed");
      else sessionStorage.setItem("toolsSectionCollapsed", toolsCollapsed);
    };
  },
});

export const UserMessage = meta.story({
  name: "(Test) Renders role and copies message content",
  args: {
    message: ChatMlMessageSchema.parse({
      role: "user",
      content: "Where is my refund?",
    }),
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByRole("button", { name: "Collapse user" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Where is my refund?")).toBeVisible();
    const writeText = spyOn(
      navigator.clipboard,
      "writeText",
    ).mockResolvedValue();
    try {
      await userEvent.hover(
        canvas.getByRole("button", { name: "Collapse user" }),
      );
      await userEvent.click(canvas.getByTitle("Copy to clipboard"));
      await expect(writeText).toHaveBeenCalledWith("Where is my refund?");
    } finally {
      writeText.mockRestore();
    }
  },
});

export const Placeholder = meta.story({
  name: "(Test) Renders placeholders",
  args: {
    message: ChatMlMessageSchema.parse({
      type: "placeholder",
      name: "conversation",
    }),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Collapse Placeholder" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("conversation")).toBeVisible();
  },
});

export const FullHistory = meta.story({
  name: "(Test) Keeps every message open without history folding",
  render: () => (
    <>
      {Array.from({ length: 8 }, (_, index) => (
        <PromptMessagePreview
          key={index}
          message={ChatMlMessageSchema.parse({
            role: "user",
            name: `Turn ${index + 1}`,
            content: `Prompt content ${index + 1}`,
          })}
        />
      ))}
    </>
  ),
  play: async ({ canvas }) => {
    for (let index = 1; index <= 8; index++) {
      await expect(
        canvas.getByRole("button", { name: `Collapse Turn ${index}` }),
      ).toBeInTheDocument();
      await expect(canvas.getByText(`Prompt content ${index}`)).toBeVisible();
    }
    await expect(
      canvas.queryByRole("button", { name: /other messages/ }),
    ).not.toBeInTheDocument();
  },
});

export const LongNamedSystemPrompt = meta.story({
  name: "(Test) Collapses long named system prompts",
  args: {
    message: ChatMlMessageSchema.parse({
      role: "system",
      name: "Instructions",
      content: Array.from(
        { length: 12 },
        (_, index) => `Instruction ${index + 1}: ${"Be helpful. ".repeat(8)}`,
      ).join("\n"),
    }),
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.queryByText(/Instruction 1:/)).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand Instructions" }),
    );
    await expect(canvas.getByText(/Instruction 1:/)).toBeVisible();
    await expect(localStorage.getItem("collapseSystemPrompt")).toBe("false");
  },
});
