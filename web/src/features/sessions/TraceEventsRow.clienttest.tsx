import { render, screen } from "@testing-library/react";
import { type ComponentProps } from "react";
import { type ScoreDomain } from "@langfuse/shared";
import { TraceEventsRow } from "./TraceEventsRow";
import { type SessionObservationIO } from "./SessionObservationIO";

const scoresQuery = vi.fn();
const observationsQuery = vi.fn();

vi.mock("@/src/utils/api", () => ({
  api: {
    events: {
      scoresForTrace: {
        useQuery: (...args: unknown[]) => scoresQuery(...args),
      },
    },
    sessions: {
      observationsForTraceFromEvents: {
        useQuery: () => observationsQuery(),
      },
    },
  },
}));
vi.mock("@/src/components/GroupedScoreBadges", () => ({
  GroupedScoreBadges: () => null,
}));
vi.mock("@/src/components/ItemBadge", () => ({ ItemBadge: () => null }));
vi.mock("@/src/components/ui/CodeJsonViewer", () => ({
  JsonSkeleton: () => null,
}));
vi.mock("./SessionTraceActionButtons", () => ({
  SessionTraceActionButtons: () => null,
}));
vi.mock("@/src/features/traces", () => ({
  useChatMLParser: () => ({ allMessages: [] }),
  hasRenderableConversationMessages: () => false,
  isOnlyJsonMessage: () => true,
}));
vi.mock("./SessionObservationIO", () => ({
  SessionObservationIO: ({
    observation,
    outputCorrection,
  }: ComponentProps<typeof SessionObservationIO>) => (
    <div data-testid={observation.id}>{outputCorrection?.longStringValue}</div>
  ),
}));

const timestamp = new Date("2026-07-15T10:00:00Z");
const observation = {
  id: "obs-1",
  name: "Generation",
  type: "GENERATION",
  startTime: timestamp,
  input: "hello",
  output: "world",
  metadata: "{}",
  inputTruncated: false,
  outputTruncated: false,
};
const correction: ScoreDomain = {
  id: "correction-1",
  projectId: "p1",
  traceId: "t1",
  observationId: "obs-1",
  sessionId: null,
  datasetRunId: null,
  environment: "default",
  name: "output",
  value: 0,
  source: "ANNOTATION",
  dataType: "CORRECTION",
  stringValue: null,
  longStringValue: "Corrected output",
  authorUserId: null,
  comment: null,
  metadata: {},
  configId: null,
  queueId: null,
  executionTraceId: null,
  timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const props = {
  trace: { id: "t1", timestamp },
  projectId: "p1",
  sessionId: "s1",
  openPeek: vi.fn(),
  traceCommentCounts: undefined,
  showCorrections: true,
  filterState: [],
  viewLabel: null,
  hideTracePanel: true,
} as unknown as ComponentProps<typeof TraceEventsRow>;

describe("TraceEventsRow corrections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    observationsQuery.mockReturnValue({
      data: [observation, { ...observation, id: "obs-2" }],
    });
    scoresQuery.mockReturnValue({ data: [correction] });
  });

  it.each(["card", "modern"] as const)(
    "selects the latest correction per observation in %s mode",
    (surface) => {
      scoresQuery.mockReturnValue({
        data: [
          correction,
          {
            ...correction,
            timestamp: new Date("2026-07-14"),
            longStringValue: "Older",
          },
          {
            ...correction,
            observationId: null,
            longStringValue: "Trace correction",
          },
          {
            ...correction,
            observationId: "obs-2",
            longStringValue: "Second correction",
          },
        ],
      });
      const { unmount } = render(
        <TraceEventsRow {...props} surface={surface} />,
      );
      expect(screen.getByTestId("obs-1")).toHaveTextContent("Corrected output");
      expect(screen.getByTestId("obs-2")).toHaveTextContent(
        "Second correction",
      );
      expect(scoresQuery).toHaveBeenCalledTimes(1);
      unmount();
      render(<TraceEventsRow {...props} surface={surface} />);
      expect(screen.getByTestId("obs-1")).toHaveTextContent("Corrected output");
    },
  );
});
