import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FALLBACK_AUTH_PROVIDERS } from "@/src/features/auth/SignInPage";
import SignUpPage from "@/src/features/auth/SignUpPage";

const { fetchMock, signInMock, routerState } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  signInMock: vi.fn(),
  routerState: { query: {} as Record<string, string> },
}));

vi.mock("next-auth/react", () => ({
  signIn: signInMock,
  useSession: () => ({ status: "unauthenticated", data: null }),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    asPath: "/auth/sign-up",
    query: routerState.query,
    isReady: true,
  }),
}));

vi.mock("@/src/env.mjs", () => ({
  env: { NEXT_PUBLIC_BASE_PATH: "/langfuse" },
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({
    isLangfuseCloud: true,
    region: "EU",
  }),
}));

vi.mock("@/src/features/auth/components/AuthCloudRegionSwitch", () => ({
  CloudRegionSwitch: () => null,
}));

vi.mock("@/src/features/auth/components/AuthCloudPrivacyNotice", () => ({
  CloudPrivacyNotice: () => null,
}));

describe("Cloud signup without email verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    fetchMock.mockResolvedValue({ ok: true });
    signInMock.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    {
      name: "routes demo signups through onboarding with the demo target",
      targetPath: "/demo/datasets/dataset-1/items?foo=bar",
      callbackUrl:
        "/langfuse/onboarding?targetPath=%2Fdemo%2Fdatasets%2Fdataset-1%2Fitems%3Ffoo%3Dbar",
    },
    {
      name: "preserves non-demo signup destinations",
      targetPath: "/project/project-1/traces?foo=bar",
      callbackUrl: "/langfuse/project/project-1/traces?foo=bar",
    },
  ])("$name", async ({ targetPath, callbackUrl }) => {
    routerState.query = { targetPath };
    render(
      <SignUpPage
        authProviders={{ ...FALLBACK_AUTH_PROVIDERS, credentials: true }}
        signUpDisabled={false}
        runningOnHuggingFaceSpaces={false}
        emailVerificationRequired={false}
      />,
    );

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Jane Doe" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "jane@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Password1!" },
    });
    fireEvent.click(screen.getByTestId("submit-email-password-sign-up-form"));

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("credentials", {
        email: "jane@example.com",
        password: "Password1!",
        callbackUrl,
      });
    });
  });
});
