import { getPromptVariableDiagnostics } from "@/src/components/editor/CodeMirrorEditor";

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
});
