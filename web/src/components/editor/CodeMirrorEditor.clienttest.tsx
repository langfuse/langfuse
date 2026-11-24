// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import type * as ReactCodeMirror from "@uiw/react-codemirror";
import type { Extension } from "@codemirror/state";
import {
  CodeMirrorEditor,
  getPromptVariableDiagnostics,
} from "@/src/components/editor/CodeMirrorEditor";

const editorHarness = vi.hoisted(() => ({
  extensionSnapshots: [] as Array<Extension[] | undefined>,
}));

vi.mock("@uiw/react-codemirror", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactCodeMirror>();

  return {
    ...actual,
    default: ({
      className,
      extensions,
      onChange,
    }: {
      className?: string;
      extensions?: Extension[];
      onChange?: (value: string) => void;
    }) => {
      editorHarness.extensionSnapshots.push(extensions);
      return (
        <button
          type="button"
          className={className}
          data-testid="code-mirror"
          onClick={() => onChange?.("hello")}
        />
      );
    },
  };
});

describe("CodeMirrorEditor session recording privacy", () => {
  it("blocks editor values from PostHog session recordings", () => {
    render(<CodeMirrorEditor value="customer payload" mode="text" />);

    expect(screen.getByTestId("code-mirror")).toHaveClass("ph-no-capture");
  });
});

describe("CodeMirrorEditor extension identity", () => {
  it("does not rebuild prompt-mode extensions after the first character", () => {
    editorHarness.extensionSnapshots.length = 0;

    render(<CodeMirrorEditor value="" mode="prompt" onChange={vi.fn()} />);

    const extensionsBefore = editorHarness.extensionSnapshots.at(-1);
    fireEvent.click(screen.getByTestId("code-mirror"));
    const extensionsAfter = editorHarness.extensionSnapshots.at(-1);

    expect(extensionsBefore).toBeDefined();
    expect(extensionsAfter).toBe(extensionsBefore);
  });
});

describe("getPromptVariableDiagnostics", () => {
  it("accepts triple-brace prompt variables as an inner variable with literal outer braces", () => {
    expect(getPromptVariableDiagnostics("Use {{{placeholder}}} here")).toEqual(
      [],
    );
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
