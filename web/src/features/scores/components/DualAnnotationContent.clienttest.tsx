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
import { cloneElement, createRef } from "react";
import type { AnnotationRefreshHandle } from "../types";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  capture: vi.fn(),
  headerRender: vi.fn(),
  hasConfigAccess: false,
  configsLoading: false,
}));
const defaultConfig = {
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
} satisfies ScoreConfigDomain;
const configs: ScoreConfigDomain[] = [defaultConfig];

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

vi.mock("@/src/features/rbac", () => ({
  useHasProjectAccess: () => mocks.hasConfigAccess,
}));
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
        all: {
          useQuery: () => ({
            isLoading: mocks.configsLoading,
            data: { configs },
          }),
        },
        appendCategory: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
      },
      useUtils: () => ({
        scoreConfigs: { invalidate: vi.fn() },
        annotationQueues: { invalidate: vi.fn() },
      }),
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

function serverQualityScore() {
  return {
    longStringValue: "",
    executionTraceId: null,
    datasetRunId: null,
    id: "saved-quality",
    configId: "quality",
    name: "Quality",
    source: "ANNOTATION",
    dataType: "BOOLEAN",
    value: 0,
    stringValue: "False",
    comment: "Saved comment",
    traceId: "trace",
    observationId: "observation",
    projectId: "project",
    timestamp: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {},
    environment: "default",
    queueId: null,
    sessionId: null,
    authorUserId: null,
  } satisfies ScoreDomain;
}

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
    mocks.hasConfigAccess = false;
    mocks.configsLoading = false;
    Element.prototype.scrollIntoView = vi.fn();
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

  afterEach(() => {
    configs.splice(1);
    vi.unstubAllGlobals();
  });

  it("adds scores once and removes only the chosen empty row", async () => {
    configs.push({ ...defaultConfig, id: "accuracy", name: "Accuracy" });
    const rendered = renderContent();
    fireEvent.click(screen.getByRole("button", { name: "Add score" }));
    expect(
      screen.queryByRole("option", { name: /Quality/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("option", { name: /Accuracy/ }));
    expect(screen.getAllByRole("group", { name: "Accuracy" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Add score" })).toBeDisabled();
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Score actions for Accuracy" }),
      { key: "ArrowDown" },
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Remove score" }),
    );
    expect(
      screen.queryByRole("group", { name: "Accuracy" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Quality" })).toBeInTheDocument();
    expect(mocks.remove).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add score" })).toHaveFocus(),
    );
    rendered.unmount();
    renderContent();
    expect(
      screen.queryByRole("group", { name: "Accuracy" }),
    ).not.toBeInTheDocument();
  });

  it("focuses the first score on activation without taking focus on rerenders", async () => {
    mocks.create.mockResolvedValue({});
    const refreshRef = createRef<AnnotationRefreshHandle>();
    const view = (isActive: boolean) => (
      <>
        <button>Outside annotation</button>
        {cloneElement(content, { isActive, refreshRef })}
      </>
    );
    const rendered = renderContent(view(false));
    const outside = screen.getByRole("button", { name: "Outside annotation" });
    outside.focus();
    rendered.rerenderContent(view(true));
    const row = screen.getByRole("group", { name: "Quality" });
    await waitFor(() => expect(row).toHaveFocus());
    fireEvent.keyDown(row, { key: "2" });
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(row).toHaveFocus();

    outside.focus();
    rendered.rerenderContent(view(true));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(outside).toHaveFocus();
    act(() => refreshRef.current?.focus());
    await waitFor(() => expect(row).toHaveFocus());
    outside.focus();
    rendered.rerenderContent(view(false));
    rendered.rerenderContent(view(true));
    await waitFor(() => expect(row).toHaveFocus());
  });

  it("focuses a loaded empty form unless its drawer is closing", async () => {
    localStorage.clear();
    mocks.configsLoading = true;
    const view = (state: "open" | "closed") => (
      <>
        <button>Outside annotation</button>
        <div data-state={state}>{content}</div>
      </>
    );
    const rendered = renderContent(view("open"));
    expect(screen.queryByRole("button", { name: "Add score" })).toBeNull();
    mocks.configsLoading = false;
    rendered.rerenderContent(view("open"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add score" })).toHaveFocus(),
    );

    mocks.configsLoading = true;
    rendered.rerenderContent(view("closed"));
    const outside = screen.getByRole("button", { name: "Outside annotation" });
    outside.focus();
    mocks.configsLoading = false;
    rendered.rerenderContent(view("closed"));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(outside).toHaveFocus();
  });

  it("shows the annotation guidance inline when no scores are selected", () => {
    localStorage.clear();
    renderContent();

    expect(
      screen.getByText(
        "Annotate the trace and observation with scores to capture human evaluation across different dimensions.",
      ),
    ).toBeVisible();
  });

  it("suspends score shortcuts while a shared action menu is open", async () => {
    mocks.create.mockResolvedValue({});
    const view = (menuOpen: boolean) => (
      <>
        {content}
        {menuOpen && <div role="menu" aria-label="More actions" />}
      </>
    );
    const rendered = renderContent(view(false));
    const row = screen.getByRole("group", { name: "Quality" });
    await waitFor(() => expect(row).toHaveFocus());
    rendered.rerenderContent(view(true));
    await act(async () => fireEvent.keyDown(row, { key: "2" }));
    expect(mocks.create).not.toHaveBeenCalled();
    rendered.rerenderContent(view(false));
    row.focus();
    fireEvent.keyDown(row, { key: "2" });
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  });

  it("preserves inactive drafts without handling keyboard navigation until reopened", () => {
    configs.push({
      ...defaultConfig,
      id: "feedback",
      name: "Feedback",
      dataType: "TEXT",
      categories: null,
    });
    localStorage.setItem(
      "emptySelectedConfigIds:observation",
      JSON.stringify(["quality", "feedback"]),
    );
    const rendered = renderContent();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Keep this draft" },
    });
    rendered.rerenderContent(cloneElement(content, { isActive: false }));
    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    expect(document.activeElement).toBe(document.body);
    expect(mocks.create).not.toHaveBeenCalled();
    rendered.rerenderContent(content);
    expect(screen.getByRole("textbox")).toHaveValue("Keep this draft");
    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    expect(screen.getByRole("group", { name: "Feedback" })).toHaveFocus();
  });

  it.each(["picker", "row menu", "category"])(
    "hides an open %s portal while annotation is inactive",
    async (control) => {
      if (control === "picker")
        configs.push({ ...defaultConfig, id: "accuracy", name: "Accuracy" });
      if (control === "category") {
        configs.push({
          ...defaultConfig,
          id: "accuracy",
          name: "Accuracy",
          dataType: "CATEGORICAL",
          categories: [
            { label: "Fully correct", value: 1 },
            { label: "Partly correct", value: 0 },
          ],
        });
        localStorage.setItem(
          "emptySelectedConfigIds:observation",
          JSON.stringify(["accuracy"]),
        );
      }
      const rendered = renderContent();
      if (control === "row menu") {
        fireEvent.keyDown(
          screen.getByRole("button", { name: "Score actions for Quality" }),
          { key: "ArrowDown" },
        );
        expect(await screen.findByRole("menu")).toBeVisible();
      } else {
        const trigger =
          control === "picker"
            ? screen.getByRole("button", { name: "Add score" })
            : within(screen.getByRole("group", { name: "Accuracy" })).getByRole(
                "combobox",
              );
        fireEvent.click(trigger);
        expect(await screen.findByRole("listbox")).toBeVisible();
      }
      rendered.rerenderContent(cloneElement(content, { isActive: false }));
      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      });
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );

  it("refreshes clean scores on reopening while retaining text and score-comment drafts", async () => {
    configs.push({
      ...defaultConfig,
      id: "feedback",
      name: "Feedback",
      dataType: "TEXT",
      categories: undefined,
    });
    localStorage.setItem(
      "emptySelectedConfigIds:observation",
      JSON.stringify(["quality", "feedback"]),
    );
    const score = serverQualityScore();
    const refreshRef = createRef<AnnotationRefreshHandle>();
    renderContent(
      cloneElement(content, {
        observationScores: [{ ...score, metadata: "{}" }],
        refreshRef,
      }),
    );
    const quality = screen.getByRole("group", { name: "Quality" });
    const feedback = within(
      screen.getByRole("group", { name: "Feedback" }),
    ).getByRole("textbox");
    fireEvent.change(feedback, { target: { value: "Unsent feedback" } });
    fireEvent.click(within(quality).getByTitle("Add or view score comment"));
    const comment = await within(screen.getByRole("dialog")).findByRole(
      "textbox",
    );
    fireEvent.change(comment, { target: { value: "Unsent score comment" } });
    act(() =>
      refreshRef.current?.refresh({
        scoreTarget: {
          type: "trace",
          traceId: "trace",
          observationId: "observation",
        },
        scoreMetadata: { projectId: "project" },
        analyticsData: { type: "trace", source: "TraceDetail", isV4: true },
        scores: [
          {
            ...score,
            metadata: "{}",
            value: 1,
            stringValue: "True",
            comment: "Updated remotely",
          },
        ],
        companionTrace: {
          environment: "default",
          scores: [
            {
              ...score,
              metadata: "{}",
              id: "trace-quality",
              observationId: null,
              value: 1,
              stringValue: "True",
            },
          ],
        },
      }),
    );
    expect(
      within(screen.getByRole("group", { name: "Quality (Trace)" })).getByRole(
        "radio",
        { name: /True/ },
      ),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      within(quality).getByRole("radio", { name: /True/ }),
    ).toHaveAttribute("aria-checked", "true");
    expect(feedback).toHaveValue("Unsent feedback");
    expect(comment).toHaveValue("Unsent score comment");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("retains pending and just-saved values across lagging refreshes, then accepts acknowledged external edits", async () => {
    const score = serverQualityScore();
    const pending = deferred();
    mocks.update.mockReturnValueOnce(pending.promise);
    const refreshRef = createRef<AnnotationRefreshHandle>();
    renderContent(
      cloneElement(content, {
        observationScores: [{ ...score, metadata: "{}" }],
        refreshRef,
      }),
    );
    const row = screen.getByRole("group", { name: "Quality" });
    const refresh = (value: number, scoresPresent = true) =>
      act(() =>
        refreshRef.current?.refresh({
          scoreTarget: {
            type: "trace",
            traceId: "trace",
            observationId: "observation",
          },
          scoreMetadata: { projectId: "project" },
          analyticsData: { type: "trace", source: "TraceDetail", isV4: true },
          scores: scoresPresent
            ? [
                {
                  ...score,
                  metadata: "{}",
                  value,
                  stringValue: value ? "True" : "False",
                },
              ]
            : [],
          companionTrace: { environment: "default", scores: [] },
        }),
      );
    fireEvent.click(within(row).getByRole("radio", { name: /True/ }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
    refresh(0);
    expect(within(row).getByRole("radio", { name: /True/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await act(async () => pending.resolve({}));
    refresh(0);
    expect(within(row).getByRole("radio", { name: /True/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    refresh(1);
    refresh(0);
    expect(within(row).getByRole("radio", { name: /False/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    refresh(0, false);
    expect(within(row).getByRole("radio", { name: /False/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(mocks.update).toHaveBeenCalledOnce();

    refresh(0);
    const clearing = deferred();
    mocks.remove.mockReturnValueOnce(clearing.promise);
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Score actions for Quality" }),
      { key: "ArrowDown" },
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Clear score" }),
    );
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledOnce());
    await act(async () => clearing.resolve({}));
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Score actions for Quality" }),
      { key: "ArrowDown" },
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Remove score" }),
    );
    refresh(0);
    expect(
      screen.queryByRole("group", { name: "Quality" }),
    ).not.toBeInTheDocument();

    refresh(1);
    expect(screen.getByRole("radio", { name: /True/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("hides the score comment portal without losing its unsaved draft", async () => {
    mocks.create.mockResolvedValue({});
    const rendered = renderContent();
    fireEvent.click(screen.getByRole("radio", { name: /True/ }));
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "Score save status" }),
      ).toHaveTextContent("Saved"),
    );
    fireEvent.click(screen.getByTitle("Add or view score comment"));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Unsent score comment" },
    });
    rendered.rerenderContent(cloneElement(content, { isActive: false }));
    await waitFor(() =>
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument(),
    );
    rendered.rerenderContent(content);
    expect(await screen.findByRole("textbox")).toHaveValue(
      "Unsent score comment",
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("retains an unfinished new category while its annotation panel is inactive", async () => {
    mocks.hasConfigAccess = true;
    configs.push({
      ...defaultConfig,
      id: "accuracy",
      name: "Accuracy",
      dataType: "CATEGORICAL",
      categories: [{ label: "Good", value: 1 }],
    });
    localStorage.setItem(
      "emptySelectedConfigIds:observation",
      JSON.stringify(["accuracy"]),
    );
    const rendered = renderContent();
    fireEvent.click(screen.getByRole("button", { name: "Add new category" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Category name" }), {
      target: { value: "Needs follow-up" },
    });
    rendered.rerenderContent(cloneElement(content, { isActive: false }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Add category" }),
      ).not.toBeInTheDocument(),
    );
    rendered.rerenderContent(content);
    expect(
      await screen.findByRole("textbox", { name: "Category name" }),
    ).toHaveValue("Needs follow-up");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("chooses a target before the first save and cannot change it during or after saving", async () => {
    const pending = deferred();
    mocks.create.mockReturnValue(pending.promise);
    renderContent();
    expect(screen.getAllByRole("group", { name: "Quality" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Add score" })).toBeDisabled();
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Score actions for Quality" }),
      { key: "ArrowDown" },
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Score trace instead" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledWith("score:level_changed", {
      type: "trace",
      source: "TraceDetail",
      isV4: true,
      previousTargetType: "observation",
      targetType: "trace",
      dataType: "BOOLEAN",
    });
    fireEvent.click(screen.getByRole("radio", { name: /True/ }));
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          scoreTarget: { type: "trace", traceId: "trace" },
          value: 1,
        }),
      ),
    );
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Score actions for Quality" }),
      { key: "ArrowDown" },
    );
    expect(
      await screen.findByText(
        "This score is saved on the trace and cannot be moved.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("menuitem", { name: "Score observation instead" }),
    ).not.toBeInTheDocument();
    await act(async () => pending.resolve({}));
    expect(
      screen.queryByRole("menuitem", { name: "Score observation instead" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Also score observation" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );
    const observationRow = screen.getByRole("group", {
      name: "Quality (Observation)",
    });
    const traceRow = screen.getByRole("group", { name: "Quality (Trace)" });
    expect(
      within(observationRow).getByRole("radio", { name: /True/ }),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      within(traceRow).getByRole("radio", { name: /True/ }),
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(
      within(traceRow).getByRole("button", { name: /Score actions/ }),
      { key: "ArrowDown" },
    );
    expect(
      await screen.findByRole("menuitem", {
        name: "Also score observation (already selected)",
      }),
    ).toHaveAttribute("aria-disabled", "true");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(traceRow).toHaveFocus());
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("keeps a text draft while changing level without saving it on menu close", async () => {
    configs.push({
      ...defaultConfig,
      id: "feedback",
      name: "Feedback",
      dataType: "TEXT",
      categories: null,
    });
    localStorage.setItem(
      "emptySelectedConfigIds:observation",
      JSON.stringify(["feedback"]),
    );
    localStorage.setItem("emptySelectedConfigIds:trace", JSON.stringify([]));
    mocks.create.mockResolvedValue({});
    renderContent();
    const input = screen.getByRole("textbox");
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "My unsaved review" } });
    const menu = screen.getByRole("button", {
      name: "Score actions for Feedback",
    });
    act(() => menu.focus());
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Score trace instead" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("textbox")).toHaveValue("My unsaved review");
    expect(mocks.create).not.toHaveBeenCalled();
    fireEvent.blur(screen.getByRole("textbox"));
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          scoreTarget: { type: "trace", traceId: "trace" },
          stringValue: "My unsaved review",
        }),
      ),
    );
  });

  it("keeps draft edits local, preserves them through refetch, and resets only for another target", () => {
    const text = {
      ...defaultConfig,
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
    await renderBothTargets();

    expect(screen.getAllByRole("button", { name: "Add score" })).toHaveLength(
      1,
    );
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
    expect(screen.getByRole("button", { name: "Add score" })).toBeDisabled();
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
    const firstClear = deferred();
    mocks.remove.mockReturnValueOnce(firstClear.promise).mockResolvedValue({});
    await renderBothTargets();
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
    expect(
      screen.queryByRole("menuitem", { name: "Remove score" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Clear score" }),
    );
    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "Score actions for Quality (Observation)",
      }),
      { key: "ArrowDown" },
    );
    const pendingRemoval = await screen.findByRole("menuitem", {
      name: "Remove score",
    });
    expect(pendingRemoval).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(pendingRemoval);
    fireEvent.keyDown(pendingRemoval, { key: "Escape" });
    expect(
      screen.getByRole("group", { name: "Quality (Observation)" }),
    ).toBeInTheDocument();
    await act(async () =>
      firstClear.reject(new Error("Could not clear score")),
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
    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "Score actions for Quality (Observation)",
      }),
      { key: "ArrowDown" },
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Remove score" }),
    );
    expect(screen.getAllByRole("group", { name: "Quality" })).toHaveLength(1);
    expect(mocks.remove).toHaveBeenCalledTimes(2);
  });

  it("keeps the latest saved status when an older edit of the same field fails", async () => {
    const older = deferred();
    const newer = deferred();
    mocks.create.mockResolvedValue({});
    mocks.update
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    renderContent();
    const row = screen.getByRole("group", { name: "Quality" });
    fireEvent.click(within(row).getByRole("radio", { name: /False/ }));
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "Score save status" }),
      ).toHaveTextContent("Saved"),
    );
    fireEvent.click(within(row).getByRole("radio", { name: /True/ }));
    fireEvent.click(within(row).getByRole("radio", { name: /False/ }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2));
    await act(async () => newer.resolve({}));
    await act(async () => older.reject(new Error("Earlier edit failed")));
    expect(
      screen.getByRole("status", { name: "Score save status" }),
    ).toHaveTextContent("Saved");
    expect(within(row).getByRole("radio", { name: /False/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it.each([false, true])(
    "rolls back a target failure and retries while another save is pending: %s",
    async (retryWhilePending) => {
      const first = deferred();
      const second = deferred();
      mocks.create
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise)
        .mockResolvedValue({});
      await renderBothTargets();
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
        if (!retryWhilePending) second.resolve({});
      });
      await waitFor(() =>
        expect(
          screen.getByRole("status", { name: "Score save status" }),
        ).toHaveTextContent(retryWhilePending ? "Saving" : "Could not save"),
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
      if (retryWhilePending) await act(async () => second.resolve({}));
      await waitFor(() =>
        expect(
          screen.getByRole("status", { name: "Score save status" }),
        ).toHaveTextContent("Saved"),
      );
    },
  );

  it("rolls back the same target after an earlier empty row is removed during its save", async () => {
    const pending = deferred();
    mocks.create.mockReturnValueOnce(pending.promise).mockResolvedValue({});
    await renderBothTargets();
    fireEvent.click(
      within(screen.getByRole("group", { name: "Quality (Trace)" })).getByRole(
        "radio",
        { name: /True/ },
      ),
    );
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "Score actions for Quality (Observation)",
      }),
      { key: "ArrowDown" },
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Remove score" }),
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
      ...defaultConfig,
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
      ...defaultConfig,
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
      ...defaultConfig,
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
      ...defaultConfig,
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

async function renderBothTargets() {
  renderContent();
  fireEvent.keyDown(
    screen.getByRole("button", { name: "Score actions for Quality" }),
    { key: "ArrowDown" },
  );
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Also score trace" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
  );
  expect(screen.getAllByRole("group", { name: /Quality/ })).toHaveLength(2);
  expect(mocks.create).not.toHaveBeenCalled();
}
