// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { type ScoreDomain } from "@langfuse/shared";

import { CorrectedOutputSection } from "./CorrectedOutputSection";

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
  useCorrectionEditor: (params: { correctionValue: string }) => ({
    isEditing: false,
    setIsEditing: vi.fn(),
    value: params.correctionValue,
    isValidJson: true,
    handleEdit: vi.fn(),
    handleChange: vi.fn(),
  }),
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));

vi.mock("@/src/features/scores/hooks/useScoreEditsDisabled", () => ({
  useScoreEditsDisabled: () => false,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
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

vi.mock("./CorrectedOutputDiffDialog", () => ({
  CorrectedOutputDiffDialog: () => null,
}));

const baseCorrection = {
  id: "c1",
  projectId: "p",
  name: "output",
  dataType: "CORRECTION",
  source: "ANNOTATION",
  value: null,
  stringValue: null,
  longStringValue: '{"a":"fixed"}',
  traceId: "t1",
  observationId: null,
  timestamp: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as ScoreDomain;

describe("CorrectedOutputSection nesting", () => {
  it("renders Trace and Observation subheaders when both scopes exist", () => {
    render(
      <CorrectedOutputSection
        projectId="p"
        traceId="t1"
        environment="default"
        traceOutputCorrection={{
          ...baseCorrection,
          id: "trace",
          observationId: null,
        }}
        outputCorrection={{
          ...baseCorrection,
          id: "obs",
          observationId: "obs-1",
          longStringValue: '{"a":"obs"}',
        }}
        observationId="obs-1"
        trigger="header"
      />,
    );

    expect(screen.getByText("Trace")).toBeInTheDocument();
    expect(screen.getByText("Observation")).toBeInTheDocument();
    expect(screen.getByText("Corrected output")).toBeInTheDocument();
  });

  it("omits Trace/Observation subheaders for a single scope", () => {
    render(
      <CorrectedOutputSection
        projectId="p"
        traceId="t1"
        environment="default"
        traceOutputCorrection={baseCorrection}
        trigger="header"
      />,
    );

    expect(screen.queryByText("Trace")).not.toBeInTheDocument();
    expect(screen.queryByText("Observation")).not.toBeInTheDocument();
    expect(screen.getByText("Corrected output")).toBeInTheDocument();
  });
});
