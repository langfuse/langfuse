import { fireEvent, render, waitFor } from "@testing-library/react";

import { PromptVariableEditor } from "./PromptVariableEditor";

describe("PromptVariableEditor", () => {
  it("opens the search panel above the prompt editor", async () => {
    const { container } = render(
      <PromptVariableEditor
        value="Return only valid JSON"
        onChange={vi.fn()}
      />,
    );

    const editorContent = container.querySelector<HTMLElement>(".cm-content");
    expect(editorContent).not.toBeNull();
    fireEvent.keyDown(editorContent!, {
      key: "f",
      code: "KeyF",
      ctrlKey: true,
    });

    await waitFor(() => {
      expect(container.querySelector(".cm-panels-top .cm-search")).toBeTruthy();
    });
  });

  it("keeps the interpolated preview aligned and theme-aware", () => {
    const { container } = render(
      <PromptVariableEditor
        value="Question: {{input}}"
        onChange={vi.fn()}
        previewEnabled
        preview={{
          status: "ready",
          fragments: [
            { type: "text", text: "Question: " },
            { type: "variable", name: "input", value: "What is Langfuse?" },
          ],
        }}
      />,
    );

    const preview = container.querySelector("pre");
    expect(preview).toHaveClass(
      "ph-no-capture",
      "bg-muted/50",
      "absolute",
      "inset-0",
      "overflow-y-auto",
      "px-3",
      "py-2",
      "leading-5",
    );
    expect(container.querySelector('[aria-hidden="true"]')).toHaveClass(
      "invisible",
    );
    expect(container.querySelector(".cm-editor")).toBeInTheDocument();

    const interpolatedValue = container.querySelector('[title="{{input}}"]');
    expect(interpolatedValue).toHaveClass(
      "bg-primary-accent/10",
      "dark:bg-accent-light-blue",
      "dark:text-accent-dark-blue",
    );
    expect(interpolatedValue).not.toHaveClass(
      "bg-accent-light-blue",
      "text-accent-dark-blue",
    );
  });
});
