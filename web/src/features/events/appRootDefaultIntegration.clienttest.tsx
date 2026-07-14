import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { FilterState } from "@langfuse/shared";

import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";
import { APP_ROOT_OBSERVATION_FILTER } from "./lib/appRootDefaultPolicy";

vi.mock("use-query-params", async () => {
  const actual = await vi.importActual("use-query-params");
  return {
    ...actual,
    StringParam: {},
    useQueryParam: () => [null, () => {}] as const,
  };
});

const config: FilterConfig = {
  tableName: "observations-events",
  columnDefinitions: [
    {
      id: "isRootObservation",
      name: "Is Root Observation",
      type: "boolean",
      internal: "isRootObservation",
    },
  ],
  facets: [
    {
      type: "boolean",
      column: "isRootObservation",
      label: "Is Root Observation",
    },
  ],
};

function Harness() {
  const [blocked, setBlocked] = useState(false);
  const queryFilter = useSidebarFilterState(
    config,
    {},
    {
      stateLocation: "memory",
      defaultExplicitFilterState: blocked ? [] : [APP_ROOT_OBSERVATION_FILTER],
      onExplicitFilterStateChange: ({ origin }) =>
        setBlocked(origin !== undefined),
    },
  );

  return (
    <div>
      <pre data-testid="filters">
        {JSON.stringify(queryFilter.explicitFilterState)}
      </pre>
      <button onClick={() => queryFilter.setFilterState([])}>user clear</button>
      <button
        onClick={() => queryFilter.setFilterState([], { origin: "saved_view" })}
      >
        saved view
      </button>
    </div>
  );
}

describe("app-root default integration", () => {
  it("exposes the default as explicit state and accepts a user clear", () => {
    render(<Harness />);
    expect(screen.getByTestId("filters")).toHaveTextContent(
      JSON.stringify([APP_ROOT_OBSERVATION_FILTER]),
    );

    fireEvent.click(screen.getByText("user clear"));
    expect(screen.getByTestId("filters")).toHaveTextContent(
      JSON.stringify([] satisfies FilterState),
    );
  });

  it("lets a saved view own an empty filter state", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("saved view"));
    expect(screen.getByTestId("filters")).toHaveTextContent(
      JSON.stringify([] satisfies FilterState),
    );
  });
});
