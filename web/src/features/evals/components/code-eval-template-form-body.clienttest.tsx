import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CodeEvalTemplateFormBody } from "./code-eval-template-form-body";
import { TooltipProvider } from "@/src/components/ui/tooltip";

const mocks = vi.hoisted(() => ({
  formatPython: vi.fn(),
  showErrorToast: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));
vi.mock(
  "@/src/features/evals/utils/code-eval-template-validation",
  async (importOriginal) => ({
    ...(await importOriginal()),
    formatPythonCodeEvalSourceWithRuff: mocks.formatPython,
  }),
);
vi.mock("@/src/features/notifications/showErrorToast", () => ({
  showErrorToast: mocks.showErrorToast,
}));

beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
});

function TestTooltipProvider({ children }: PropsWithChildren) {
  return <TooltipProvider delayDuration={0}>{children}</TooltipProvider>;
}

describe("CodeEvalTemplateFormBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens the search panel above the code editor", async () => {
    const { container } = render(
      <CodeEvalTemplateFormBody
        sourceCode="return JSON.stringify(ctx)"
        sourceCodeLanguage="TYPESCRIPT"
        onSourceCodeChange={vi.fn()}
        editable
        validationResult={null}
        ctxSample={null}
      />,
      { wrapper: TestTooltipProvider },
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

  it("blocks evaluator source from PostHog session recordings", () => {
    const { container } = render(
      <CodeEvalTemplateFormBody
        sourceCode="customer evaluator source"
        sourceCodeLanguage="PYTHON"
        onSourceCodeChange={vi.fn()}
        editable={false}
        validationResult={null}
        ctxSample={null}
      />,
      { wrapper: TestTooltipProvider },
    );

    expect(container.querySelector(".ph-no-capture")).toContainElement(
      container.querySelector(".cm-editor"),
    );
  });

  it("shows Python validation errors that arrive after the editor mounts", async () => {
    const sourceCode = "def evaluate(ctx):\n  return missing_name";
    const props = {
      sourceCode,
      sourceCodeLanguage: "PYTHON" as const,
      onSourceCodeChange: vi.fn(),
      editable: true,
      ctxSample: null,
    };
    const { container, rerender } = render(
      <CodeEvalTemplateFormBody {...props} validationResult={null} />,
      { wrapper: TestTooltipProvider },
    );

    rerender(
      <CodeEvalTemplateFormBody
        {...props}
        validationResult={{
          sourceBytes: sourceCode.length,
          hasErrors: true,
          diagnostics: [
            {
              from: sourceCode.indexOf("missing_name"),
              to: sourceCode.length,
              severity: "error",
              message: "F821: Undefined name `missing_name`",
            },
          ],
        }}
      />,
    );

    await waitFor(
      () => {
        expect(container.querySelector(".cm-lintRange-error")).toBeTruthy();
      },
      { timeout: 200 },
    );
  });

  it("shows formatter errors in a toast", async () => {
    mocks.formatPython.mockRejectedValueOnce(new Error("Invalid syntax"));

    render(
      <CodeEvalTemplateFormBody
        sourceCode="def evaluate(ctx)"
        sourceCodeLanguage="PYTHON"
        onSourceCodeChange={vi.fn()}
        editable
        validationResult={{
          sourceBytes: 17,
          hasErrors: false,
          diagnostics: [],
        }}
        ctxSample={null}
      />,
      { wrapper: TestTooltipProvider },
    );

    fireEvent.click(screen.getByRole("button", { name: /Format/ }));

    await waitFor(() => {
      expect(mocks.showErrorToast).toHaveBeenCalledWith(
        "Formatting failed",
        "Invalid syntax",
      );
    });
  });

  it("does not format code with validation errors", async () => {
    render(
      <CodeEvalTemplateFormBody
        sourceCode="def evaluate(ctx)"
        sourceCodeLanguage="PYTHON"
        onSourceCodeChange={vi.fn()}
        editable
        validationResult={{
          sourceBytes: 17,
          hasErrors: true,
          diagnostics: [
            {
              from: 0,
              to: 3,
              severity: "error",
              message: "Invalid syntax",
            },
          ],
        }}
        ctxSample={null}
      />,
      { wrapper: TestTooltipProvider },
    );

    const formatButton = screen.getByRole("button", { name: /Format/ });
    expect(formatButton).toBeDisabled();
    expect(mocks.formatPython).not.toHaveBeenCalled();

    fireEvent.focus(formatButton.parentElement!);
    expect(
      await screen.findAllByText(
        "Fix the code validation errors before formatting.",
      ),
    ).not.toHaveLength(0);
  });
});
