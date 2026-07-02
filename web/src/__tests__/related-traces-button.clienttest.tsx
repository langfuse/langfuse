import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Session } from "next-auth";
import { useSession } from "next-auth/react";
import type { ReactNode } from "react";

import { RelatedTracesButton } from "@/src/features/trace-correlation/components/RelatedTracesButton";
import { api } from "@/src/utils/api";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    traces: {
      relatedAcrossProjects: {
        useQuery: vi.fn(),
      },
    },
  },
}));

const projectId = "project-source";
const traceId = "trace-source";
const timestamp = new Date("2026-01-01T12:00:00.000Z");

const createSession = ({
  trackingEnabled = true,
}: {
  trackingEnabled?: boolean;
} = {}): Session =>
  ({
    expires: "2026-01-01T00:00:00.000Z",
    user: {
      id: "user-1",
      canCreateOrganizations: true,
      admin: false,
      organizations: [
        {
          id: "org-1",
          name: "Org",
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: true,
          crossProjectTraceTrackingEnabled: trackingEnabled,
          crossProjectTraceCorrelationKey: "workflowId",
          projects: [
            {
              id: projectId,
              name: "Source Project",
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              hasTraces: true,
              metadata: {},
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
      },
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: null,
    },
  }) as Session;

const mockUseQuery = vi.mocked(api.traces.relatedAcrossProjects.useQuery);

describe("RelatedTracesButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSession).mockReturnValue({
      data: createSession(),
      status: "authenticated",
      update: vi.fn(),
    });
    mockUseQuery.mockReturnValue({
      data: {
        enabled: true,
        related: [],
        truncated: false,
        correlationKey: "workflowId",
        correlationStatus: "matched",
      },
      isLoading: false,
    } as ReturnType<typeof mockUseQuery>);
  });

  it("does not render when the organization setting is disabled", () => {
    vi.mocked(useSession).mockReturnValue({
      data: createSession({ trackingEnabled: false }),
      status: "authenticated",
      update: vi.fn(),
    });

    const { container } = render(
      <RelatedTracesButton
        projectId={projectId}
        traceId={traceId}
        timestamp={timestamp}
        observations={[]}
        enabled
      />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ projectId, traceId }),
      expect.objectContaining({ enabled: false }),
    );
  });

  it("queries lazily after opening with the observation time window", async () => {
    render(
      <RelatedTracesButton
        projectId={projectId}
        traceId={traceId}
        timestamp={timestamp}
        observations={[
          { startTime: "2026-01-01T11:30:00.000Z" },
          { startTime: new Date("2026-01-01T12:15:00.000Z") },
        ]}
        enabled
      />,
    );

    expect(mockUseQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        projectId,
        traceId,
        minStartTime: new Date("2026-01-01T11:30:00.000Z"),
        maxStartTime: new Date("2026-01-01T12:15:00.000Z"),
      }),
      expect.objectContaining({ enabled: false }),
    );

    fireEvent.click(screen.getByTitle("Related traces"));

    await waitFor(() =>
      expect(mockUseQuery).toHaveBeenLastCalledWith(
        expect.objectContaining({
          projectId,
          traceId,
          minStartTime: new Date("2026-01-01T11:30:00.000Z"),
          maxStartTime: new Date("2026-01-01T12:15:00.000Z"),
        }),
        expect.objectContaining({ enabled: true }),
      ),
    );
    expect(screen.getByText("No related traces found.")).toBeInTheDocument();
    expect(screen.getByText("metadata.workflowId")).toBeInTheDocument();
  });
});
