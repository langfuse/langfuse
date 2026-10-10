import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Session } from "next-auth";
import { useSession } from "next-auth/react";
import type { ReactNode } from "react";

import {
  RelatedTracesButton,
  RelatedTracesPopoverController,
  useRelatedTracesEnabled,
} from "@/src/features/trace-correlation/components/RelatedTracesButton";
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

function RelatedTracesHarness({
  observations,
  enabled,
}: {
  observations: Array<{ startTime?: Date | string | null }>;
  enabled: boolean;
}) {
  const showRelatedTraces = useRelatedTracesEnabled(projectId, enabled);

  return showRelatedTraces ? (
    <RelatedTracesPopoverController
      projectId={projectId}
      traceId={traceId}
      timestamp={timestamp}
      observations={observations}
    >
      {({ relatedCount, Trigger }) => (
        <Trigger asChild>
          <RelatedTracesButton relatedCount={relatedCount} />
        </Trigger>
      )}
    </RelatedTracesPopoverController>
  ) : null;
}

const renderRelatedTraces = ({
  observations = [],
  enabled = true,
}: {
  observations?: Array<{ startTime?: Date | string | null }>;
  enabled?: boolean;
} = {}) =>
  render(
    <RelatedTracesHarness observations={observations} enabled={enabled} />,
  );

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

    const { container } = renderRelatedTraces();

    expect(container).toBeEmptyDOMElement();
    expect(mockUseQuery).not.toHaveBeenCalled();
  });

  it("does not render for public traces without project access", () => {
    const { container } = renderRelatedTraces({ enabled: false });

    expect(container).toBeEmptyDOMElement();
    expect(mockUseQuery).not.toHaveBeenCalled();
  });

  it("does not render without organization membership for regular users", () => {
    const session = createSession();
    session.user!.organizations = [];
    vi.mocked(useSession).mockReturnValue({
      data: session,
      status: "authenticated",
      update: vi.fn(),
    });

    const { container } = renderRelatedTraces();

    expect(container).toBeEmptyDOMElement();
    expect(mockUseQuery).not.toHaveBeenCalled();
  });

  it("allows admins without organization membership and queries only after opening", async () => {
    const session = createSession();
    session.user!.admin = true;
    session.user!.organizations = [];
    vi.mocked(useSession).mockReturnValue({
      data: session,
      status: "authenticated",
      update: vi.fn(),
    });

    renderRelatedTraces();

    expect(mockUseQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ projectId, traceId }),
      expect.objectContaining({ enabled: false }),
    );

    fireEvent.click(screen.getByTitle("Related traces"));

    await waitFor(() =>
      expect(mockUseQuery).toHaveBeenLastCalledWith(
        expect.objectContaining({ projectId, traceId }),
        expect.objectContaining({ enabled: true }),
      ),
    );
  });

  it("keeps the organization setting authoritative for admins with membership", () => {
    const session = createSession({ trackingEnabled: false });
    session.user!.admin = true;
    vi.mocked(useSession).mockReturnValue({
      data: session,
      status: "authenticated",
      update: vi.fn(),
    });

    const { container } = renderRelatedTraces();

    expect(container).toBeEmptyDOMElement();
    expect(mockUseQuery).not.toHaveBeenCalled();
  });

  it("queries lazily after opening with the observation time window", async () => {
    renderRelatedTraces({
      observations: [
        { startTime: "2026-01-01T11:30:00.000Z" },
        { startTime: new Date("2026-01-01T12:15:00.000Z") },
      ],
    });

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
