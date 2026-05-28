import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { CodeEvalTemplateFormBody } from "@/src/features/evals/components/code-eval-template-form-body";
import { TYPESCRIPT_CODE_EVAL_CONTRACT } from "@/src/features/evals/utils/code-eval-template-validation";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

describe("CodeEvalTemplateFormBody", () => {
  beforeAll(() => {
    Object.defineProperties(Range.prototype, {
      getBoundingClientRect: {
        configurable: true,
        value: () => new DOMRect(0, 0, 0, 0),
      },
      getClientRects: {
        configurable: true,
        value: () => ({
          length: 0,
          item: () => null,
          [Symbol.iterator]: function* () {
            return;
          },
        }),
      },
    });
  });

  it("formats TypeScript code when Shift+Option+F emits a special Mac character", async () => {
    const handleSourceCodeChange = vi.fn();
    const sourceCode = `${TYPESCRIPT_CODE_EVAL_CONTRACT}
function evaluate(ctx: EvaluationContext): EvaluationResult { return { scores: [] }; }
`;

    const { container } = render(
      <CodeEvalTemplateFormBody
        sourceCode={sourceCode}
        sourceCodeLanguage="TYPESCRIPT"
        onSourceCodeChange={handleSourceCodeChange}
        editable={true}
        validationResult={null}
      />,
    );

    const editorContent = container.querySelector(".cm-content");
    expect(editorContent).not.toBeNull();

    fireEvent.keyDown(editorContent!, {
      key: "Ï",
      code: "KeyF",
      shiftKey: true,
      altKey: true,
    });

    await waitFor(() => {
      expect(handleSourceCodeChange).toHaveBeenCalledWith(
        expect.stringContaining(
          "function evaluate(ctx: EvaluationContext): EvaluationResult {",
        ),
      );
    });
  });
});
