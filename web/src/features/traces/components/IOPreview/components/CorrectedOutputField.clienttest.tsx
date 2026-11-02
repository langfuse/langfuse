import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("../hooks/useCorrectionData", () => ({
  useCorrectionData: (existingCorrection?: { longStringValue?: string }) => ({
    effectiveCorrection: existingCorrection,
    correctionValue: existingCorrection?.longStringValue ?? "",
  }),
}));

vi.mock("../hooks/useCorrectionMutations", () => ({
  useCorrectionMutations: () => ({
    saveStatus: "idle",
    setSaveStatus: vi.fn(),
    handleSave: vi.fn(),
    handleDelete: vi.fn(),
  }),
}));

const editorHook = vi.hoisted(() => ({
  spy: vi.fn(),
  handleEdit: vi.fn(),
}));
const access = vi.hoisted(() => ({
  hasAccess: true,
  scoreEditsDisabled: false,
}));

vi.mock("../hooks/useCorrectionEditor", () => ({
  useCorrectionEditor: (params: { correctionValue: string }) => {
    editorHook.spy(params);
    return {
      isEditing: false,
      setIsEditing: vi.fn(),
      value: params.correctionValue,
      isValidJson: true,
      handleEdit: editorHook.handleEdit,
      handleChange: vi.fn(),
    };
  },
}));

vi.mock("@/src/features/rbac", () => ({
  useHasProjectAccess: () => access.hasAccess,
}));

vi.mock("@/src/features/scores/hooks/useScoreEditsDisabled", () => ({
  useScoreEditsDisabled: () => access.scoreEditsDisabled,
}));

vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/components/useLocalStorage", () => ({
  default: () => [false, vi.fn()],
}));

vi.mock("@/src/components/editor/CodeMirrorEditor", () => ({
  CodeMirrorEditor: ({ value }: { value: string }) => (
    <pre data-testid="correction-editor">{value}</pre>
  ),
}));

vi.mock("@/src/components/design-system/Switch/Switch", () => ({
  Switch: () => null,
}));

vi.mock("@/src/components/ui/hover-card", () => ({
  HoverCard: ({ children }: { children: React.ReactNode }) => children,
  HoverCardContent: ({ children }: { children: React.ReactNode }) => children,
  HoverCardTrigger: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./CorrectedOutputDiffDialog", () => ({
  CorrectedOutputDiffDialog: () => null,
}));

import { CorrectedOutputField } from "./CorrectedOutputField";

const baseProps = {
  projectId: "project-id",
  traceId: "trace-id",
  environment: "default",
};

describe("CorrectedOutputField visibility", () => {
  beforeEach(() => {
    access.hasAccess = true;
    access.scoreEditsDisabled = false;
    editorHook.spy.mockClear();
    editorHook.handleEdit.mockClear();
  });

  it("does not open the editor for readers without scores:save", () => {
    access.hasAccess = false;
    render(
      <CorrectedOutputField
        {...baseProps}
        existingCorrection={null}
        trigger="header"
        startEditing
      />,
    );

    expect(editorHook.spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ initialEditing: false }),
    );
    expect(
      screen.getByRole("button", { name: "Click to add corrected output" }),
    ).toBeDisabled();
  });

  it("opens the inline link without entering edit mode for readers", () => {
    access.hasAccess = false;
    render(<CorrectedOutputField {...baseProps} existingCorrection={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Correct output" }));

    expect(editorHook.handleEdit).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Click to add corrected output" }),
    ).toBeDisabled();
  });

  it("does not open the editor when the project disables score edits", () => {
    access.scoreEditsDisabled = true;
    render(<CorrectedOutputField {...baseProps} existingCorrection={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Correct output" }));

    expect(editorHook.handleEdit).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Click to add corrected output" }),
    ).toBeDisabled();
  });

  it("opens the inline link straight into edit mode with access", () => {
    render(<CorrectedOutputField {...baseProps} existingCorrection={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Correct output" }));

    expect(editorHook.handleEdit).toHaveBeenCalledTimes(1);
  });

  it("shows an existing correction without requiring a click", () => {
    render(
      <CorrectedOutputField
        {...baseProps}
        existingCorrection={
          {
            id: "correction-id",
            longStringValue: "corrected response",
          } as never
        }
      />,
    );

    expect(screen.getByTestId("correction-editor")).toHaveTextContent(
      "corrected response",
    );
    expect(
      screen.queryByRole("button", { name: "Corrected output" }),
    ).not.toBeInTheDocument();
  });

  it("shows an existing empty-valued correction without requiring a click", () => {
    render(
      <CorrectedOutputField
        {...baseProps}
        existingCorrection={
          {
            id: "empty-correction-id",
            longStringValue: "",
          } as never
        }
      />,
    );

    expect(screen.getByText("Corrected output")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Correct output" }),
    ).not.toBeInTheDocument();
  });

  it("collapses back to the link after deleting a correction", () => {
    const { rerender } = render(
      <CorrectedOutputField {...baseProps} existingCorrection={null} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Correct output" }));
    rerender(
      <CorrectedOutputField
        {...baseProps}
        existingCorrection={
          {
            id: "correction-id",
            longStringValue: "corrected response",
          } as never
        }
      />,
    );

    fireEvent.click(screen.getByTitle("Delete corrected output"));
    rerender(<CorrectedOutputField {...baseProps} existingCorrection={null} />);

    expect(
      screen.getByRole("button", { name: "Correct output" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Corrected output")).not.toBeInTheDocument();
  });

  it("in header mode shows the section without its own link", () => {
    render(
      <CorrectedOutputField
        {...baseProps}
        existingCorrection={null}
        trigger="header"
        startEditing
      />,
    );

    expect(screen.getByText("Corrected output")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Correct output" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the section collapsed when no correction exists", () => {
    render(<CorrectedOutputField {...baseProps} existingCorrection={null} />);

    expect(
      screen.getByRole("button", { name: "Correct output" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("correction-editor")).not.toBeInTheDocument();
  });
});
