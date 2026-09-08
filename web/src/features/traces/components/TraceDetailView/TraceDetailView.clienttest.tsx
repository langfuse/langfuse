import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TraceDetailView } from "./TraceDetailView";

vi.mock("@/src/features/traces/contexts/SelectionContext", () => ({
  useSelection: () => ({ selectedTab: "preview", setSelectedTab: vi.fn() }),
}));
vi.mock("@/src/features/traces/contexts/TraceDataContext", () => ({
  useTraceData: () => ({
    comments: new Map([["trace-trace-1", 3]]),
    isSessionScope: false,
  }),
}));
vi.mock("@/src/features/traces/contexts/ViewPreferencesContext", () => ({
  useViewPreferences: () => ({
    jsonViewPreference: "pretty",
    setJsonViewPreference: vi.fn(),
    jsonBetaEnabled: false,
    setJsonBetaEnabled: vi.fn(),
    isPeekMode: false,
    isAnnotationMode: false,
  }),
}));
vi.mock("@/src/features/traces/contexts/JsonExpansionContext", () => ({
  useJsonExpansion: () => ({
    formattedExpansion: {},
    setFormattedFieldExpansion: vi.fn(),
    jsonExpansion: {},
    setJsonFieldExpansion: vi.fn(),
    advancedJsonExpansion: {},
    setAdvancedJsonExpansion: vi.fn(),
  }),
}));
vi.mock("@/src/features/traces/hooks/useMedia", () => ({
  useMedia: () => ({ data: [] }),
}));
vi.mock("@/src/hooks/useParsedTrace", () => ({
  useParsedTrace: () => ({
    parsedInput: null,
    parsedOutput: null,
    parsedMetadata: null,
    isParsing: false,
  }),
}));
vi.mock("@/src/features/auth/hooks", () => ({
  useIsAuthenticatedAndProjectMember: () => true,
}));
vi.mock("@/src/features/rbac", () => ({
  useHasProjectAccess: () => true,
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated" }),
}));
vi.mock("@/src/features/feature-flags/hooks/useIsFeatureEnabled", () => ({
  default: () => false,
}));
vi.mock("@/src/features/comments/hooks/useCommentedPaths", () => ({
  useCommentedPaths: () => ({}),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      traces: { byIdWithObservationsAndScores: { invalidate: vi.fn() } },
      events: { scoresForTrace: { invalidate: vi.fn() } },
    }),
    comments: {
      getByObjectId: { useQuery: () => ({ data: [] }) },
    },
  },
}));
vi.mock("./components/TraceDetailViewHeader", () => ({
  TraceDetailViewHeader: ({ commentCount }: { commentCount?: number }) => (
    <div data-testid="trace-comment-count">{commentCount ?? 0}</div>
  ),
}));
vi.mock("@/src/features/traces/components/IOPreview/IOPreview", () => ({
  IOPreview: () => null,
}));
vi.mock("../TraceLogView/TraceLogView", () => ({ TraceLogView: () => null }));
vi.mock("@/src/components/table/use-cases/scores", () => ({
  default: () => null,
}));

describe("TraceDetailView", () => {
  it("passes the trace-node comment count to the header", () => {
    render(
      <TraceDetailView
        trace={
          {
            id: "trace-1",
            projectId: "project-1",
            timestamp: new Date("2026-01-01T00:00:00.000Z"),
            input: null,
            output: null,
            metadata: "{}",
            tags: [],
            environment: "default",
          } as never
        }
        observations={[]}
        scores={[]}
        corrections={[]}
        projectId="project-1"
      />,
    );

    expect(screen.getByTestId("trace-comment-count")).toHaveTextContent("3");
  });
});
