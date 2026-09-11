import { fireEvent, render, screen } from "@testing-library/react";
import { MarkdownContextProvider } from "@/src/features/theming/useMarkdownContext";
import {
  PROMPT_TEXT_VIEW_MODE_STORAGE_KEY,
  PromptTextView,
} from "./PromptTextView";

const PROMPT = "# Instructions\n\nUse {{variable}} in the response.";

const renderPromptTextView = () =>
  render(
    <MarkdownContextProvider>
      <PromptTextView content={PROMPT} title="Text Prompt" />
    </MarkdownContextProvider>,
  );

describe("PromptTextView", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the raw prompt by default", () => {
    const { container } = renderPromptTextView();

    expect(screen.getByRole("tab", { name: "Raw" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(container).toHaveTextContent("# Instructions");
    expect(
      screen.queryByRole("heading", { name: "Instructions" }),
    ).not.toBeInTheDocument();
  });

  it("renders Markdown without replacing prompt variables", () => {
    renderPromptTextView();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Markdown" }), {
      button: 0,
    });

    expect(
      screen.getByRole("heading", { name: "Instructions" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Use \{\{variable\}\}/)).toBeInTheDocument();
  });

  it("persists the selected view mode", () => {
    const firstRender = renderPromptTextView();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Markdown" }), {
      button: 0,
    });
    expect(localStorage.getItem(PROMPT_TEXT_VIEW_MODE_STORAGE_KEY)).toBe(
      JSON.stringify("markdown"),
    );

    firstRender.unmount();
    renderPromptTextView();

    expect(screen.getByRole("tab", { name: "Markdown" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(
      screen.getByRole("heading", { name: "Instructions" }),
    ).toBeInTheDocument();
  });

  it("does not render rich content when renderRichContent is false", () => {
    const { container } = render(
      <MarkdownContextProvider>
        <PromptTextView
          content={PROMPT}
          title="Text Prompt"
          renderRichContent={false}
        />
      </MarkdownContextProvider>,
    );
    const codeElement = container.querySelector("code");
    expect(codeElement?.textContent).toBe(PROMPT);
  });
});
