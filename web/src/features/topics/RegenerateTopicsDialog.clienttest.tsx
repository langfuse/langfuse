import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { type TopicFacet } from "@langfuse/shared/topics";
import { useRegenerateTopics } from "./RegenerateTopicsDialog";

const state = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  rules: [] as Array<{ facetIds: string[] }>,
  counts: [] as Array<{ facetId: string; facetVersion: number; count: number }>,
  mutateAsync: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    topics: {
      modelSettings: {
        useQuery: () => ({ isPending: false, data: state.settings }),
      },
      rules: { useQuery: () => ({ data: state.rules }) },
      summaryCounts: {
        useQuery: (input: unknown) =>
          typeof input === "symbol"
            ? { isPending: true }
            : { isPending: false, data: state.counts },
      },
      trigger: {
        useMutation: () => ({
          mutateAsync: state.mutateAsync,
          isPending: false,
        }),
      },
    },
  },
}));

const timeRange = {
  from: new Date("2026-10-06T12:00:00Z"),
  to: new Date("2026-10-13T12:00:00Z"),
};
const facet = (id: string, versions: number[]): TopicFacet => ({
  id,
  projectId: "project",
  name: id,
  description: "",
  isBuiltIn: true,
  versions: versions.map((version) => ({
    projectId: "project",
    facetId: id,
    version,
    prompt: "",
    createdAt: "2026-10-01T00:00:00Z",
  })),
});
const facets = [
  facet("intent", [2, 1]),
  facet("outcome", [1]),
  facet("language", [1]),
];
const execution = (
  status: string,
  operation: "process" | "update" = "update",
) => ({
  id: `${operation}-${status}`,
  status,
  createdAt: "2026-10-13T11:00:00Z",
  input: { operation },
});

function Harness({
  canWrite = true,
  executions = [],
  onTriggered = vi.fn(),
}: {
  canWrite?: boolean;
  executions?: ReturnType<typeof execution>[];
  onTriggered?: (id: string) => void;
}) {
  const regenerate = useRegenerateTopics({
    projectId: "project",
    facets,
    canWrite,
    timeRange,
    executions: executions as never,
    onTriggered,
  });
  return (
    <>
      {regenerate.action}
      {regenerate.dialog}
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.settings = {
    summary: { model: "summary" },
    embedding: { model: "embedding" },
    clustering: { model: "clustering" },
    blockedAt: null,
    blockMessage: null,
  };
  state.rules = [{ facetIds: ["intent", "outcome"] }];
  state.counts = [
    { facetId: "intent", facetVersion: 2, count: 240 },
    { facetId: "outcome", facetVersion: 1, count: 0 },
  ];
  state.mutateAsync.mockResolvedValue({ id: "execution" });
});

it.each([
  {
    name: "without topics:CUD",
    props: { canWrite: false },
    reason:
      "You need permission to manage Topics in this project to regenerate topics.",
  },
  {
    name: "while Topics is paused",
    setup: () => {
      state.settings.blockedAt = "2026-10-13T10:00:00Z";
      state.settings.blockMessage = "Fix the connection.";
    },
    reason: "Topics is paused. Fix the connection.",
  },
  {
    name: "while any Topics run is in progress",
    props: { executions: [execution("running", "process")] },
    reason: "A Topics run is in progress. Regenerate when it finishes.",
  },
  {
    name: "before any summaries exist",
    setup: () => {
      state.counts = [];
    },
    reason:
      "No trace summaries in the selected time range yet. Summarize traces first, then regenerate.",
  },
])("disables the entry point $name", ({ props, setup, reason }) => {
  setup?.();
  render(<Harness {...props} />);
  expect(
    screen.getByRole("button", { name: "Regenerate topics" }),
  ).toBeDisabled();
  expect(screen.getByLabelText(reason)).toBeInTheDocument();
});

it("regenerates the rule's facets that have summaries, at their latest version, over the page range", async () => {
  const onTriggered = vi.fn();
  render(
    <Harness executions={[execution("completed")]} onTriggered={onTriggered} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Regenerate topics" }));

  expect(screen.getByText("Completed")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "outcome" })).toBeDisabled();
  expect(screen.queryByRole("checkbox", { name: "language" })).toBeNull();

  const submit = screen
    .getAllByRole("button", { name: "Regenerate topics" })
    .at(-1)!;
  fireEvent.click(submit);

  await waitFor(() => expect(onTriggered).toHaveBeenCalledWith("execution"));
  expect(state.mutateAsync).toHaveBeenCalledWith({
    projectId: "project",
    operation: "update",
    facets: [{ facetId: "intent", version: 2 }],
    exploratory: false,
    timeRange,
    minimumTraceCount: 100,
    requestId: expect.any(String),
  });
});
