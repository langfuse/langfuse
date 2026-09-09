import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mutateAsyncMock,
  signOutCleanlyMock,
  redirectToSignInMock,
  showSuccessToastMock,
  showErrorToastMock,
  reportNonTrpcErrorMock,
} = vi.hoisted(() => ({
  mutateAsyncMock: vi.fn(),
  signOutCleanlyMock: vi.fn(),
  redirectToSignInMock: vi.fn(),
  showSuccessToastMock: vi.fn(),
  showErrorToastMock: vi.fn(),
  reportNonTrpcErrorMock: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: "authenticated",
    data: {
      user: {
        email: "user@example.com",
        name: "Test User",
        hasPassword: true,
      },
    },
  }),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: {},
    push: vi.fn(),
  }),
}));

vi.mock("@/src/components/layouts/container-page", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/src/components/PagedSettingsContainer", () => ({
  PagedSettingsContainer: ({
    pages,
  }: {
    pages: { content?: React.ReactNode }[];
  }) => <>{pages[0]?.content}</>,
}));

vi.mock("@/src/features/auth/lib/signOut", () => ({
  redirectToSignIn: redirectToSignInMock,
  signOutCleanly: signOutCleanlyMock,
}));

vi.mock("@/src/features/notifications/showSuccessToast", () => ({
  showSuccessToast: showSuccessToastMock,
}));

vi.mock("@/src/features/notifications/showErrorToast", () => ({
  showErrorToast: showErrorToastMock,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({ invalidate: vi.fn() }),
    userAccount: {
      updateDisplayName: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      checkCanDelete: {
        useQuery: () => ({
          data: { canDelete: false, blockingOrganizations: [] },
        }),
      },
      delete: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isPending: false,
        }),
      },
      signOutAllSessions: {
        useMutation: () => ({
          mutateAsync: mutateAsyncMock,
          isPending: false,
        }),
      },
    },
  },
  reportNonTrpcError: reportNonTrpcErrorMock,
}));

vi.mock("@/src/features/v4-migration/useV4UpgradeUiEnabled", () => ({
  useV4UpgradeUiFlag: () => false,
}));

import AccountSettingsPage from "@/src/pages/account/settings/index";

describe("SignOutAllSessionsButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps durable revocation success when local sign-out fails", async () => {
    mutateAsyncMock.mockResolvedValue({ success: true });
    signOutCleanlyMock.mockRejectedValue(
      new Error("Network error during signOut"),
    );

    render(<AccountSettingsPage />);

    const buttons = screen.getAllByRole("button", {
      name: "Sign Out of All Sessions",
    });
    fireEvent.click(buttons[0]!);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Sign Out of All Sessions" })[1] ??
        screen.getByRole("button", { name: "Sign Out of All Sessions" }),
    );

    await waitFor(() => {
      expect(showSuccessToastMock).toHaveBeenCalledWith({
        title: "Signed Out of All Sessions",
        description: "All sessions have been invalidated.",
      });
    });
    expect(showErrorToastMock).not.toHaveBeenCalledWith(
      "Failed to Sign Out of All Sessions",
      expect.anything(),
    );
    expect(redirectToSignInMock).toHaveBeenCalledOnce();
  });

  it("reports mutation failure without attempting local sign-out", async () => {
    mutateAsyncMock.mockRejectedValue(new Error("UNAUTHORIZED"));

    render(<AccountSettingsPage />);

    const buttons = screen.getAllByRole("button", {
      name: "Sign Out of All Sessions",
    });
    fireEvent.click(buttons[0]!);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Sign Out of All Sessions" })[1] ??
        screen.getByRole("button", { name: "Sign Out of All Sessions" }),
    );

    await waitFor(() => {
      expect(showErrorToastMock).toHaveBeenCalledWith(
        "Failed to Sign Out of All Sessions",
        "UNAUTHORIZED",
      );
    });
    expect(signOutCleanlyMock).not.toHaveBeenCalled();
    expect(showSuccessToastMock).not.toHaveBeenCalled();
  });
});
