import { render } from "@testing-library/react";

// Hoisted so the vi.mock factory can reference them.
const { generationsFilterOptionsUseQuery, noopQuery } = vi.hoisted(() => ({
  generationsFilterOptionsUseQuery: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isSuccess: false,
  })),
  noopQuery: () => ({
    data: undefined,
    isLoading: false,
    isSuccess: false,
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    traces: { filterOptions: { useQuery: noopQuery } },
    generations: {
      filterOptions: { useQuery: generationsFilterOptionsUseQuery },
    },
    events: { filterOptions: { useQuery: noopQuery } },
    projects: { environmentFilterOptions: { useQuery: noopQuery } },
    datasets: { allDatasetMeta: { useQuery: noopQuery } },
    dashboard: { executeQuery: { useQuery: noopQuery } },
  },
}));

// Force the v1 path, which sources the observation-name picker from generations.
vi.mock("@/src/features/events/hooks/useV4Beta", () => ({
  useV4Beta: () => ({ isBetaEnabled: false }),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: {},
    asPath: "/",
    push: vi.fn(),
    replace: vi.fn(),
    isReady: true,
  }),
}));

vi.mock("use-query-params", () => ({
  StringParam: {},
  useQueryParams: () => [{ dateRange: undefined }, vi.fn()],
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

import { WidgetForm } from "./WidgetForm";

describe("WidgetForm v1 observation-name options", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  it("v1 observations view queries observation names across ALL types", () => {
    // The six filter-option queries fire at the top of the component body; a
    // downstream child (filter builder / chart) may crash after, which is
    // irrelevant to what input the query under test received.
    try {
      render(
        <WidgetForm
          projectId="p1"
          onSave={vi.fn()}
          initialValues={{
            name: "w",
            description: "",
            view: "observations",
            measure: "count",
            aggregation: "count",
            dimension: "none",
            chartType: "LINE_TIME_SERIES",
            filters: [],
          }}
        />,
      );
    } catch {
      // Ignore downstream render failures; see comment above.
    }

    expect(generationsFilterOptionsUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ observationType: "ALL" }),
      expect.anything(),
    );
  });
});
