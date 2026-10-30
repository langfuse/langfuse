import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { type ScoreAggregate } from "@langfuse/shared";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { ExperimentScoreSummary } from "./ExperimentScoreSummary";

const h = vi.hoisted(() => ({ useQuery: vi.fn() }));

vi.mock("@/src/utils/api", () => ({
  api: { experiments: { metrics: { useQuery: h.useQuery } } },
}));
vi.mock("@/src/features/experiments/hooks/useExperimentNames", () => ({
  useExperimentNames: () => ({
    experimentNames: [
      { experimentId: "baseline", experimentName: "Reference" },
      { experimentId: "candidate", experimentName: "Candidate" },
      { experimentId: "other", experimentName: "Other" },
    ],
  }),
}));

function numeric(value: number) {
  return { type: "NUMERIC" as const, values: [value], average: value };
}

function metric(id: string, experimentScores: ScoreAggregate) {
  return {
    id,
    experimentScores,
    // Item grades must not be mistaken for whole-experiment metrics.
    observationItemScores: { "correct-API-NUMERIC": numeric(1) },
    traceItemScores: {},
    totalCost: null,
    latencyAvg: null,
  };
}

function mockMetrics(data: ReturnType<typeof metric>[]) {
  h.useQuery.mockReturnValue({ data, isPending: false, isError: false });
}

function renderSummary(
  experimentIds = ["baseline", "candidate"],
  baselineId: string | undefined = "baseline",
) {
  return render(
    <ExperimentScoreSummary
      projectId="project"
      experimentIds={experimentIds}
      baselineId={baselineId}
    />,
    { wrapper: LayerProvider },
  );
}

function cells(label: string) {
  const row = screen.getByRole("row", { name: new RegExp(label) });
  return within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent);
}

function openDisplayMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Display" }));
}

function chooseDisplay(option: "Collapsed" | "Compact" | "Regular") {
  openDisplayMenu();
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: option }));
}

describe("ExperimentScoreSummary", () => {
  beforeAll(() => {
    vi.stubGlobal("PointerEvent", MouseEvent);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });
  afterAll(() => vi.unstubAllGlobals());
  beforeEach(() => {
    localStorage.setItem(
      "experiment-run-scores-display",
      JSON.stringify("regular"),
    );
    h.useQuery.mockReset();
    mockMetrics([
      metric("baseline", { "recall-API-NUMERIC": numeric(0.5) }),
      metric("candidate", { "recall-API-NUMERIC": numeric(0.75) }),
    ]);
  });
  afterEach(cleanup);

  it("shows run scores and comparison-minus-baseline deltas, not item grades", () => {
    renderSummary();

    expect(
      screen.getByRole("table", { name: "Experiment-level scores" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Baseline: Reference" }),
    ).toBeInTheDocument();
    expect(cells("recall")).toEqual(["recall (api)", "0.5", "0.75", "+0.25"]);
    expect(screen.queryByText(/correct/)).not.toBeInTheDocument();
    expect(h.useQuery).toHaveBeenCalledWith(
      {
        projectId: "project",
        experimentIds: ["baseline", "candidate"],
        filter: null,
      },
      { enabled: true },
    );
  });

  it("keeps missing scores distinct from zero and compares each run to the baseline", () => {
    mockMetrics([
      metric("baseline", { "recall-API-NUMERIC": numeric(0) }),
      metric("candidate", { "recall-API-NUMERIC": numeric(0) }),
      metric("other", { "precision-API-NUMERIC": numeric(1) }),
    ]);
    renderSummary(["baseline", "candidate", "other"]);

    expect(cells("recall")).toEqual(["recall (api)", "0", "0", "0", "—", "—"]);
    expect(cells("precision")).toEqual([
      "precision (api)",
      "—",
      "—",
      "—",
      "1",
      "—",
    ]);
  });

  it("does not combine equal score names from different sources or categorical scores", () => {
    mockMetrics([
      metric("baseline", {
        "recall-API-NUMERIC": numeric(0.5),
        "recall-EVAL-NUMERIC": numeric(0.75),
        "verdict-API-CATEGORICAL": {
          type: "CATEGORICAL",
          values: ["good"],
          valueCounts: [{ value: "good", count: 1 }],
        },
      }),
      metric("candidate", { "recall-EVAL-NUMERIC": numeric(0.5) }),
    ]);
    renderSummary();

    expect(cells("recall \\(api\\)")).toEqual([
      "recall (api)",
      "0.5",
      "—",
      "—",
    ]);
    expect(cells("recall \\(eval\\)")).toEqual([
      "recall (eval)",
      "0.75",
      "0.5",
      "-0.25",
    ]);
    expect(screen.queryByText(/verdict/)).not.toBeInTheDocument();
  });

  it("shows values without inventing a baseline when none is selected", () => {
    render(
      <ExperimentScoreSummary
        projectId="project"
        experimentIds={["candidate", "baseline"]}
      />,
      { wrapper: LayerProvider },
    );
    expect(cells("recall")).toEqual(["recall (api)", "0.75", "0.5"]);
    expect(
      screen.queryByRole("columnheader", { name: /Δ/ }),
    ).not.toBeInTheDocument();
  });

  it("preserves small values and deltas instead of rounding them to zero", () => {
    mockMetrics([
      metric("baseline", { "fpr-API-NUMERIC": numeric(0) }),
      metric("candidate", { "fpr-API-NUMERIC": numeric(0.00001) }),
    ]);
    renderSummary();
    expect(cells("fpr")).toEqual(["fpr (api)", "0", "0.00001", "+0.00001"]);
  });

  it("uses the selected baseline when the selection changes and ignores unselected scores", () => {
    mockMetrics([
      metric("baseline", { "recall-API-NUMERIC": numeric(0.5) }),
      metric("candidate", { "recall-API-NUMERIC": numeric(0.75) }),
      metric("unselected", { "unrelated-API-NUMERIC": numeric(1) }),
    ]);
    const { rerender } = renderSummary();
    rerender(
      <ExperimentScoreSummary
        projectId="project"
        experimentIds={["candidate", "baseline"]}
        baselineId="candidate"
      />,
    );
    expect(cells("recall")).toEqual(["recall (api)", "0.75", "0.5", "-0.25"]);
    expect(screen.queryByText(/unrelated/)).not.toBeInTheDocument();
  });

  it("distinguishes loading, failure, and a completed run without numeric scores", () => {
    h.useQuery.mockReturnValue({ isPending: true, isError: false });
    const { rerender } = renderSummary();
    expect(screen.queryByText(/No numeric/)).not.toBeInTheDocument();

    h.useQuery.mockReturnValue({
      isPending: false,
      isError: true,
      error: { message: "Scores unavailable" },
    });
    rerender(
      <ExperimentScoreSummary
        projectId="project"
        experimentIds={["baseline"]}
        baselineId="baseline"
      />,
    );
    expect(screen.getByText("Scores unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/No numeric/)).not.toBeInTheDocument();

    mockMetrics([metric("baseline", {})]);
    rerender(
      <ExperimentScoreSummary
        projectId="project"
        experimentIds={["baseline"]}
        baselineId="baseline"
      />,
    );
    expect(
      screen.getByText("No numeric experiment-level scores recorded."),
    ).toBeInTheDocument();
  });

  it("does not label a single run as a baseline or explain nonexistent deltas", () => {
    renderSummary(["baseline"]);
    expect(
      screen.getByRole("columnheader", { name: "Reference" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: /Baseline|Δ/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Deltas are/)).not.toBeInTheDocument();
    expect(cells("recall")).toEqual(["recall (api)", "0.5"]);
  });

  it("starts collapsed without fetching scores, then expands on demand", () => {
    localStorage.removeItem("experiment-run-scores-display");
    renderSummary();
    const toggle = screen.getByRole("button", { name: "Run-level scores" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(h.useQuery).toHaveBeenLastCalledWith(
      {
        projectId: "project",
        experimentIds: ["baseline", "candidate"],
        filter: null,
      },
      { enabled: false },
    );
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText(/Deltas are/)).not.toBeInTheDocument();
    expect(cells("recall")).toEqual(["recall (api)", "0.5", "0.75", "+0.25"]);
    expect(
      JSON.parse(
        localStorage.getItem("experiment-run-scores-display") ?? "null",
      ),
    ).toBe("compact");
  });

  it("uses its own Display menu and remembers the choice", () => {
    renderSummary();
    expect(screen.getByText(/Deltas are/)).toBeInTheDocument();
    openDisplayMenu();
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Regular" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Compact" }),
    ).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Compact" }));
    expect(
      screen.queryByRole("menuitemcheckbox", { name: "Compact" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Deltas are/)).not.toBeInTheDocument();
    expect(cells("recall")).toEqual(["recall (api)", "0.5", "0.75", "+0.25"]);
    cleanup();
    renderSummary();
    expect(screen.queryByText(/Deltas are/)).not.toBeInTheDocument();
    chooseDisplay("Collapsed");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    chooseDisplay("Regular");
    expect(screen.getByText(/Deltas are/)).toBeInTheDocument();
  });

  it("does not fetch metrics without a selection", () => {
    renderSummary([]);
    expect(h.useQuery).toHaveBeenCalledWith(
      { projectId: "project", experimentIds: [], filter: null },
      { enabled: false },
    );
  });
});
