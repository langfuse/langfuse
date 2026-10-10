import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInMock, fetchMock, routerPushMock, envState } = vi.hoisted(() => ({
  signInMock: vi.fn(),
  fetchMock: vi.fn(),
  routerPushMock: vi.fn(),
  envState: { siteKey: undefined as string | undefined },
}));

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
  useSession: () => ({ status: "unauthenticated", data: null }),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    push: routerPushMock,
    query: {},
    asPath: "/auth/sign-up",
    isReady: true,
  }),
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
      ref?: React.Ref<{
        reset: () => void;
        nextToken: () => Promise<string | undefined>;
      }>;
    }) => {
      React.useImperativeHandle(ref, () => ({
        reset: () => onTokenChange(undefined),
        // A new action re-renders the widget and drops the in-flight waiter
        // before the next challenge callback, matching TurnstileWidget.
        nextToken: () => Promise.resolve(undefined),
      }));
      return (
        <button type="button" onClick={() => onTokenChange(`${action}-token`)}>
          Complete captcha {action}
        </button>
      );
    },
  };
});

import SignUpPage from "@/src/features/auth/SignUpPage";
import { FALLBACK_AUTH_PROVIDERS } from "@/src/features/auth/SignInPage";
import { TURNSTILE_ACTIONS } from "@/src/features/auth/constants";

function renderVerifiedSignup() {
  render(
    <SignUpPage
      authProviders={FALLBACK_AUTH_PROVIDERS}
      runningOnHuggingFaceSpaces={false}
      signUpDisabled={false}
      emailVerificationRequired
    />,
  );
}

async function fillSignupForm() {
  fireEvent.change(screen.getByPlaceholderText("Jane Doe"), {
    target: { value: "Jane Doe" },
  });
  fireEvent.change(screen.getByPlaceholderText("jsdoe@example.com"), {
    target: { value: "jane@example.com" },
  });
}

describe("VerifiedSignupFlow captcha", () => {
  beforeEach(() => {
    signInMock.mockReset();
    signInMock.mockResolvedValue({ ok: true, error: null });
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);
    routerPushMock.mockReset();
    envState.siteKey = undefined;
  });

  it("sends the setup code without a captcha token when Turnstile is off", async () => {
    renderVerifiedSignup();
    await fillSignupForm();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("email", {
        email: "jane@example.com",
        callbackUrl: "/auth/setup-password",
        redirect: false,
      });
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("sends the setup code with a fresh password-reset token", async () => {
    envState.siteKey = "site-key";
    renderVerifiedSignup();
    await fillSignupForm();

    const continueButton = screen.getByRole("button", {
      name: "Continue",
    }) as HTMLButtonElement;
    expect(continueButton.disabled).toBe(true);

    fireEvent.click(
      screen.getByRole("button", {
        name: `Complete captcha ${TURNSTILE_ACTIONS.signupVerify}`,
      }),
    );
    fireEvent.click(continueButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      email: "jane@example.com",
      turnstileToken: `${TURNSTILE_ACTIONS.signupVerify}-token`,
    });
    expect(signInMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        "Your account was created. Complete the captcha to receive the verification code.",
      ),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: `Complete captcha ${TURNSTILE_ACTIONS.passwordReset}`,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Send verification code" }),
    );

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("email", {
        email: "jane@example.com",
        callbackUrl: "/auth/setup-password",
        redirect: false,
        turnstileToken: `${TURNSTILE_ACTIONS.passwordReset}-token`,
      });
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
