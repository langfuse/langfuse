import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { ChatMlMessageSchema } from "@/src/components/schemas/ChatMlSchema";
import { MarkdownRenderCharacterLimitContext } from "@/src/components/MarkdownRenderCharacterLimitProvider/MarkdownRenderCharacterLimitContext";
import { PromptMessagePreview } from "./PromptMessagePreview";

const { copyTextToClipboard } = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn(),
}));
vi.mock("@/src/utils/clipboard", () => ({ copyTextToClipboard }));
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/hooks/useProjectIdFromURL", () => ({ default: () => "p1" }));
vi.mock("@/src/components/ui/media/useResolvedMedia", () => ({
  useResolvedMedia: () => ({ status: "idle", url: undefined }),
}));

function renderMessage(
  message: React.ComponentProps<typeof PromptMessagePreview>["message"],
) {
  return render(
    <MarkdownRenderCharacterLimitContext.Provider value={5_000}>
      <PromptMessagePreview message={message} />
    </MarkdownRenderCharacterLimitContext.Provider>,
  );
}

describe("PromptMessagePreview", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    copyTextToClipboard.mockClear();
  });

  it("renders the role header and copies the message content", () => {
    renderMessage(
      ChatMlMessageSchema.parse({
        role: "user",
        content: "Where is my refund?",
      }),
    );

    expect(
      screen.getByRole("button", { name: "Collapse user" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Where is my refund?")).toBeVisible();
    fireEvent.click(screen.getByTitle("Copy to clipboard"));
    expect(copyTextToClipboard).toHaveBeenCalledWith("Where is my refund?");
  });

  it("renders placeholders", () => {
    renderMessage(
      ChatMlMessageSchema.parse({ type: "placeholder", name: "conversation" }),
    );

    expect(
      screen.getByRole("button", { name: "Collapse Placeholder" }),
    ).toBeInTheDocument();
    expect(screen.getByText("conversation")).toBeVisible();
  });

  it("keeps every prompt message open without history folding", () => {
    render(
      <MarkdownRenderCharacterLimitContext.Provider value={5_000}>
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
      </MarkdownRenderCharacterLimitContext.Provider>,
    );

    for (let index = 1; index <= 8; index++) {
      expect(
        screen.getByRole("button", { name: `Collapse Turn ${index}` }),
      ).toBeInTheDocument();
      expect(screen.getByText(`Prompt content ${index}`)).toBeVisible();
    }
    expect(
      screen.queryByRole("button", { name: /other messages/ }),
    ).not.toBeInTheDocument();
  });

  it("still collapses long named system prompts", () => {
    const content = Array.from(
      { length: 12 },
      (_, index) => `Instruction ${index + 1}: ${"Be helpful. ".repeat(8)}`,
    ).join("\n");
    renderMessage(
      ChatMlMessageSchema.parse({
        role: "system",
        name: "Instructions",
        content,
      }),
    );

    expect(screen.queryByText(/Instruction 1:/)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Expand Instructions" }),
    );
    expect(screen.getByText(/Instruction 1:/)).toBeVisible();
    expect(localStorage.getItem("collapseSystemPrompt")).toBe("false");
  });
});
