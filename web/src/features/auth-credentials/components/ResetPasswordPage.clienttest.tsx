import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mutateAsyncMock, signInMock, routerPushMock, useSessionMock } =
  vi.hoisted(() => ({
    mutateAsyncMock: vi.fn(),
    signInMock: vi.fn(),
    routerPushMock: vi.fn(),
    useSessionMock: vi.fn(),
  }));

vi.mock("next-auth/react", () => ({
  signIn: signInMock,
  useSession: () => useSessionMock(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    push: routerPushMock,
    query: {},
  }),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    credentials: {
      resetPassword: {
        useMutation: () => ({
          mutateAsync: mutateAsyncMock,
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({
    isLangfuseCloud: false,
    region: undefined,
  }),
}));

vi.mock(
  "@/src/features/auth-credentials/components/ResetPasswordButton",
  () => ({
    RequestResetPasswordEmailButton: ({
      onEmailSent,
      label = "Send email",
    }: {
      onEmailSent?: () => void;
      label?: string;
    }) => (
      <button type="button" onClick={() => onEmailSent?.()}>
        {label}
      </button>
    ),
  }),
);

import { ResetPasswordPage } from "@/src/features/auth-credentials/components/ResetPasswordPage";

describe("ResetPasswordPage re-authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsyncMock.mockResolvedValue({ success: true });
    signInMock.mockResolvedValue({ ok: true });
  });

  it("re-authenticates after password update while already signed in", async () => {
    useSessionMock.mockReturnValue({
      status: "authenticated",
      data: {
        user: {
          email: "user@example.com",
          hasPassword: true,
        },
      },
    });

    render(
      <ResetPasswordPage
        passwordResetAvailable
        initialEmail="user@example.com"
        intent="reset"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send email" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Verification code")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("Verification code"), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByLabelText("New Password"), {
      target: { value: "Newpass1!" },
    });
    fireEvent.change(screen.getByLabelText("Confirm New Password"), {
      target: { value: "Newpass1!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update Password" }));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        email: "user@example.com",
        token: "123456",
        password: "Newpass1!",
      });
    });
    expect(signInMock).toHaveBeenCalledWith("credentials", {
      email: "user@example.com",
      password: "Newpass1!",
      redirect: false,
    });
  });

  it("re-authenticates after password setup while already signed in", async () => {
    useSessionMock.mockReturnValue({
      status: "authenticated",
      data: {
        user: {
          email: "oauth@example.com",
          hasPassword: false,
        },
      },
    });

    render(
      <ResetPasswordPage
        passwordResetAvailable
        initialEmail="oauth@example.com"
        intent="setup"
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Verification code")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("Verification code"), {
      target: { value: "654321" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Newpass1!" },
    });
    fireEvent.change(screen.getByLabelText("Confirm Password"), {
      target: { value: "Newpass1!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("credentials", {
        email: "oauth@example.com",
        password: "Newpass1!",
        redirect: false,
      });
    });
  });
});
