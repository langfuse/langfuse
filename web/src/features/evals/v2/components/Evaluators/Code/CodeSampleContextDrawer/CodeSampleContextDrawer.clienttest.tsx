import { render, screen } from "@testing-library/react";

vi.mock("@uiw/react-codemirror", () => ({
  default: ({ value }: { value: string }) => <pre>{value}</pre>,
  EditorView: {
    lineWrapping: {},
    theme: vi.fn(() => ({})),
  },
}));

vi.mock("@codemirror/state", () => ({
  EditorState: { readOnly: { of: vi.fn(() => ({})) } },
}));

vi.mock("@codemirror/lang-javascript", () => ({
  javascript: vi.fn(() => ({})),
}));

vi.mock("@codemirror/lang-python", () => ({
  python: vi.fn(() => ({})),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

import { CodeSampleContextDrawer } from "./CodeSampleContextDrawer";

describe("CodeSampleContextDrawer", () => {
  it("shows the selected sample mapping when expanded", () => {
    render(
      <CodeSampleContextDrawer
        open
        onOpenChange={vi.fn()}
        sampleObservation={{
          input: "question",
          output: "answer",
          metadata: { environment: "test" },
        }}
        sampleLabel="Sample generation"
        language="PYTHON"
      />,
    );

    expect(
      screen.getByRole("button", { name: /Sample data mapping/ }),
    ).toBeEnabled();
    expect(screen.getByText(/ctx = EvaluationContext/)).toBeVisible();
  });

  it("previews the complete payload without mutating the selected sample", () => {
    const sampleObservation = {
      input: { nested: '{"answer":42}' },
      output: "answer",
      metadata: { environment: "test" },
      toolCalls: [{ name: "true", arguments: { query: "Paris" } }],
      experimentItemExpectedOutput: '{"capital":"Paris"}',
      experimentItemMetadata: '{"dataset":"geography"}',
    };
    const originalSample = structuredClone(sampleObservation);

    render(
      <CodeSampleContextDrawer
        open
        onOpenChange={vi.fn()}
        sampleObservation={sampleObservation}
        sampleLabel="Sample generation"
        language="TYPESCRIPT"
      />,
    );

    const snippet = screen.getByText(/const ctx =/).textContent;
    expect(snippet).toContain("toolCalls: [");
    expect(snippet).toContain('name: "true"');
    expect(snippet).toContain("experiment: {");
    expect(snippet).toContain("itemExpectedOutput: {");
    expect(snippet).toContain('capital: "Paris"');
    expect(snippet).toContain("itemMetadata: {");
    expect(sampleObservation).toEqual(originalSample);
  });
});
