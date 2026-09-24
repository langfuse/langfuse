import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mutateAsyncMock,
  signInMock,
  routerPushMock,
  routerState,
  useLangfuseCloudRegionMock,
  useSessionMock,
} = vi.hoisted(() => ({
  mutateAsyncMock: vi.fn(),
  signInMock: vi.fn(),
  routerPushMock: vi.fn(),
  routerState: {
    isReady: true,
    query: {} as Record<string, string>,
  },
  useLangfuseCloudRegionMock: vi.fn(),
  useSessionMock: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signIn: signInMock,
  useSession: () => useSessionMock(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    push: routerPushMock,
    query: routerState.query,
    isReady: routerState.isReady,
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
  useLangfuseCloudRegion: () => useLangfuseCloudRegionMock(),
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

const submitPasswordForm = ({
  code,
  passwordLabel,
  confirmPasswordLabel,
  submitLabel,
}: {
  code: string;
  passwordLabel: string;
  confirmPasswordLabel: string;
  submitLabel: string;
}) => {
  fireEvent.change(screen.getByLabelText("Verification code"), {
    target: { value: code },
  });
  fireEvent.change(screen.getByLabelText(passwordLabel), {
    target: { value: "Newpass1!" },
  });
  fireEvent.change(screen.getByLabelText(confirmPasswordLabel), {
    target: { value: "Newpass1!" },
  });
  fireEvent.click(screen.getByRole("button", { name: submitLabel }));
};

const flushPasswordSubmit = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("ResetPasswordPage re-authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerState.isReady = true;
    routerState.query = {};
    useLangfuseCloudRegionMock.mockReturnValue({
      isLangfuseCloud: false,
      region: undefined,
    });
    mutateAsyncMock.mockResolvedValue({ success: true });
    signInMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
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

    submitPasswordForm({
      code: "123456",
      passwordLabel: "New Password",
      confirmPasswordLabel: "Confirm New Password",
      submitLabel: "Update Password",
    });

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

    submitPasswordForm({
      code: "654321",
      passwordLabel: "Password",
      confirmPasswordLabel: "Confirm Password",
      submitLabel: "Set password",
    });

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("credentials", {
        email: "oauth@example.com",
        password: "Newpass1!",
        redirect: false,
      });
    });
  });

  it("routes initial Cloud password setup through onboarding with the demo target", async () => {
    vi.useFakeTimers();
    routerState.query = {
      targetPath: "/demo/datasets/dataset-1/items?foo=bar",
    };
    useLangfuseCloudRegionMock.mockReturnValue({
      isLangfuseCloud: true,
      region: "EU",
    });
    useSessionMock.mockReturnValue({
      status: "unauthenticated",
      data: null,
    });

    render(
      <ResetPasswordPage
        passwordResetAvailable
        initialEmail="oauth@example.com"
        intent="setup"
      />,
    );

    submitPasswordForm({
      code: "654321",
      passwordLabel: "Password",
      confirmPasswordLabel: "Confirm Password",
      submitLabel: "Set password",
    });

    await flushPasswordSubmit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(routerPushMock).toHaveBeenCalledWith(
      "/onboarding?targetPath=%2Fdemo%2Fdatasets%2Fdataset-1%2Fitems%3Ffoo%3Dbar",
    );
  });
});
