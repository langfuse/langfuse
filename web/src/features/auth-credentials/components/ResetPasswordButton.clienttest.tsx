import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInMock, envState } = vi.hoisted(() => ({
  signInMock: vi.fn(),
  envState: { siteKey: undefined as string | undefined },
}));

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
  useSession: () => ({ status: "unauthenticated", data: null }),
}));

vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({
  env: {
    get NEXT_PUBLIC_TURNSTILE_SITE_KEY() {
      return envState.siteKey;
    },
    NEXT_PUBLIC_BASE_PATH: "",
  },
}));

vi.mock("@/src/features/auth/components/TurnstileWidget", async () => {
  const React = await import("react");
  return {
    TurnstileWidget: ({
      action,
      onTokenChange,
      ref,
    }: {
      action: string;
      onTokenChange: (token: string | undefined) => void;
      ref?: React.Ref<{ reset: () => void }>;
    }) => {
      React.useImperativeHandle(ref, () => ({
        reset: () => onTokenChange(undefined),
        nextToken: () => Promise.resolve(undefined),
      }));
      return (
        <button type="button" onClick={() => onTokenChange("captcha-token")}>
          Complete captcha {action}
        </button>
      );
    },
  };
});

import { RequestResetPasswordEmailButton } from "@/src/features/auth-credentials/components/ResetPasswordButton";
import {
  TURNSTILE_ACTIONS,
  TURNSTILE_FAILED_MESSAGE,
} from "@/src/features/auth/constants";

describe("RequestResetPasswordEmailButton captcha", () => {
  beforeEach(() => {
    signInMock.mockReset();
    signInMock.mockResolvedValue({ ok: true });
    envState.siteKey = undefined;
  });

  it("sends the reset email without a captcha token when Turnstile is off", async () => {
    render(
      <RequestResetPasswordEmailButton
        email="user@example.com"
        onEmailSent={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Request password reset" }),
    );

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("email", {
        email: "user@example.com",
        callbackUrl: "/auth/reset-password",
        redirect: false,
      });
    });
  });

  it("holds the reset email until the captcha token is sent", async () => {
    envState.siteKey = "site-key";
    const onEmailSent = vi.fn();
    render(
      <RequestResetPasswordEmailButton
        email="user@example.com"
        onEmailSent={onEmailSent}
      />,
    );

    const submit = screen.getByRole("button", {
      name: "Request password reset",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(signInMock).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", {
        name: `Complete captcha ${TURNSTILE_ACTIONS.passwordReset}`,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Request password reset" }),
    );

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("email", {
        email: "user@example.com",
        callbackUrl: "/auth/reset-password",
        redirect: false,
        turnstileToken: "captcha-token",
      });
    });
    expect(onEmailSent).toHaveBeenCalledOnce();

    await waitFor(() => {
      expect(submit.disabled).toBe(true);
    });
    fireEvent.click(submit);
    expect(signInMock).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", {
        name: `Complete captcha ${TURNSTILE_ACTIONS.passwordReset}`,
      }),
    );
    expect(submit.disabled).toBe(false);
  });

  it("shows the captcha message when NextAuth prefixes the thrown error", async () => {
    envState.siteKey = "site-key";
    signInMock.mockResolvedValue({
      ok: false,
      error: `Error: ${TURNSTILE_FAILED_MESSAGE}`,
    });
    render(
      <RequestResetPasswordEmailButton
        email="user@example.com"
        onEmailSent={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: `Complete captcha ${TURNSTILE_ACTIONS.passwordReset}`,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Request password reset" }),
    );

    expect(await screen.findByText(TURNSTILE_FAILED_MESSAGE)).toBeTruthy();

    const submit = screen.getByRole("button", {
      name: "Request password reset",
    }) as HTMLButtonElement;
    await waitFor(() => {
      expect(submit.disabled).toBe(true);
    });
    fireEvent.click(submit);
    expect(signInMock).toHaveBeenCalledTimes(1);
  });
});
