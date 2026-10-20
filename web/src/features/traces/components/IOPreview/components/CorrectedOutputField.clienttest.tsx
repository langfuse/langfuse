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

vi.mock("../hooks/useCorrectionEditor", () => ({
  useCorrectionEditor: ({ correctionValue }: { correctionValue: string }) => ({
    isEditing: false,
    setIsEditing: vi.fn(),
    value: correctionValue,
    isValidJson: true,
    handleEdit: vi.fn(),
    handleChange: vi.fn(),
  }),
}));

vi.mock("@/src/features/rbac", () => ({
  useHasProjectAccess: () => true,
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

    expect(screen.getByText("Corrected Output")).toBeInTheDocument();
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
    expect(screen.queryByText("Corrected Output")).not.toBeInTheDocument();
  });

  it("keeps the section collapsed when no correction exists", () => {
    render(<CorrectedOutputField {...baseProps} existingCorrection={null} />);

    expect(
      screen.getByRole("button", { name: "Correct output" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("correction-editor")).not.toBeInTheDocument();
  });
});
