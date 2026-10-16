import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as EnvModule from "@/src/env.mjs";

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
    query: {} as Record<string, string | string[]>,
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

vi.mock("@/src/env.mjs", async () => {
  const actual = await vi.importActual<typeof EnvModule>("@/src/env.mjs");
  return {
    env: {
      ...actual.env,
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: undefined,
    },
  };
});

vi.mock(
  "@/src/features/auth-credentials/components/ResetPasswordButton",
  () => ({
    RequestResetPasswordEmailButton: ({
      email,
      onEmailSent,
      label = "Send email",
    }: {
      email?: string;
      onEmailSent?: () => void;
      label?: string;
    }) => (
      <button type="button" data-email={email} onClick={() => onEmailSent?.()}>
        {label}
      </button>
    ),
  }),
);

import { ResetPasswordPage } from "@/src/features/auth-credentials/components/ResetPasswordPage";
import ResetPasswordAuthPage from "@/src/features/auth-credentials/ResetPasswordAuthPage";

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

describe("ResetPasswordPage redirect after saving the password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    routerState.isReady = true;
    routerState.query = {};
    useLangfuseCloudRegionMock.mockReturnValue({
      isLangfuseCloud: false,
      region: undefined,
    });
    useSessionMock.mockReturnValue({ status: "unauthenticated", data: null });
    mutateAsyncMock.mockResolvedValue({ success: true });
    signInMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const waitForRedirect = async () => {
    await flushPasswordSubmit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
  };

  const setFirstPassword = async () => {
    render(
      <ResetPasswordPage
        passwordResetAvailable
        initialEmail="new@example.com"
        intent="setup"
      />,
    );
    submitPasswordForm({
      code: "654321",
      passwordLabel: "Password",
      confirmPasswordLabel: "Confirm Password",
      submitLabel: "Set password",
    });
    await waitForRedirect();
  };

  it("sends a first self-hosted password setup through onboarding", async () => {
    await setFirstPassword();

    expect(routerPushMock).toHaveBeenCalledWith("/onboarding");
  });

  it("carries a self-hosted deep link through onboarding", async () => {
    routerState.query = { targetPath: "/project/p1/traces?view=v1" };

    await setFirstPassword();

    expect(routerPushMock).toHaveBeenCalledWith(
      "/onboarding?targetPath=%2Fproject%2Fp1%2Ftraces%3Fview%3Dv1",
    );
  });

  it("still drops a Cloud deep link that isn't a demo link", async () => {
    routerState.query = { targetPath: "/project/p1/traces" };
    useLangfuseCloudRegionMock.mockReturnValue({
      isLangfuseCloud: true,
      region: "EU",
    });

    await setFirstPassword();

    expect(routerPushMock).toHaveBeenCalledWith("/onboarding");
  });

  it("keeps an ordinary self-hosted reset going to /", async () => {
    routerState.query = { targetPath: "/project/p1/traces" };
    useSessionMock.mockReturnValue({
      status: "authenticated",
      data: { user: { email: "user@example.com", hasPassword: true } },
    });

    render(
      <ResetPasswordPage
        passwordResetAvailable
        initialEmail="user@example.com"
        intent="reset"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Send email" }));
    submitPasswordForm({
      code: "123456",
      passwordLabel: "New Password",
      confirmPasswordLabel: "Confirm New Password",
      submitLabel: "Update Password",
    });
    await waitForRedirect();

    expect(routerPushMock).toHaveBeenCalledWith("/");
  });

  /** An SSO user adding a password from Account settings: reset page, no password yet. */
  const addPasswordAsExistingUser = async () => {
    useSessionMock.mockReturnValue({
      status: "authenticated",
      data: { user: { email: "sso@example.com", hasPassword: false } },
    });
    render(
      <ResetPasswordPage
        passwordResetAvailable
        initialEmail="sso@example.com"
        intent="reset"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Send email" }));
    submitPasswordForm({
      code: "123456",
      passwordLabel: "Password",
      confirmPasswordLabel: "Confirm Password",
      submitLabel: "Set password",
    });
    await waitForRedirect();
  };

  it("sends an existing self-hosted user who adds a password straight to /", async () => {
    await addPasswordAsExistingUser();

    expect(routerPushMock).toHaveBeenCalledWith("/");
  });

  it("sends an existing self-hosted user who adds a password straight to their deep link", async () => {
    routerState.query = { targetPath: "/project/p1/traces?view=v1" };

    await addPasswordAsExistingUser();

    expect(routerPushMock).toHaveBeenCalledWith("/project/p1/traces?view=v1");
  });

  it("keeps Cloud routing an existing user who adds a password through onboarding", async () => {
    useLangfuseCloudRegionMock.mockReturnValue({
      isLangfuseCloud: true,
      region: "EU",
    });

    await addPasswordAsExistingUser();

    expect(routerPushMock).toHaveBeenCalledWith("/onboarding");
  });
});

describe("reset-password page ?email= prefill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerState.isReady = true;
    routerState.query = {};
    useLangfuseCloudRegionMock.mockReturnValue({
      isLangfuseCloud: false,
      region: undefined,
    });
    useSessionMock.mockReturnValue({ status: "unauthenticated", data: null });
  });

  it("prefills the email input from the query and hands it to the request button", () => {
    routerState.query = { email: "jane+test@example.com" };

    render(<ResetPasswordAuthPage passwordResetAvailable />);

    expect(screen.getByLabelText("Email")).toHaveValue("jane+test@example.com");
    // The mocked request button above stands in for RequestResetPasswordEmailButton.
    expect(screen.getByRole("button", { name: "Send email" })).toHaveAttribute(
      "data-email",
      "jane+test@example.com",
    );
  });

  it("only prefills — the reset email still takes an explicit click", () => {
    routerState.query = { email: "jane@example.com" };

    render(<ResetPasswordAuthPage passwordResetAvailable />);

    // Anchor the absences below: without this the test also passes when the
    // prefill does nothing at all.
    expect(screen.getByLabelText("Email")).toHaveValue("jane@example.com");
    // Jumping straight to the code step would imply an email had been sent.
    expect(
      screen.queryByLabelText("Verification code"),
    ).not.toBeInTheDocument();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("leaves the field empty without the param", () => {
    render(<ResetPasswordAuthPage passwordResetAvailable />);

    expect(screen.getByLabelText("Email")).toHaveValue("");
  });

  it("ignores a repeated ?email= rather than joining the values", () => {
    routerState.query = { email: ["a@example.com", "b@example.com"] };

    render(<ResetPasswordAuthPage passwordResetAvailable />);

    expect(screen.getByLabelText("Email")).toHaveValue("");
  });
});
