import { render, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { CodeEvalTemplateFormBody } from "./code-eval-template-form-body";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
});

describe("CodeEvalTemplateFormBody", () => {
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
});
