import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResetPasswordPage } from "./ResetPasswordPage";

const mocks = vi.hoisted(() => ({
  captureMock: vi.fn(),
  resetPasswordMock: vi.fn(),
  routerMock: {
    push: vi.fn(),
    query: {} as Record<string, unknown>,
  },
  sessionMock: {
    status: "authenticated" as const,
    data: {
      user: {
        email: "user@example.com",
        emailVerified: "2026-07-27T12:00:00.000Z",
        hasPassword: true,
      },
    },
  },
}));

vi.mock("next/router", () => ({
  useRouter: () => mocks.routerMock,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => mocks.sessionMock,
}));

vi.mock("@/src/features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({
    isLangfuseCloud: true,
    region: "EU",
  }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.captureMock,
}));

vi.mock("@/src/components/design-system/LangfuseIcon/LangfuseIcon", () => ({
  LangfuseIcon: () => <div data-testid="langfuse-icon" />,
}));

vi.mock(
  "@/src/features/auth-credentials/components/ResetPasswordButton",
  () => ({
    RequestResetPasswordEmailButton: () => (
      <button type="button">Request password reset</button>
    ),
  }),
);

vi.mock("@/src/utils/api", () => ({
  api: {
    credentials: {
      resetPassword: {
        useMutation: () => ({
          mutateAsync: mocks.resetPasswordMock,
          isPending: false,
        }),
      },
    },
  },
}));

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.routerMock.query = {};
    mocks.sessionMock.status = "authenticated";
    mocks.sessionMock.data = {
      user: {
        email: "user@example.com",
        emailVerified: new Date().toISOString(),
        hasPassword: true,
      },
    };
    mocks.resetPasswordMock.mockResolvedValue(undefined);
  });

  const submitPasswordForm = async (container: HTMLElement, label: string) => {
    const passwordInput = container.querySelector<HTMLInputElement>(
      'input[name="password"]',
    );
    const confirmPasswordInput = container.querySelector<HTMLInputElement>(
      'input[name="confirmPassword"]',
    );

    expect(passwordInput).not.toBeNull();
    expect(confirmPasswordInput).not.toBeNull();

    fireEvent.change(passwordInput!, {
      target: { value: "Password123!" },
    });
    fireEvent.change(confirmPasswordInput!, {
      target: { value: "Password123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: label }));

    await waitFor(() => {
      expect(mocks.resetPasswordMock).toHaveBeenCalledWith({
        password: "Password123!",
      });
    });

    await waitFor(
      () => {
        expect(mocks.routerMock.push).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
  };

  it("ignores targetPath for normal password resets", async () => {
    mocks.routerMock.query = { targetPath: "/demo" };

    const { container } = render(
      <ResetPasswordPage passwordResetAvailable={true} />,
    );

    await submitPasswordForm(container, "Update Password");

    expect(mocks.routerMock.push).toHaveBeenCalledWith("/");
  });

  it("preserves targetPath while setting a password after signup", async () => {
    mocks.routerMock.query = { targetPath: "/demo" };
    mocks.sessionMock.data.user.hasPassword = false;

    const { container } = render(
      <ResetPasswordPage passwordResetAvailable={true} />,
    );

    await submitPasswordForm(container, "Set password");

    expect(mocks.routerMock.push).toHaveBeenCalledWith("/demo");
  });
});
