import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import {
  useAppRootDefault,
  useApplyAppRootFallback,
} from "./hooks/useAppRootDefault";
import { APP_ROOT_OBSERVATION_FILTER } from "./lib/appRootDefaultPolicy";
import TracesPage from "@/src/pages/project/[projectId]/traces";

const mocks = vi.hoisted(() => ({
  projectId: "project-a",
  mountCount: 0,
  resetSdkQuery: vi.fn(async () => undefined),
  sdkInfo: { isOtel: true, name: "javascript", version: "5.4.0" },
}));

const storageValues = new Map<string, string>();
const localStorageMock: Storage = {
  clear: () => storageValues.clear(),
  getItem: (key) => storageValues.get(key) ?? null,
  key: (index) => [...storageValues.keys()][index] ?? null,
  removeItem: (key) => storageValues.delete(key),
  setItem: (key, value) => storageValues.set(key, value),
  get length() {
    return storageValues.size;
  },
};

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: localStorageMock,
});

vi.mock("next/router", () => ({
  useRouter: () => ({
    isReady: true,
    query: { projectId: mocks.projectId },
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "user-a" } } }),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      events: { getSdkVersionInfo: { reset: mocks.resetSdkQuery } },
    }),
    events: {
      getSdkVersionInfo: { useQuery: () => ({ data: mocks.sdkInfo }) },
    },
    TableViewPresets: {
      getDefault: {
        useQuery: () => ({ data: undefined, isLoading: false }),
      },
    },
    traces: {
      hasTracingConfigured: {
        useQuery: () => ({ data: true, isLoading: false }),
      },
    },
  },
}));

vi.mock("@/src/features/events/components/EventsTable", async () => {
  const React = await import("react");
  function MockEventsTable({ projectId }: { projectId: string }) {
    const [mountId] = React.useState(() => ++mocks.mountCount);
    return <div>{`${projectId}:${mountId}`}</div>;
  }

  return {
    default: MockEventsTable,
  };
});
vi.mock("@/src/components/layouts/page", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/src/components/table/use-cases/traces", () => ({
  default: () => null,
}));
vi.mock("@/src/components/onboarding/TracesOnboarding", () => ({
  TracesOnboarding: () => null,
}));
vi.mock("@/src/features/navigation/utils/tracing-tabs", () => ({
  getTracingTabs: () => [],
  TRACING_TABS: { TRACES: "traces" },
}));
vi.mock("@/src/features/events/hooks/useV4Beta", () => ({
  useV4Beta: () => ({ isBetaEnabled: true, isInitializing: false }),
}));
vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProject: () => ({ project: { hasTraces: true } }),
}));

function CapabilityHarness() {
  const appRootDefault = useAppRootDefault({
    enabled: true,
    projectId: "project-a",
  });

  return (
    <button onClick={appRootDefault.removeCapabilityCache}>
      clear capability
    </button>
  );
}

function ProjectPolicyHarness({ projectId }: { projectId: string }) {
  const appRootDefault = useAppRootDefault({
    enabled: true,
    projectId,
  });

  return (
    <>
      <div data-testid="default-filters">
        {JSON.stringify(appRootDefault.defaultExplicitFilterState)}
      </div>
      <button
        onClick={() =>
          appRootDefault.onExplicitFilterStateChange({
            previousFilters: [APP_ROOT_OBSERVATION_FILTER],
            nextFilters: [],
            origin: "user",
          })
        }
      >
        edit filters
      </button>
    </>
  );
}

describe("app-root default lifecycle", () => {
  beforeEach(() => {
    mocks.projectId = "project-a";
    mocks.mountCount = 0;
    mocks.resetSdkQuery.mockClear();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("clears both persistent and query SDK capability caches", () => {
    window.localStorage.setItem(
      "events-app-root-capability:v1:project-a",
      "supported",
    );
    render(<CapabilityHarness />);

    fireEvent.click(screen.getByRole("button", { name: "clear capability" }));

    expect(
      window.localStorage.getItem("events-app-root-capability:v1:project-a"),
    ).toBeNull();
    expect(mocks.resetSdkQuery).toHaveBeenCalledWith({
      projectId: "project-a",
    });
  });

  it("keeps the table mounted when the project changes", () => {
    const view = render(<TracesPage />);
    expect(screen.getByText("project-a:1")).toBeInTheDocument();

    mocks.projectId = "project-b";
    view.rerender(<TracesPage />);

    expect(screen.getByText("project-b:1")).toBeInTheDocument();
  });

  it("resets policy ownership when the project changes", () => {
    const view = render(<ProjectPolicyHarness projectId="project-a" />);
    expect(screen.getByTestId("default-filters")).toHaveTextContent(
      JSON.stringify([APP_ROOT_OBSERVATION_FILTER]),
    );

    fireEvent.click(screen.getByRole("button", { name: "edit filters" }));
    expect(screen.getByTestId("default-filters")).toHaveTextContent("[]");

    mocks.projectId = "project-b";
    view.rerender(<ProjectPolicyHarness projectId="project-b" />);
    expect(screen.getByTestId("default-filters")).toHaveTextContent(
      JSON.stringify([APP_ROOT_OBSERVATION_FILTER]),
    );
  });

  it('treats the persisted "null" saved-view sentinel as no saved view', () => {
    window.sessionStorage.setItem(
      "observations-events-project-a-viewId",
      "null",
    );

    render(<ProjectPolicyHarness projectId="project-a" />);

    expect(screen.getByTestId("default-filters")).toHaveTextContent(
      JSON.stringify([APP_ROOT_OBSERVATION_FILTER]),
    );
  });

  it("executes the fallback policy outside the table component", () => {
    const setFilterState = vi.fn();
    const removeCapabilityCache = vi.fn();

    renderHook(() =>
      useApplyAppRootFallback({
        additionalRowsFound: true,
        isAutoManaged: true,
        filters: [APP_ROOT_OBSERVATION_FILTER],
        dateRange: {
          from: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
        setFilterState,
        removeCapabilityCache,
      }),
    );

    expect(setFilterState).toHaveBeenCalledWith([], {
      updateType: "replaceIn",
      origin: "system",
    });
    expect(removeCapabilityCache).toHaveBeenCalledOnce();
  });
});
