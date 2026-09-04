/**
 * Session cards must stay bounded (LFE-10958): observations whose I/O fits
 * the server's inline limit render through IOPreview exactly as before, while
 * server-truncated observations render a bounded preview with escape hatches
 * (trace view, raw download) instead of the full payload.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SessionProvider } from "next-auth/react";

const fullIOQuery = vi.fn();
const downloadJsonFile = vi.fn();
const capture = vi.fn();
const useMediaMock = vi.fn(
  (_args: Record<string, unknown>): { data: unknown } => ({ data: undefined }),
);

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      client: {
        sessions: {
          observationFullIOFromEvents: { query: fullIOQuery },
        },
      },
    }),
  },
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => capture,
}));

// The component imports IOPreview through the traces feature surface, so the
// mock has to intercept the surface — mocking the module behind it does nothing.
vi.mock("@/src/features/traces", () => ({
  IOPreview: ({ media }: { media?: { mediaId: string }[] }) => (
    <div
      data-testid="io-preview"
      data-media-ids={(media ?? []).map((m) => m.mediaId).join(",")}
    />
  ),
  useMedia: (args: Record<string, unknown>) => useMediaMock(args),
}));

vi.mock("@/src/components/session/actions/downloadSessionAsJson", () => ({
  downloadJsonFile: (args: unknown) => downloadJsonFile(args),
}));

import {
  SessionObservationIO,
  type SessionTraceObservation,
} from "./SessionObservationIO";

const baseObservation = {
  id: "obs-1",
  name: "gpt-4o-completion",
  startTime: new Date("2026-07-15T10:00:00Z"),
  input: '{"messages":[{"role":"user","content":"hi"}]}',
  output: "hello",
  metadata: "{}",
  inputLength: 45,
  outputLength: 5,
  inputTruncated: false,
  outputTruncated: false,
  metadataTruncated: false,
} as unknown as SessionTraceObservation;

const renderComponent = (
  observation: SessionTraceObservation,
  onOpenInTraceView = vi.fn(),
) => {
  render(
    // IOPreview reads the normalizedIoPreview flag via useSession; a null
    // session resolves it to false (legacy behavior), matching production
    // for regular users.
    <SessionProvider session={null}>
      <SessionObservationIO
        observation={observation}
        projectId="p1"
        sessionId="s1"
        traceId="t1"
        showCorrections={false}
        onOpenInTraceView={onOpenInTraceView}
      />
    </SessionProvider>,
  );
  return { onOpenInTraceView };
};

describe("SessionObservationIO", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders untruncated observations through IOPreview, unchanged", () => {
    renderComponent(baseObservation);

    expect(screen.getByTestId("io-preview")).toBeInTheDocument();
    expect(screen.queryByText(/too large/i)).not.toBeInTheDocument();
  });

  it("renders a bounded preview instead of IOPreview when the server truncated I/O", () => {
    renderComponent({
      ...baseObservation,
      input: "x".repeat(4000),
      inputLength: 2_500_000,
      inputTruncated: true,
    } as SessionTraceObservation);

    expect(screen.queryByTestId("io-preview")).not.toBeInTheDocument();
    expect(
      screen.getByText(/too large to display in the session view/i),
    ).toBeInTheDocument();
    // True size is surfaced so users know what they are dealing with.
    expect(screen.getByText(/2\.5M characters/i)).toBeInTheDocument();
  });

  it("opens the trace view at the observation", () => {
    const { onOpenInTraceView } = renderComponent({
      ...baseObservation,
      inputTruncated: true,
    } as SessionTraceObservation);

    fireEvent.click(
      screen.getByRole("button", { name: /open in trace view/i }),
    );

    expect(onOpenInTraceView).toHaveBeenCalledWith("obs-1");
    expect(capture).toHaveBeenCalledWith(
      "session_detail:truncated_observation_open_trace_click",
    );
  });

  it("downloads the full raw I/O without rendering it", async () => {
    fullIOQuery.mockResolvedValue({
      id: "obs-1",
      input: "full-input",
      output: "full-output",
      metadata: JSON.stringify({ constructor: "test" }),
    });
    renderComponent({
      ...baseObservation,
      outputTruncated: true,
    } as SessionTraceObservation);

    fireEvent.click(screen.getByRole("button", { name: /download i\/o/i }));

    await waitFor(() => expect(downloadJsonFile).toHaveBeenCalledTimes(1));
    expect(fullIOQuery).toHaveBeenCalledWith({
      projectId: "p1",
      sessionId: "s1",
      traceId: "t1",
      observationId: "obs-1",
      startTime: baseObservation.startTime,
    });
    expect(downloadJsonFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "observation-obs-1.json",
        data: expect.objectContaining({
          input: "full-input",
          metadata: { constructor: "test" },
        }),
      }),
    );
  });

  it("keeps metadata visible alongside truncated I/O", () => {
    renderComponent({
      ...baseObservation,
      inputTruncated: true,
      metadata: JSON.stringify({ key: "value" }),
      metadataLength: 15,
      metadataTruncated: false,
    } as SessionTraceObservation);

    expect(screen.getByText("Metadata")).toBeInTheDocument();
    expect(screen.getByText(/"key":"value"/)).toBeInTheDocument();
  });

  // LFE-14815: trace detail resolved observation media, the session view did
  // not, so a media-bearing message had no thumbnail here.
  it("forwards observation media to IOPreview, and only looks it up when referenced", () => {
    useMediaMock.mockReturnValue({ data: [{ mediaId: "media-1" }] });
    renderComponent({
      ...baseObservation,
      input: `{"content":"@@@langfuseMedia:type=image/png|id=media-1|source=base64_data_uri@@@"}`,
    } as SessionTraceObservation);

    expect(screen.getByTestId("io-preview")).toHaveAttribute(
      "data-media-ids",
      "media-1",
    );
    expect(useMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({ observationId: "obs-1", enabled: true }),
    );

    useMediaMock.mockClear();
    renderComponent(baseObservation);

    expect(useMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("keeps IOPreview but points to the trace view when only metadata was truncated", () => {
    const { onOpenInTraceView } = renderComponent({
      ...baseObservation,
      metadataTruncated: true,
    } as SessionTraceObservation);

    expect(screen.getByTestId("io-preview")).toBeInTheDocument();
    expect(
      screen.getByText(/metadata values are too large/i),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /open in trace view/i }),
    );
    expect(onOpenInTraceView).toHaveBeenCalledWith("obs-1");
  });
});
