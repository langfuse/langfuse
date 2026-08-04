import { fireEvent, render, screen } from "@testing-library/react";
import { useExperimentResultsState } from "./useExperimentResultsState";

const queryParamStore = new Map<string, unknown>();

vi.mock("use-query-params", () => {
  const React = require("react");

  return {
    ArrayParam: {},
    StringParam: {},
    withDefault: (_param: unknown, defaultValue: unknown) => ({
      defaultValue,
    }),
    useQueryParams: (config: Record<string, { defaultValue: unknown }>) => {
      const initialState = Object.fromEntries(
        Object.entries(config).map(([key, value]) => [
          key,
          queryParamStore.has(key)
            ? queryParamStore.get(key)
            : value.defaultValue,
        ]),
      );

      const [state, setState] = React.useState(initialState);

      const setQueryState = React.useCallback(
        (updates: Record<string, any>) => {
          setState((previous: Record<string, any>) => {
            const next = { ...previous, ...updates };

            Object.entries(updates).forEach(([key, value]) => {
              if (value === undefined || value === null) {
                queryParamStore.delete(key);
              } else {
                queryParamStore.set(key, value);
              }
            });

            return next;
          });
        },
        [],
      );

      return [state, setQueryState] as const;
    },
  };
});

function Harness() {
  const {
    baselineId,
    hasBaseline,
    comparisonIds,
    setComparisonIds,
    maxSelectedExperiments,
    clearBaseline,
    selectedExperimentIds,
  } = useExperimentResultsState();

  return (
    <div>
      <div data-testid="baseline">{baselineId ?? "null"}</div>
      <div data-testid="has-baseline">{hasBaseline ? "true" : "false"}</div>
      <div data-testid="comparisons">{comparisonIds.join(",")}</div>
      <div data-testid="selected">{selectedExperimentIds.join(",")}</div>
      <div data-testid="max-experiments">{maxSelectedExperiments}</div>
      <button
        type="button"
        onClick={() =>
          setComparisonIds(
            Array.from({ length: 12 }, (_, index) => `comp-${index}`),
          )
        }
      >
        set twelve comparisons
      </button>
      <button type="button" onClick={clearBaseline}>
        clear
      </button>
    </div>
  );
}

describe("useExperimentResultsState", () => {
  beforeEach(() => {
    queryParamStore.clear();
  });

  it("derives hasBaseline correctly", () => {
    queryParamStore.set("baseline", "baseline-run");
    queryParamStore.set("c", ["comp-a"]);

    render(<Harness />);

    expect(screen.getByTestId("has-baseline").textContent).toBe("true");

    queryParamStore.clear();
    queryParamStore.set("c", ["comp-a"]);

    render(<Harness />);

    expect(screen.getAllByTestId("has-baseline")[1].textContent).toBe("false");
  });

  it("keeps c-only selections as comparisons without an implicit baseline", () => {
    queryParamStore.set("baseline", "baseline-run");
    queryParamStore.set("c", ["comp-a", "comp-b"]);

    render(<Harness />);

    expect(screen.getByTestId("comparisons").textContent).toBe("comp-a,comp-b");

    queryParamStore.clear();
    queryParamStore.set("c", ["comp-a", "comp-b"]);

    render(<Harness />);

    expect(screen.getAllByTestId("has-baseline")[1].textContent).toBe("false");
    expect(screen.getAllByTestId("comparisons")[1].textContent).toBe(
      "comp-a,comp-b",
    );
    expect(screen.getAllByTestId("selected")[1].textContent).toBe(
      "comp-a,comp-b",
    );
  });

  it("clears baseline by URL state only and moves it into comparisons", () => {
    queryParamStore.set("baseline", "baseline-run");
    queryParamStore.set("c", ["comp-a"]);

    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "clear" }));

    expect(screen.getByTestId("baseline").textContent).toBe("null");
    expect(screen.getByTestId("comparisons").textContent).toBe(
      "comp-a,baseline-run",
    );
    expect(screen.getByTestId("selected").textContent).toBe(
      "comp-a,baseline-run",
    );

    expect(queryParamStore.has("baseline")).toBe(false);
    expect(queryParamStore.get("c")).toEqual(["comp-a", "baseline-run"]);
  });

  it("allows up to ten selected experiments and clamps additional selections", () => {
    render(<Harness />);

    fireEvent.click(
      screen.getByRole("button", { name: "set twelve comparisons" }),
    );

    expect(screen.getByTestId("max-experiments").textContent).toBe("10");
    expect(screen.getByTestId("selected").textContent).toBe(
      Array.from({ length: 10 }, (_, index) => `comp-${index}`).join(","),
    );
    expect(screen.getByTestId("comparisons").textContent).toBe(
      Array.from({ length: 10 }, (_, index) => `comp-${index}`).join(","),
    );
  });

  it("clamps comparison IDs loaded from the URL", () => {
    queryParamStore.set(
      "c",
      Array.from({ length: 12 }, (_, index) => `comp-${index}`),
    );

    render(<Harness />);

    expect(screen.getByTestId("selected").textContent).toBe(
      Array.from({ length: 10 }, (_, index) => `comp-${index}`).join(","),
    );
    expect(screen.getByTestId("comparisons").textContent).toBe(
      Array.from({ length: 10 }, (_, index) => `comp-${index}`).join(","),
    );
  });

  it("keeps an explicit baseline outside the ten comparison slots", () => {
    queryParamStore.set("baseline", "baseline-run");
    queryParamStore.set(
      "c",
      Array.from({ length: 12 }, (_, index) => `comp-${index}`),
    );

    render(<Harness />);

    expect(screen.getByTestId("selected").textContent).toBe(
      [
        "baseline-run",
        ...Array.from({ length: 9 }, (_, index) => `comp-${index}`),
      ].join(","),
    );
    expect(screen.getByTestId("comparisons").textContent).toBe(
      Array.from({ length: 9 }, (_, index) => `comp-${index}`).join(","),
    );
  });
});
