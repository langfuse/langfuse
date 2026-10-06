import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";

import EnterpriseSsoRequiredPage from "@/src/features/auth/EnterpriseSsoRequiredPage";

const { signInMock, routerState } = vi.hoisted(() => ({
  signInMock: vi.fn(),
  routerState: {
    isReady: true,
    query: {} as Record<string, string>,
  },
}));

vi.mock("next-auth/react", () => ({
  signIn: signInMock,
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    asPath: "/auth/enterprise-sso-required",
    isReady: routerState.isReady,
    query: routerState.query,
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/src/env.mjs", () => ({ env: {} }));

vi.mock("@/src/utils/reportError", () => ({ reportError: vi.fn() }));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <EnterpriseSsoRequiredPage />
    </QueryClientProvider>,
  );
  return view;
}

/** `POST /api/auth/check-sso` returns 200 + providerId, or 404 when unconfigured. */
function mockCheckSso(response: { status: number; providerId?: string }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.status === 200,
    status: response.status,
    json: async () =>
      response.status === 200
        ? { providerId: response.providerId }
        : { message: "No SSO provider configured" },
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  signInMock.mockReset();
  signInMock.mockResolvedValue(undefined);
  routerState.isReady = true;
  routerState.query = {};
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("EnterpriseSsoRequiredPage", () => {
  it("redirects to the enforced provider without asking the user to press a button", async () => {
    const fetchMock = mockCheckSso({ status: 200, providerId: "acme-okta" });
    routerState.query = {
      email: "user@acme.com",
      attemptedProvider: "google",
    };

    renderPage();

    // The page explains why the attempted provider was rejected, rather than
    // redirecting on a blank screen.
    expect(
      screen.getByText(/You tried signing in with Google/),
    ).toBeInTheDocument();
    await screen.findByText(/Redirecting to your identity provider/);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/check-sso",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ domain: "acme.com" }),
      }),
    );

    // The visible delay is the point of the interstitial: nothing navigates
    // while the user is still reading.
    expect(signInMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(signInMock).toHaveBeenCalledTimes(1);
    expect(signInMock).toHaveBeenCalledWith("acme-okta", {
      callbackUrl: undefined,
    });
  });

  it("keeps the manual form when the domain has no custom SSO config", async () => {
    // AUTH_DOMAINS_WITH_SSO_ENFORCEMENT domains reach this page without a
    // provider to redirect to, so the form must stay the way forward.
    mockCheckSso({ status: 404 });
    routerState.query = { email: "user@acme.com", attemptedProvider: "email" };

    renderPage();

    await screen.findByRole("button", { name: /Continue with Enterprise SSO/ });

    await vi.advanceTimersByTimeAsync(5000);

    expect(signInMock).not.toHaveBeenCalled();
    // Nothing was submitted yet, so the lookup must not surface an error.
    expect(
      screen.queryByText(/couldn't find a custom Enterprise SSO/),
    ).not.toBeInTheDocument();
  });

  it("does not look up or redirect when no email was passed", async () => {
    const fetchMock = mockCheckSso({ status: 200, providerId: "acme-okta" });

    renderPage();

    await screen.findByRole("button", { name: /Continue with Enterprise SSO/ });

    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("cancels the scheduled redirect when the user navigates away first", async () => {
    mockCheckSso({ status: 200, providerId: "acme-okta" });
    routerState.query = { email: "user@acme.com" };

    const { unmount } = renderPage();

    await screen.findByText(/Redirecting to your identity provider/);
    unmount();

    await vi.advanceTimersByTimeAsync(5000);

    expect(signInMock).not.toHaveBeenCalled();
  });

  it("does not forward an off-origin callbackUrl to the provider", async () => {
    // The redirect now needs no interaction, so a crafted link must not be
    // able to choose where the user lands after authenticating.
    mockCheckSso({ status: 200, providerId: "acme-okta" });
    routerState.query = {
      email: "user@acme.com",
      callbackUrl: "https://evil.example.com/steal",
    };

    renderPage();

    await screen.findByText(/Redirecting to your identity provider/);
    await vi.advanceTimersByTimeAsync(1000);

    expect(signInMock).toHaveBeenCalledWith("acme-okta", { callbackUrl: "/" });
  });

  it("waits for the router before deciding there is no email to act on", async () => {
    const fetchMock = mockCheckSso({ status: 200, providerId: "acme-okta" });
    // `router.query` is empty until hydration on a statically-optimized route.
    routerState.isReady = false;
    routerState.query = {};

    renderPage();

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /Continue with Enterprise SSO/ }),
      ).not.toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signInMock).not.toHaveBeenCalled();
  });
});
