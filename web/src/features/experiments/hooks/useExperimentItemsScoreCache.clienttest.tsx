import {
  act,
  render,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
import {
  ScoreCacheProvider,
  useScoreCache,
  type CachedScore,
} from "@/src/features/scores/contexts/ScoreCacheContext";
import { ExperimentGridSummaryValues } from "../components/table/ExperimentGridSummary";
import {
  type ExperimentItemsTableRow,
  type ExperimentItemData,
} from "../components/table/types";
import { useExperimentItemsScoreCache } from "./useExperimentItemsScoreCache";

const rows: ExperimentItemsTableRow[] = ["first", "second"].map((itemId) => ({
  itemId,
  experiments: ["baseline", "comparison"].map((experimentId) => ({
    experimentId,
    traceId: `${itemId}-${experimentId}-trace`,
    observationId: `${itemId}-${experimentId}-observation`,
    startTime: new Date("2026-09-01"),
    level: "DEFAULT",
    observationScores: {},
    traceScores: {},
  })),
}));
const scoreColumns = { observationScoreColumns: [], traceScoreColumns: [] };
const score: CachedScore = {
  id: "annotation-id",
  projectId: "project-id",
  environment: "default",
  name: "review",
  source: "ANNOTATION",
  dataType: "NUMERIC",
  configId: "config-id",
  value: 0.42,
  stringValue: null,
  comment: null,
  traceId: "first-comparison-trace",
  observationId: "first-comparison-observation",
  sessionId: null,
  timestamp: new Date("2026-09-01"),
};

let cache: ReturnType<typeof useScoreCache>;
let data: ReturnType<typeof useExperimentItemsScoreCache>;
function TableScores() {
  cache = useScoreCache();
  data = useExperimentItemsScoreCache(rows, scoreColumns);
  return (
    <>
      {["baseline", "comparison"].map((experimentId) => (
        <div key={experimentId} data-testid={experimentId}>
          <ExperimentGridSummaryValues
            rows={data.rows ?? []}
            experimentId={experimentId}
            baselineExperimentId="baseline"
            observationScoreOrder={data.scoreColumns.observationScoreColumns.map(
              ({ name, source, dataType }) => `${name}-${source}-${dataType}`,
            )}
            traceScoreOrder={data.scoreColumns.traceScoreColumns.map(
              ({ name, source, dataType }) => `${name}-${source}-${dataType}`,
            )}
            columnVisibility={{}}
            showScoreLevelLabels
            expanded
            showScoreNames
            isLoading={false}
            onToggle={() => {}}
          />
        </div>
      ))}
    </>
  );
}

it("shares a new score column across the table and updates summaries from cached writes", () => {
  render(
    <ScoreCacheProvider>
      <TableScores />
    </ScoreCacheProvider>,
  );
  act(() => {
    cache.set(score.id, score);
    cache.setColumn(score);
  });
  expect(data.scoreColumns.observationScoreColumns).toEqual([
    { name: "review", source: "ANNOTATION", dataType: "NUMERIC" },
  ]);
  expect(data.scoreColumns.traceScoreColumns).toEqual([]);
  expect(
    within(screen.getByTestId("baseline")).getByLabelText(
      "Observation: review: not scored",
    ),
  ).toBeInTheDocument();
  expect(
    within(screen.getByTestId("comparison")).getByLabelText(
      "Observation: review: 0.42",
    ),
  ).toBeInTheDocument();
  expect(
    data.rows?.[1].experiments.every(
      (exp) => Object.keys(exp.observationScores).length === 0,
    ),
  ).toBe(true);
  act(() => cache.set(score.id, { ...score, value: 0.63 }));
  expect(
    within(screen.getByTestId("comparison")).getByLabelText(
      "Observation: review: 0.63",
    ),
  ).toBeInTheDocument();
  act(() => cache.delete(score.id));
  expect(
    screen.queryByLabelText("Observation: review: 0.63"),
  ).not.toBeInTheDocument();
});

it("keeps levels and targets separate while recomputing comparison summaries", () => {
  render(
    <ScoreCacheProvider>
      <TableScores />
    </ScoreCacheProvider>,
  );
  act(() => {
    cache.setColumn(score);
    cache.set(score.id, score);
    cache.set("baseline", {
      ...score,
      id: "baseline",
      traceId: "first-baseline-trace",
      observationId: "first-baseline-observation",
      value: 0.21,
    });
    cache.set("trace", {
      ...score,
      id: "trace",
      observationId: null,
      value: 0.91,
    });
    cache.set("text", {
      ...score,
      id: "text",
      name: "note",
      dataType: "TEXT",
      stringValue: "review note",
    });
    cache.set("unrelated", {
      ...score,
      id: "unrelated",
      name: "unrelated",
      observationId: "other-observation",
      value: 0.99,
    });
  });
  expect(data.scoreColumns.traceScoreColumns).toEqual([
    { name: "review", source: "ANNOTATION", dataType: "NUMERIC" },
  ]);
  expect(data.scoreColumns.observationScoreColumns).toHaveLength(1);
  expect(
    Object.keys(data.rows?.[0].experiments[1].observationScores ?? {}),
  ).toEqual(["review-ANNOTATION-NUMERIC"]);
  expect(
    within(screen.getByTestId("comparison")).getByLabelText(
      "Observation: review: 0.42",
    ),
  ).toBeInTheDocument();
  expect(
    within(screen.getByTestId("comparison")).getByLabelText(
      "Trace: review: 0.91",
    ),
  ).toBeInTheDocument();
  expect(
    within(screen.getByTestId("comparison")).getByText("+0.21"),
  ).toBeInTheDocument();
  act(() =>
    cache.set("baseline", {
      ...score,
      id: "baseline",
      traceId: "first-baseline-trace",
      observationId: "first-baseline-observation",
      value: 0.12,
    }),
  );
  expect(
    within(screen.getByTestId("comparison")).getByText("+0.30"),
  ).toBeInTheDocument();
});

it("overlays and deletes a persisted score while keeping its server column definition", () => {
  const key = "review-ANNOTATION-NUMERIC";
  const serverRows = rows.map((row) => ({
    ...row,
    experiments: row.experiments.map<ExperimentItemData>((experiment) => ({
      ...experiment,
      observationScores:
        experiment.observationId === score.observationId
          ? {
              [key]: {
                type: "NUMERIC" as const,
                average: 0.1,
                values: [0.1],
                id: score.id,
              },
            }
          : experiment.observationScores,
    })),
  }));
  const serverColumns = {
    observationScoreColumns: [
      { name: "review", source: "ANNOTATION", dataType: "NUMERIC" as const },
    ],
    traceScoreColumns: [],
  };
  const { result } = renderHook(
    () => ({
      data: useExperimentItemsScoreCache(serverRows, serverColumns),
      cache: useScoreCache(),
    }),
    { wrapper: ScoreCacheProvider },
  );
  act(() => result.current.cache.set(score.id, score));
  expect(
    result.current.data.rows?.[0].experiments[1].observationScores[key],
  ).toMatchObject({ average: 0.42 });
  act(() => result.current.cache.delete(score.id));
  expect(
    result.current.data.rows?.[0].experiments[1].observationScores[key],
  ).toBeUndefined();
  expect(result.current.data.scoreColumns).toEqual(serverColumns);
});
