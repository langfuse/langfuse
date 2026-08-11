import { render, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { PromptVariableEditor } from "./PromptVariableEditor";

const originalGetClientRects = Range.prototype.getClientRects;

beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

afterAll(() => {
  Range.prototype.getClientRects = originalGetClientRects;
});

describe("PromptVariableEditor", () => {
  it("highlights interpolated values in the prompt preview", () => {
    const { getByTitle } = render(
      <PromptVariableEditor
        value="Evaluate {{quality}}"
        onChange={vi.fn()}
        previewEnabled
        preview={{
          status: "ready",
          fragments: [
            { type: "text", text: "Evaluate " },
            { type: "variable", name: "quality", value: "Looks good" },
          ],
        }}
      />,
    );

    const highlightedValue = getByTitle("{{quality}}");
    expect(highlightedValue).toHaveTextContent("Looks good");
    expect(highlightedValue).toHaveClass("bg-primary-accent/10");
  });

  it("uses a muted surface in read-only mode", async () => {
    const { container } = render(
      <PromptVariableEditor
        value="Evaluate {{quality}}"
        onChange={vi.fn()}
        readOnly
      />,
    );

    await waitFor(() => {
      const editor = container.querySelector(".cm-editor");
      expect(window.getComputedStyle(editor!).backgroundColor).toBe(
        "hsl(var(--muted))",
      );
    });
  });

  it("uses the warning treatment for a variable without a matching mapping", async () => {
    const { container } = render(
      <PromptVariableEditor value="Evaluate {{quality}}" onChange={vi.fn()} />,
    );

    await waitFor(() => {
      const unmatchedVariable = container.querySelector(
        ".cm-eval-variable-invalid",
      );
      expect(unmatchedVariable).toHaveTextContent("{{quality}}");
      expect(
        window.getComputedStyle(unmatchedVariable!).textDecorationLine,
      ).toBe("underline");
      expect(
        window.getComputedStyle(unmatchedVariable!).textDecorationStyle,
      ).toBe("wavy");
      expect(
        window.getComputedStyle(unmatchedVariable!).textDecorationColor,
      ).toContain("var(--dark-yellow)");
      const syntaxToken = unmatchedVariable?.querySelector("span");
      expect(window.getComputedStyle(syntaxToken!).color).toBe(
        "hsl(var(--primary-accent))",
      );
    });
  });

  it("uses the warning treatment for invalid variable syntax", async () => {
    const { container } = render(
      <PromptVariableEditor
        value="Evaluate {{invalid variable}}"
        onChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      const invalidVariable = container.querySelector(
        ".cm-eval-variable-invalid",
      );
      expect(invalidVariable).toHaveTextContent("{{invalid variable}}");
      const syntaxToken = invalidVariable?.querySelector("span span");
      expect(syntaxToken).not.toBeNull();
      expect(
        window.getComputedStyle(invalidVariable!).textDecorationColor,
      ).toContain("var(--dark-yellow)");
    });
  });
});
