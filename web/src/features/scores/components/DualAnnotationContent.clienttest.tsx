import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  type UseMutationOptions,
} from "@tanstack/react-query";
import type {
  CreateAnnotationScoreData,
  ScoreConfigDomain,
} from "@langfuse/shared";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import {
  ScoreCacheProvider,
  useScoreCache,
} from "@/src/features/scores/contexts/ScoreCacheContext";
import { DualAnnotationContent } from "./DualAnnotationContent";
import { AnnotationForm } from "./AnnotationForm";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  capture: vi.fn(),
}));
const configs = [
  {
    id: "quality",
    name: "Quality",
    projectId: "project",
    dataType: "BOOLEAN",
    categories: [
      { label: "False", value: 0 },
      { label: "True", value: 1 },
    ],
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
] satisfies ScoreConfigDomain[];

vi.mock("@/src/features/rbac", () => ({ useHasProjectAccess: () => false }));
vi.mock("@/src/features/notifications", () => ({ showErrorToast: vi.fn() }));
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));
vi.mock("@/src/utils/api", async () => {
  const { useMutation } = await import("@tanstack/react-query");
  return {
    api: {
      scoreConfigs: {
        all: { useQuery: () => ({ isLoading: false, data: { configs } }) },
      },
      scores: {
        createAnnotationScore: {
          useMutation: (
            options: UseMutationOptions<
              unknown,
              Error,
              CreateAnnotationScoreData
            >,
          ) => useMutation({ ...options, mutationFn: mocks.create }),
        },
        updateAnnotationScore: {
          useMutation: (options: UseMutationOptions) =>
            useMutation({ ...options, mutationFn: mocks.update }),
        },
        deleteAnnotationScore: {
          useMutation: (options: UseMutationOptions) =>
            useMutation({ ...options, mutationFn: mocks.remove }),
        },
      },
    },
  };
});

function CacheProbe() {
  const cache = useScoreCache();
  return (
    <output aria-label="Cached scores">{JSON.stringify(cache.getAll())}</output>
  );
}

const content = (
  <DualAnnotationContent
    projectId="project"
    isV4
    traceId="trace"
    observationId="observation"
    traceEnvironment="trace-env"
    observationEnvironment="observation-env"
    traceScores={[]}
    observationScores={[]}
  />
);

function renderContent(children = content) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LayerProvider>
        <ScoreCacheProvider>
          {children}
          <CacheProbe />
        </ScoreCacheProvider>
      </LayerProvider>
    </QueryClientProvider>,
  );
}

describe("unified annotation targets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem(
      "emptySelectedConfigIds:observation",
      JSON.stringify(["quality"]),
    );
    localStorage.setItem(
      "emptySelectedConfigIds:trace",
      JSON.stringify(["quality"]),
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("navigates one form and saves the same config independently for observation and trace", async () => {
    mocks.create.mockResolvedValue({});
    renderContent();

    expect(
      screen.getAllByRole("combobox", { name: "Score fields" }),
    ).toHaveLength(1);
    expect(
      screen.queryByText(/Score data saved|^Saved$/),
    ).not.toBeInTheDocument();
    const observationRow = screen.getByRole("group", {
      name: "Quality (Observation)",
    });
    const traceRow = screen.getByRole("group", { name: "Quality (Trace)" });
    act(() => observationRow.focus());
    fireEvent.keyDown(observationRow, { key: "1" });
    fireEvent.keyDown(observationRow, { key: "ArrowDown" });
    expect(traceRow).toHaveFocus();
    fireEvent.keyDown(traceRow, { key: "2" });

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    const writes = mocks.create.mock.calls.map(([variables]) => variables);
    expect(writes).toEqual([
      expect.objectContaining({
        configId: "quality",
        value: 0,
        environment: "observation-env",
        scoreTarget: {
          type: "trace",
          traceId: "trace",
          observationId: "observation",
        },
      }),
      expect.objectContaining({
        configId: "quality",
        value: 1,
        environment: "trace-env",
        scoreTarget: { type: "trace", traceId: "trace" },
      }),
    ]);
    expect(writes[0].id).not.toBe(writes[1].id);
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "Score save status" }),
      ).toHaveTextContent("Saved"),
    );
    const cached = JSON.parse(
      screen.getByLabelText("Cached scores").textContent!,
    );
    expect(cached).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          observationId: "observation",
          configId: "quality",
          value: 0,
          environment: "observation-env",
        }),
        expect.objectContaining({
          observationId: null,
          configId: "quality",
          value: 1,
          environment: "trace-env",
        }),
      ]),
    );
    expect(
      within(observationRow).getByRole("radio", { name: /False/ }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      within(traceRow).getByRole("radio", { name: /True/ }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("rolls back an earlier target failure while another target succeeds and allows retry", async () => {
    const first = deferred();
    const second = deferred();
    mocks.create
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockResolvedValue({});
    renderContent();
    expect(
      screen.queryByRole("status", { name: "Score save status" }),
    ).not.toBeInTheDocument();
    const observationRow = screen.getByRole("group", {
      name: "Quality (Observation)",
    });
    const traceRow = screen.getByRole("group", { name: "Quality (Trace)" });
    act(() => observationRow.focus());
    fireEvent.keyDown(observationRow, { key: "1" });
    act(() => traceRow.focus());
    fireEvent.keyDown(traceRow, { key: "2" });
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole("status", { name: "Score save status" }),
    ).toHaveTextContent("Saving");
    await act(async () => {
      first.reject(new Error("Could not write observation"));
      second.resolve({});
    });
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "Score save status" }),
      ).toHaveTextContent("Could not save"),
    );
    expect(
      within(observationRow).getByRole("radio", { name: /False/ }),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      within(traceRow).getByRole("radio", { name: /True/ }),
    ).toHaveAttribute("aria-checked", "true");
    act(() => observationRow.focus());
    fireEvent.keyDown(observationRow, { key: "1" });
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(3));
    expect(mocks.update).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "Score save status" }),
      ).toHaveTextContent("Saved"),
    );
  });

  it("keeps a single-target numeric form untagged and hides Saved while its next draft is invalid", async () => {
    const numeric = {
      ...configs[0]!,
      id: "numeric",
      name: "Rating",
      dataType: "NUMERIC" as const,
      minValue: 0,
      maxValue: 10,
      categories: null,
    };
    mocks.create.mockResolvedValue({});
    renderContent(
      <AnnotationForm
        scoreTarget={{ type: "session", sessionId: "session" }}
        serverScores={[]}
        scoreMetadata={{ projectId: "project", environment: "session-env" }}
        analyticsData={{ type: "session", source: "SessionDetail", isV4: true }}
        configSelection={{ mode: "fixed", configs: [numeric] }}
      />,
    );
    expect(
      screen.queryByRole("status", { name: "Score save status" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Rating" })).toBeInTheDocument();
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "Score save status" }),
      ).toHaveTextContent("Saved"),
    );
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scoreTarget: { type: "session", sessionId: "session" },
        environment: "session-env",
      }),
    );
    fireEvent.change(input, { target: { value: "11" } });
    expect(
      screen.queryByRole("status", { name: "Score save status" }),
    ).not.toBeInTheDocument();
    fireEvent.blur(input);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });
});

function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<unknown>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}
