import { act, render, screen, waitFor } from "@testing-library/react";

const {
  useSessionMock,
  useQueryProjectMock,
  useV4BetaMock,
  consumeStarterProjectInvitePromptUseMutationMock,
  hasTracingConfiguredUseQueryMock,
  showErrorToastMock,
} = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  useQueryProjectMock: vi.fn(),
  useV4BetaMock: vi.fn(),
  consumeStarterProjectInvitePromptUseMutationMock: vi.fn(),
  hasTracingConfiguredUseQueryMock: vi.fn(),
  showErrorToastMock: vi.fn(),
}));

let latestCreateProjectMemberButtonProps:
  | {
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }
  | undefined;

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: {
      projectId: "project-1",
    },
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: useSessionMock,
}));

vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProject: useQueryProjectMock,
}));

vi.mock("@/src/features/events/hooks/useV4Beta", () => ({
  useV4Beta: useV4BetaMock,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    onboarding: {
      consumeStarterProjectInvitePrompt: {
        useMutation: consumeStarterProjectInvitePromptUseMutationMock,
      },
    },
    traces: {
      hasTracingConfigured: {
        useQuery: hasTracingConfiguredUseQueryMock,
      },
    },
  },
}));

vi.mock("@/src/features/notifications/showErrorToast", () => ({
  showErrorToast: showErrorToastMock,
}));

vi.mock("@/src/features/rbac/components/CreateProjectMemberButton", () => ({
  CreateProjectMemberButton: (
    props: typeof latestCreateProjectMemberButtonProps,
  ) => {
    latestCreateProjectMemberButtonProps = props;
    return <div data-testid="starter-project-invite-dialog" />;
  },
}));

vi.mock("@/src/components/layouts/page", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/src/components/table/use-cases/traces", () => ({
  default: () => <div>traces-table</div>,
}));

vi.mock("@/src/features/events/components/EventsTable", () => ({
  default: () => <div>events-table</div>,
}));

vi.mock("@/src/components/onboarding/TracesOnboarding", () => ({
  TracesOnboarding: () => <div>traces-onboarding</div>,
}));

vi.mock("@/src/features/navigation/utils/tracing-tabs", () => ({
  getTracingTabs: () => [],
  TRACING_TABS: {
    TRACES: "traces",
  },
}));

import { buildStarterProjectMetadata } from "@/src/features/onboarding/lib/starterProjectMetadata";
import TracesPage from "@/src/pages/project/[projectId]/traces";

describe("starter project invite prompt", () => {
  const updateSessionMock = vi.fn();
  const mutateAsyncMock = vi.fn();
  const consoleErrorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);

  beforeEach(() => {
    latestCreateProjectMemberButtonProps = undefined;
    updateSessionMock.mockReset();
    mutateAsyncMock.mockReset();
    showErrorToastMock.mockReset();
    consoleErrorSpy.mockClear();

    useSessionMock.mockReturnValue({
      data: {
        user: {
          id: "user-1",
        },
      },
      update: updateSessionMock,
    });
    useQueryProjectMock.mockReturnValue({
      organization: {
        id: "org-1",
      },
      project: {
        id: "project-1",
        name: "My Project",
        hasTraces: false,
        metadata: buildStarterProjectMetadata({
          userId: "user-1",
        }),
      },
    });
    useV4BetaMock.mockReturnValue({
      isBetaEnabled: false,
      isInitializing: false,
    });
    consumeStarterProjectInvitePromptUseMutationMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
    });
    hasTracingConfiguredUseQueryMock.mockReturnValue({
      data: true,
      isLoading: false,
    });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it("closes the prompt and shows an error toast if consuming it fails", async () => {
    mutateAsyncMock.mockRejectedValueOnce(new Error("boom"));

    render(<TracesPage />);

    expect(
      screen.getByTestId("starter-project-invite-dialog"),
    ).toBeInTheDocument();
    expect(latestCreateProjectMemberButtonProps?.open).toBe(true);

    await act(async () => {
      latestCreateProjectMemberButtonProps?.onOpenChange?.(false);
    });

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        projectId: "project-1",
      });
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId("starter-project-invite-dialog"),
      ).not.toBeInTheDocument();
    });

    expect(updateSessionMock).not.toHaveBeenCalled();
    expect(showErrorToastMock).toHaveBeenCalledWith(
      "Failed to dismiss invite prompt",
      "boom",
    );
  });
});
