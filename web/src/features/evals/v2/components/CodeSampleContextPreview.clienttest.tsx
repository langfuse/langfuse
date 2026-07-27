import { fireEvent, render, screen } from "@testing-library/react";

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

import { CodeSampleContextDrawer } from "./CodeSampleContextPreview";

describe("CodeSampleContextDrawer", () => {
  it("disables the mapping toggle until sample data is available", () => {
    const onOpenChange = vi.fn();
    render(
      <CodeSampleContextDrawer
        open={false}
        onOpenChange={onOpenChange}
        sampleObservation={null}
        sampleLabel={null}
        language="PYTHON"
      />,
    );

    const toggle = screen.getByRole("button", {
      name: /Sample data mapping/,
    });
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

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
});
