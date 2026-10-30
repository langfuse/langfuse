import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  completeMock,
  harness,
  locationAssignMock,
  reportErrorMock,
  routerReplaceMock,
  setDataMock,
  showErrorToastMock,
  statusState,
  subscribeMock,
} = vi.hoisted(() => ({
  completeMock: vi.fn(),
  harness: {
    isLangfuseCloud: false,
    query: {} as Record<string, string>,
    canCreateOrganizations: true,
    organizations: [] as { id: string }[],
  },
  locationAssignMock: vi.fn(),
  reportErrorMock: vi.fn(),
  routerReplaceMock: vi.fn(),
  setDataMock: vi.fn(),
  showErrorToastMock: vi.fn(),
  statusState: {
    query: {} as {
      data?: unknown;
      isLoading: boolean;
      isError: boolean;
      error?: unknown;
    },
  },
  subscribeMock: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    isReady: true,
    query: harness.query,
    replace: routerReplaceMock,
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        email: "user@example.com",
        canCreateOrganizations: harness.canCreateOrganizations,
        organizations: harness.organizations,
      },
    },
    update: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/src/features/organizations", () => ({
  useLangfuseCloudRegion: () => ({ isLangfuseCloud: harness.isLangfuseCloud }),
}));

vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/notifications", () => ({
  showErrorToast: (...args: unknown[]) => showErrorToastMock(...args),
}));

vi.mock("@/src/utils/reportError", () => ({
  reportError: (...args: unknown[]) => reportErrorMock(...args),
}));

vi.mock("@/src/utils/trpcErrorClassification", () => ({
  classifyTrpcToastError: () => ({}),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({ onboarding: { status: { setData: setDataMock } } }),
    onboarding: {
      status: { useQuery: () => statusState.query },
      complete: { useMutation: () => ({ mutateAsync: completeMock }) },
    },
  },
}));

vi.mock("../hooks/useNewsletterSignup", () => ({
  useNewsletterSignup: () => ({
    reachability: "reachable",
    subscribe: subscribeMock,
  }),
}));

import { ConnectedOnboardingSurvey } from "./ConnectedOnboardingSurvey";

const INSTALLER_LISTS = ["product", "oss"];
const INCOMPLETE_STATUS = {
  data: {
    completed: false,
    canConfigureAiFeatures: false,
    newsletterLists: INSTALLER_LISTS,
  },
  isLoading: false,
  isError: false,
};
const FAILED_STATUS = {
  data: undefined,
  isLoading: false,
  isError: true,
  error: new Error("status failed"),
};
const originalLocation = window.location;

beforeEach(() => {
  // The design-system Switch measures its thumb; jsdom has no ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, assign: locationAssignMock },
  });
  completeMock.mockReset();
  locationAssignMock.mockReset();
  reportErrorMock.mockReset();
  routerReplaceMock.mockReset();
  setDataMock.mockReset();
  showErrorToastMock.mockReset();
  subscribeMock.mockReset();
  statusState.query = INCOMPLETE_STATUS;
  Object.assign(harness, {
    isLangfuseCloud: false,
    query: {},
    canCreateOrganizations: true,
    organizations: [],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
});

const clickButton = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

describe("ConnectedOnboardingSurvey on self-hosted", () => {
  it("shows a neutral card while the onboarding status loads", () => {
    statusState.query = { data: undefined, isLoading: true, isError: false };

    render(<ConnectedOnboardingSurvey />);

    expect(
      screen.getByRole("heading", { name: "Getting your workspace ready" }),
    ).toBeVisible();
    expect(screen.queryByText(/langfuse\.com/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Finishing setup/)).not.toBeInTheDocument();
  });

  it("shows the neutral card while redirecting a completed status", async () => {
    statusState.query = {
      data: { completed: true, redirectTo: "/setup" },
      isLoading: false,
      isError: false,
    };

    render(<ConnectedOnboardingSurvey />);

    expect(
      screen.getByRole("heading", { name: "Getting your workspace ready" }),
    ).toBeVisible();
    expect(screen.queryByText(/Finishing setup/)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(routerReplaceMock).toHaveBeenCalledWith("/setup"),
    );
  });

  it("skips without subscribing and stores declined", async () => {
    completeMock.mockResolvedValue({
      redirectTo: "/setup",
      surveyCreated: true,
    });

    render(<ConnectedOnboardingSurvey />);
    clickButton("Skip");

    await waitFor(() =>
      expect(routerReplaceMock).toHaveBeenCalledWith("/setup"),
    );
    expect(subscribeMock).not.toHaveBeenCalled();
    expect(completeMock.mock.calls).toEqual([
      [{ newsletter: { outcome: "declined" } }],
    ]);
  });

  it("subscribes the address to the step's lists and stores subscribed", async () => {
    subscribeMock.mockResolvedValue("subscribed");
    completeMock.mockResolvedValue({
      redirectTo: "/setup",
      surveyCreated: true,
    });

    render(<ConnectedOnboardingSurvey />);
    clickButton("Subscribe");

    await waitFor(() =>
      expect(routerReplaceMock).toHaveBeenCalledWith("/setup"),
    );
    expect(subscribeMock).toHaveBeenCalledWith({
      email: "user@example.com",
      lists: INSTALLER_LISTS,
    });
    expect(completeMock.mock.calls).toEqual([
      [{ newsletter: { outcome: "subscribed" } }],
    ]);
  });

  it.each([
    { query: { targetPath: "/demo" }, canCreate: false, destination: "/demo" },
    { query: {}, canCreate: true, destination: "/setup" },
    { query: {}, canCreate: false, destination: "/" },
  ])(
    "goes to $destination without a toast when saving the outcome fails (query $query, can create orgs $canCreate)",
    async ({ query, canCreate, destination }) => {
      Object.assign(harness, { query, canCreateOrganizations: canCreate });
      completeMock.mockRejectedValue(new Error("network"));

      render(<ConnectedOnboardingSurvey />);
      clickButton("Skip");

      await waitFor(() =>
        expect(routerReplaceMock).toHaveBeenCalledWith(destination),
      );
      expect(showErrorToastMock).not.toHaveBeenCalled();
      expect(reportErrorMock).toHaveBeenCalledTimes(1);
    },
  );

  it("goes to the destination without the error card when the status fails", async () => {
    statusState.query = FAILED_STATUS;

    render(<ConnectedOnboardingSurvey />);

    await waitFor(() =>
      expect(routerReplaceMock).toHaveBeenCalledWith("/setup"),
    );
    expect(
      screen.queryByText("Failed to load onboarding"),
    ).not.toBeInTheDocument();
    expect(showErrorToastMock).not.toHaveBeenCalled();
    expect(reportErrorMock).toHaveBeenCalledWith(
      FAILED_STATUS.error,
      expect.objectContaining({ area: "onboarding" }),
    );
  });

  it("sends an invited member to / when the status fails", async () => {
    harness.organizations = [{ id: "org-invited" }];
    statusState.query = FAILED_STATUS;

    render(<ConnectedOnboardingSurvey />);

    await waitFor(() => expect(routerReplaceMock).toHaveBeenCalledWith("/"));
    expect(routerReplaceMock).toHaveBeenCalledTimes(1);
  });

  it("loads the page when the client-side redirect fails", async () => {
    completeMock.mockResolvedValue({
      redirectTo: "/setup",
      surveyCreated: true,
    });
    routerReplaceMock.mockRejectedValue(new Error("route change failed"));

    render(<ConnectedOnboardingSurvey />);
    clickButton("Skip");

    await waitFor(() =>
      expect(locationAssignMock).toHaveBeenCalledWith(
        `${originalLocation.origin}/setup`,
      ),
    );
    expect(showErrorToastMock).not.toHaveBeenCalled();
  });
});

describe("ConnectedOnboardingSurvey on Cloud", () => {
  beforeEach(() => {
    harness.isLangfuseCloud = true;
  });

  it("keeps the error card when the status fails", () => {
    statusState.query = FAILED_STATUS;

    render(<ConnectedOnboardingSurvey />);

    expect(screen.getByText("Failed to load onboarding")).toBeVisible();
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });

  it("keeps the toast and stays on the survey when saving fails", async () => {
    statusState.query = {
      data: { completed: false, canConfigureAiFeatures: false },
      isLoading: false,
      isError: false,
    };
    completeMock.mockRejectedValue(new Error("network"));

    render(<ConnectedOnboardingSurvey />);
    clickButton("Next");

    await waitFor(() =>
      expect(showErrorToastMock).toHaveBeenCalledWith(
        "Failed to finish onboarding",
        "network",
        expect.anything(),
      ),
    );
    expect(routerReplaceMock).not.toHaveBeenCalled();
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("keeps the toast when the redirect of a completed status fails", async () => {
    statusState.query = {
      data: { completed: true, redirectTo: "/project/p1/traces" },
      isLoading: false,
      isError: false,
    };
    routerReplaceMock.mockRejectedValue(new Error("route change failed"));

    render(<ConnectedOnboardingSurvey />);

    await waitFor(() =>
      expect(showErrorToastMock).toHaveBeenCalledWith(
        "Failed to continue onboarding",
        "route change failed",
        expect.anything(),
      ),
    );
    expect(locationAssignMock).not.toHaveBeenCalled();
  });
});
