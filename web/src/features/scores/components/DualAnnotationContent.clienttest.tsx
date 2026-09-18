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
  ScoreDomain,
} from "@langfuse/shared";
import type HeaderComponent from "@/src/components/layouts/header";
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
  headerRender: vi.fn(),
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

vi.mock("@/src/components/layouts/header", async (importOriginal) => {
  const { default: Header } = await importOriginal<{
    default: typeof HeaderComponent;
  }>();
  return {
    default: (props: React.ComponentProps<typeof Header>) => {
      mocks.headerRender();
      return <Header {...props} />;
    },
  };
});

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
  const wrap = (children: React.ReactNode) => (
    <QueryClientProvider client={queryClient}>
      <LayerProvider>
        <ScoreCacheProvider>
          {children}
          <CacheProbe />
        </ScoreCacheProvider>
      </LayerProvider>
    </QueryClientProvider>
  );
  const rendered = render(wrap(children));
  return {
    ...rendered,
    rerenderContent: (next: React.ReactNode) => rendered.rerender(wrap(next)),
  };
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

  it("keeps draft edits local, preserves them through refetch, and resets only for another target", () => {
    const text = {
      ...configs[0]!,
      id: "feedback",
      name: "Feedback",
      dataType: "TEXT" as const,
      categories: null,
    };
    const score = (sessionId: string, stringValue: string): ScoreDomain => ({
      id: `score-${sessionId}`,
      projectId: "project",
      environment: "default",
      name: "Feedback",
      value: 0,
      dataType: "TEXT",
      stringValue,
      longStringValue: "",
      source: "ANNOTATION",
      authorUserId: null,
      comment: null,
      metadata: {},
      configId: "feedback",
      queueId: null,
      executionTraceId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      timestamp: new Date(),
      traceId: null,
      sessionId,
      datasetRunId: null,
      observationId: null,
    });
    const contentFor = (sessionId: string, value: string) => (
      <AnnotationForm
        scoreTarget={{ type: "session", sessionId }}
        serverScores={[{ ...score(sessionId, value), metadata: "{}" }]}
        scoreMetadata={{ projectId: "project" }}
        analyticsData={{ type: "session", source: "SessionDetail", isV4: true }}
        configSelection={{ mode: "fixed", configs: [text] }}
      />
    );
    const view = renderContent(contentFor("session", "Original"));
    const input = screen.getByRole("textbox");
    mocks.headerRender.mockClear();
    fireEvent.change(input, { target: { value: "My unsaved draft" } });
    expect(mocks.headerRender).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    view.rerenderContent(contentFor("session", "Background refetch"));
    expect(screen.getByRole("textbox")).toBe(input);
    expect(input).toHaveValue("My unsaved draft");
    view.rerenderContent(contentFor("next-session", "Other session score"));
    expect(screen.getByRole("textbox")).toHaveValue("Other session score");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("navigates one form and saves the same config independently for observation and trace", async () => {
    mocks.create.mockResolvedValue({});
    renderContent();

    expect(screen.getAllByRole("combobox", { name: "Scores" })).toHaveLength(1);
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

  it("restores a categorical score after a failed clear and keeps its field after retry", async () => {
    mocks.create.mockResolvedValue({});
    mocks.remove
      .mockRejectedValueOnce(new Error("Could not clear score"))
      .mockResolvedValue({});
    renderContent();
    const observationRow = screen.getByRole("group", {
      name: "Quality (Observation)",
    });
    const traceRow = screen.getByRole("group", { name: "Quality (Trace)" });
    act(() => observationRow.focus());
    fireEvent.keyDown(observationRow, { key: "1" });
    act(() => traceRow.focus());
    fireEvent.keyDown(traceRow, { key: "2" });
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "Score save status" }),
      ).toHaveTextContent("Saved"),
    );
    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "Score actions for Quality (Observation)",
      }),
      { key: "ArrowDown" },
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Clear score" }),
    );
    expect(await screen.findByText("Failed to clear score")).toBeVisible();
    const restored = screen.getByRole("group", {
      name: "Quality (Observation)",
    });
    expect(
      within(restored).getByRole("radio", { name: /False/ }),
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "Score actions for Quality (Observation)",
      }),
      { key: "ArrowDown" },
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Clear score" }),
    );
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(2));
    expect(mocks.remove).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: mocks.create.mock.calls[0]![0].id,
        projectId: "project",
      }),
    );
    expect(screen.queryByText("Failed to clear score")).not.toBeInTheDocument();
    const cleared = screen.getByRole("group", {
      name: "Quality (Observation)",
    });
    expect(
      within(cleared).getByRole("radio", { name: /False/ }),
    ).toHaveAttribute("aria-checked", "false");
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
    fireEvent.click(
      within(observationRow).getByRole("radio", { name: /False/ }),
    );
    fireEvent.click(within(traceRow).getByRole("radio", { name: /True/ }));
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

  it("rolls back the same target after an earlier empty row is removed during its save", async () => {
    const pending = deferred();
    mocks.create.mockReturnValueOnce(pending.promise).mockResolvedValue({});
    renderContent();
    fireEvent.click(
      within(screen.getByRole("group", { name: "Quality (Trace)" })).getByRole(
        "radio",
        { name: /True/ },
      ),
    );
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    fireEvent.click(
      screen.getByRole("button", { name: /Remove .*Quality \(Observation\)/ }),
    );
    await act(async () => pending.reject(new Error("Trace save failed")));
    const remaining = screen.getByRole("group", { name: "Quality" });
    expect(
      within(remaining).getByRole("radio", { name: /True/ }),
    ).toHaveAttribute("aria-checked", "false");
    expect(within(remaining).getByText("Failed to create score")).toBeVisible();
    fireEvent.click(within(remaining).getByRole("radio", { name: /False/ }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scoreTarget: { type: "trace", traceId: "trace" },
        value: 0,
      }),
    );
    expect(mocks.update).not.toHaveBeenCalled();
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
    fireEvent.input(input, { target: { value: "5" } });
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
    fireEvent.input(input, { target: { value: "11" } });
    expect(
      screen.queryByRole("status", { name: "Score save status" }),
    ).not.toBeInTheDocument();
    fireEvent.blur(input);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("does not delete a saved score for Firefox badInput and recovers from number and range errors", async () => {
    const numeric = {
      ...configs[0]!,
      id: "numeric",
      name: "Rating",
      dataType: "NUMERIC" as const,
      minValue: 1,
      maxValue: 5,
      categories: null,
    };
    mocks.create.mockResolvedValue({});
    mocks.update.mockResolvedValue({});
    mocks.remove.mockResolvedValue({});
    renderContent(
      <AnnotationForm
        scoreTarget={{ type: "session", sessionId: "session" }}
        serverScores={[]}
        scoreMetadata={{ projectId: "project", environment: "session-env" }}
        analyticsData={{ type: "session", source: "SessionDetail", isV4: true }}
        configSelection={{ mode: "fixed", configs: [numeric] }}
      />,
    );
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "5" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "Score save status" }),
      ).toHaveTextContent("Saved"),
    );

    fireEvent.input(input, { target: { value: "" } });
    const badInput = vi
      .spyOn(input.validity, "badInput", "get")
      .mockReturnValue(true);
    // Firefox emits another input event while its sanitized value stays empty.
    fireEvent.input(input);
    expect(screen.getByText("Enter a number")).toBeVisible();
    expect(input).toHaveAttribute("aria-invalid", "true");
    await act(async () => fireEvent.blur(input));
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a number")).toBeVisible();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter a number");

    badInput.mockReturnValue(false);
    fireEvent.input(input, { target: { value: "6" } });
    expect(screen.getByText("Enter a value between 1 and 5")).toBeVisible();
    fireEvent.blur(input);
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.input(input, { target: { value: "3" } });
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(
      screen.queryByText("Enter a value between 1 and 5"),
    ).not.toBeInTheDocument();
    fireEvent.blur(input);
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          value: 3,
          scoreTarget: { type: "session", sessionId: "session" },
        }),
      ),
    );
    await act(async () => {
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.blur(input);
    });
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    badInput.mockRestore();
  });

  it("saves on another row's actions and when dismissing its own actions without clearing", async () => {
    const text = {
      ...configs[0]!,
      id: "feedback",
      name: "Feedback",
      dataType: "TEXT" as const,
      categories: null,
    };
    mocks.create.mockResolvedValue({});
    mocks.update.mockResolvedValue({});
    renderContent(
      <AnnotationForm
        scoreTarget={{ type: "session", sessionId: "session" }}
        serverScores={[]}
        scoreMetadata={{ projectId: "project" }}
        analyticsData={{ type: "session", source: "SessionDetail", isV4: true }}
        configSelection={{
          mode: "fixed",
          configs: [text, { ...text, id: "notes", name: "Notes" }],
        }}
      />,
    );
    const input = within(
      screen.getByRole("group", { name: "Feedback" }),
    ).getByRole("textbox");
    const otherInput = within(
      screen.getByRole("group", { name: "Notes" }),
    ).getByRole("textbox");
    fireEvent.change(otherInput, { target: { value: "Other draft" } });
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "Save feedback" } });
    const otherActions = screen.getByRole("button", {
      name: "Score actions for Notes",
    });
    act(() => otherActions.focus());
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        configId: "feedback",
        stringValue: "Save feedback",
      }),
    );

    act(() => input.focus());
    fireEvent.change(input, { target: { value: "Keep this edit" } });
    const actions = screen.getByRole("button", {
      name: "Score actions for Feedback",
    });
    act(() => actions.focus());
    fireEvent.keyDown(actions, { key: "ArrowDown" });
    const clearItem = await screen.findByRole("menuitem", {
      name: "Clear score",
    });
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.keyDown(clearItem, { key: "Escape" });
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          configId: "feedback",
          stringValue: "Keep this edit",
        }),
      ),
    );
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(otherInput).toHaveValue("Other draft");
  });

  it("clears an unsaved draft from the labeled menu without posting it or removing a fixed field", async () => {
    const text = {
      ...configs[0]!,
      id: "feedback",
      name: "Feedback",
      dataType: "TEXT" as const,
      categories: null,
    };
    renderContent(
      <AnnotationForm
        scoreTarget={{ type: "session", sessionId: "session" }}
        serverScores={[]}
        scoreMetadata={{ projectId: "project" }}
        analyticsData={{ type: "session", source: "SessionDetail", isV4: true }}
        configSelection={{ mode: "fixed", configs: [text] }}
      />,
    );
    const input = screen.getByRole("textbox");
    expect(
      screen.queryByRole("button", { name: "Score actions for Feedback" }),
    ).not.toBeInTheDocument();
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "Unsent feedback" } });
    const actions = screen.getByRole("button", {
      name: "Score actions for Feedback",
    });
    act(() => actions.focus());
    fireEvent.keyDown(actions, { key: "ArrowDown" });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Clear score" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getByRole("group", { name: "Feedback" })).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("status", { name: "Score save status" }),
    ).not.toBeInTheDocument();
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
