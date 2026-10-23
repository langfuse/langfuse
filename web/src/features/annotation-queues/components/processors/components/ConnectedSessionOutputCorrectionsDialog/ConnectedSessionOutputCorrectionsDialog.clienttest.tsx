import { render, screen } from "@testing-library/react";
import { type ComponentProps, type ReactNode } from "react";
import type * as Shared from "@langfuse/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectedSessionOutputCorrectionsDialog } from "./ConnectedSessionOutputCorrectionsDialog";
import { type CorrectedOutputField } from "@/src/features/traces/components/IOPreview/components/CorrectedOutputField";

const mocks = vi.hoisted(() => ({
  observations: vi.fn(),
  details: vi.fn(),
  correction: vi.fn(),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    sessions: {
      observationsForTraceFromEvents: { useQuery: mocks.observations },
    },
    events: { scoresForTrace: { useQuery: mocks.details } },
  },
  shouldRetryResourceQuery: vi.fn(),
}));
vi.mock("@langfuse/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof Shared>()),
  filterAndValidateDbScoreList: ({ scores }: { scores: unknown[] }) => scores,
}));
vi.mock("@/src/components/design-system/Dialog/Dialog", () => ({
  Dialog: Object.assign(
    ({ children, title }: { children: ReactNode; title: string }) => (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ),
    {
      Body: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    },
  ),
}));
vi.mock("@/src/features/traces", () => ({
  IOPreview: ({ output }: { output: string }) => <pre>{output}</pre>,
}));
vi.mock(
  "@/src/features/traces/components/IOPreview/components/CorrectedOutputField",
  () => ({
    CorrectedOutputField: (
      props: ComponentProps<typeof CorrectedOutputField>,
    ) => {
      mocks.correction(props);
      return <div>Correction editor for {props.observationId}</div>;
    },
  }),
);

const observation = {
  id: "observation-id",
  name: "LLM call",
  startTime: new Date("2026-01-01"),
  input: null,
  output:
    '[{"role":"assistant","content":"first"},{"role":"assistant","content":"second"}]',
  inputLength: 0,
  outputLength: 100,
  outputTruncated: false,
};
const props = {
  projectId: "project-id",
  sessionId: "session-id",
  isOpen: true,
  trace: {
    id: "trace-id",
    name: "Trace",
    timestamp: new Date("2026-01-01"),
    environment: "test",
    userId: null,
    observationCount: 1,
    latencyMs: null,
    scores: [],
  },
} satisfies ComponentProps<typeof ConnectedSessionOutputCorrectionsDialog>;

describe("ConnectedSessionOutputCorrectionsDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.observations.mockReturnValue({
      data: [observation],
      isPending: false,
      isError: false,
    });
    mocks.details.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
  });

  it("edits one observation's entire output even when it contains multiple messages", () => {
    render(<ConnectedSessionOutputCorrectionsDialog {...props} />);
    expect(
      screen.getByRole("dialog", { name: "Output corrections" }),
    ).toBeInTheDocument();
    expect(mocks.correction).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-id",
        traceId: "trace-id",
        observationId: "observation-id",
        environment: "test",
        actualOutput: JSON.parse(observation.output),
      }),
    );
    expect(screen.getAllByText(/Correction editor for/)).toHaveLength(1);
  });

  it("loads the existing correction for the selected observation only", () => {
    const correction = {
      id: "correction",
      observationId: observation.id,
      timestamp: new Date(),
      longStringValue: "Corrected",
    };
    mocks.details.mockReturnValue({
      data: [
        correction,
        { ...correction, id: "other", observationId: "other-observation" },
      ],
      isPending: false,
      isError: false,
    });
    render(<ConnectedSessionOutputCorrectionsDialog {...props} />);
    expect(mocks.correction).toHaveBeenCalledWith(
      expect.objectContaining({ existingCorrection: correction }),
    );
  });

  it("does not use truncated output to prefill a correction", () => {
    mocks.observations.mockReturnValue({
      data: [{ ...observation, outputTruncated: true }],
      isPending: false,
      isError: false,
    });
    render(<ConnectedSessionOutputCorrectionsDialog {...props} />);
    expect(mocks.correction).toHaveBeenCalledWith(
      expect.objectContaining({
        actualOutput: undefined,
        actualOutputTooLarge: true,
      }),
    );
    expect(
      screen.getByText(/Original output preview only/),
    ).toBeInTheDocument();
  });

  it("does not treat the synthetic trace row as an observation", () => {
    mocks.observations.mockReturnValue({
      data: [{ ...observation, id: "t-trace-id" }],
      isPending: false,
      isError: false,
    });
    render(<ConnectedSessionOutputCorrectionsDialog {...props} />);
    expect(
      screen.getByText("No observations in this trace."),
    ).toBeInTheDocument();
    expect(mocks.correction).not.toHaveBeenCalled();
  });

  it("does not fetch corrections while closed", () => {
    render(
      <ConnectedSessionOutputCorrectionsDialog {...props} isOpen={false} />,
    );
    expect(mocks.observations).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false }),
    );
    expect(mocks.details).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false }),
    );
  });

  it("shows an error instead of an editor when existing corrections cannot load", () => {
    mocks.details.mockReturnValue({ isPending: false, isError: true });
    render(<ConnectedSessionOutputCorrectionsDialog {...props} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Failed to load output corrections.",
    );
    expect(mocks.correction).not.toHaveBeenCalled();
  });
});
