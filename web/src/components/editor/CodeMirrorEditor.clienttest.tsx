// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type * as ReactCodeMirror from "@uiw/react-codemirror";
import {
  CodeMirrorEditor,
  getPromptVariableDiagnostics,
} from "@/src/components/editor/CodeMirrorEditor";

vi.mock("@uiw/react-codemirror", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactCodeMirror>();

  return {
    ...actual,
    default: ({ className }: { className?: string }) => (
      <div className={className} data-testid="code-mirror" />
    ),
  };
});

describe("CodeMirrorEditor session recording privacy", () => {
  it("blocks editor values from PostHog session recordings", () => {
    render(<CodeMirrorEditor value="customer payload" mode="text" />);

    expect(screen.getByTestId("code-mirror")).toHaveClass("ph-no-capture");
  });
});

describe("getPromptVariableDiagnostics", () => {
  it("accepts triple-brace prompt variables as an inner variable with literal outer braces", () => {
    expect(getPromptVariableDiagnostics("Use {{{placeholder}}} here")).toEqual(
      [],
    );
  });

  it("accepts digits after the first letter and names the rule accurately", () => {
    expect(getPromptVariableDiagnostics("Use {{team_1}} here")).toEqual([]);

    expect(getPromptVariableDiagnostics("Use {{1team}} here")).toEqual([
      expect.objectContaining({
        from: 4,
        message:
          "Variable must start with a letter and can only contain letters, numbers and underscores",
      }),
    ]);
  });

  it("reports unclosed inner variables inside extra literal braces", () => {
    expect(getPromptVariableDiagnostics("Use {{{placeholder} here")).toEqual([
      expect.objectContaining({
        from: 5,
        message: "Unclosed variable brackets",
      }),
    ]);
  });

  it("reports variables spanning multiple lines", () => {
    expect(
      getPromptVariableDiagnostics("Use {{first\nsecond\nthird}} here"),
    ).toContainEqual(
      expect.objectContaining({
        from: 4,
        message: "Variables cannot span multiple lines",
      }),
    );
  });

  it("handles long unterminated multiline variables without excessive backtracking", () => {
    const content = `{{${"\n".repeat(20_000)}`;
    const startedAt = performance.now();

    expect(getPromptVariableDiagnostics(content)).toEqual([
      expect.objectContaining({
        from: 0,
        message: "Unclosed variable brackets",
      }),
    ]);
    expect(performance.now() - startedAt).toBeLessThan(100);
  });
});
