import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInMock, envState } = vi.hoisted(() => ({
  signInMock: vi.fn(),
  envState: { siteKey: "site-key" as string | undefined },
}));

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
  useSession: () => ({ status: "unauthenticated", data: null }),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    push: vi.fn(),
    query: {},
    isReady: true,
  }),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    credentials: {
      resetPassword: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/organizations", () => ({
  useLangfuseCloudRegion: () => ({
    isLangfuseCloud: false,
    region: undefined,
  }),
}));

vi.mock("@/src/env.mjs", () => ({
  env: {
    get NEXT_PUBLIC_TURNSTILE_SITE_KEY() {
      return envState.siteKey;
    },
    NEXT_PUBLIC_BASE_PATH: "",
  },
}));

vi.mock("@/src/features/auth/components/TurnstileWidget", () => ({
  TurnstileWidget: ({
    action,
    onTokenChange,
  }: {
    action: string;
    onTokenChange: (token: string | undefined) => void;
  }) => (
    <button type="button" onClick={() => onTokenChange(`${action}-token`)}>
      Complete captcha {action}
    </button>
  ),
}));

import { ResetPasswordPage } from "@/src/features/auth-credentials/components/ResetPasswordPage";
import { TURNSTILE_ACTIONS } from "@/src/features/auth/constants";

describe("ResetPasswordPage captcha", () => {
  beforeEach(() => {
    signInMock.mockReset();
    signInMock.mockResolvedValue({ ok: true });
    envState.siteKey = "site-key";
  });

  it("shows one captcha on the code form and reuses it to send another code", async () => {
    render(
      <ResetPasswordPage
        passwordResetAvailable
        initialEmail="user@example.com"
        intent="setup"
      />,
    );

    expect(
      screen.getAllByRole("button", { name: /Complete captcha/ }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", {
        name: `Complete captcha ${TURNSTILE_ACTIONS.login}`,
      }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Send another code" }));
    expect(signInMock).not.toHaveBeenCalled();
    expect(
      screen.getAllByRole("button", { name: /Complete captcha/ }),
    ).toHaveLength(1);

    const resendCaptcha = screen.getByRole("button", {
      name: `Complete captcha ${TURNSTILE_ACTIONS.passwordReset}`,
    });
    const resend = screen.getByRole("button", {
      name: "Send another code",
    }) as HTMLButtonElement;
    expect(resend.disabled).toBe(true);

    fireEvent.click(resendCaptcha);

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("email", {
        email: "user@example.com",
        callbackUrl: "/auth/setup-password",
        redirect: false,
        turnstileToken: `${TURNSTILE_ACTIONS.passwordReset}-token`,
      });
    });
    expect(
      screen.getAllByRole("button", { name: /Complete captcha/ }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", {
        name: `Complete captcha ${TURNSTILE_ACTIONS.login}`,
      }),
    ).toBeTruthy();
  });
});
