import { act, render, screen } from "@testing-library/react";
import { useContext } from "react";
import type { MockInstance } from "vitest";
import type { Session } from "next-auth";
import { SessionContext, type SessionContextValue } from "next-auth/react";
import type * as nextAuthReactModule from "next-auth/react";

import { ResilientSessionProvider } from "@/src/features/auth/components/ResilientSessionProvider";

const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));

vi.mock("next-auth/react", async (importOriginal) => {
  const actual = await importOriginal<typeof nextAuthReactModule>();
  return { ...actual, useSession: useSessionMock };
});

const authenticated = (email: string): SessionContextValue => ({
  data: { user: { email }, expires: "2999-01-01" } as unknown as Session,
  status: "authenticated",
  update: vi.fn(),
});

const noSession: SessionContextValue = {
  data: null,
  status: "unauthenticated",
  update: vi.fn(),
};

/** Stands in for every session consumer: next-auth's useSession reads this context. */
function SessionReadout() {
  const session = useContext(SessionContext);
  return (
    <>
      <span data-testid="session">
        {`${session?.status}:${session?.data?.user?.email ?? "none"}`}
      </span>
      <button
        onClick={() => {
          session?.update();
        }}
      >
        refresh session
      </button>
    </>
  );
}

const tree = () => (
  <ResilientSessionProvider basePath="/api/auth">
    <SessionReadout />
  </ResilientSessionProvider>
);

type DispatchSpy = MockInstance<(event: Event) => boolean>;

const storageKicks = (dispatch: DispatchSpy) =>
  dispatch.mock.calls.filter(
    ([event]) =>
      event instanceof StorageEvent && event.key === "nextauth.message",
  ).length;

/** The session endpoint's two answers, plus not answering at all. */
const endpointSays = (body: Record<string, unknown>) =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => body });
const endpointUnreachable = () =>
  vi.fn().mockRejectedValue(new Error("Failed to fetch"));

/** Runs the pending re-check timer and lets its probe resolve. */
const advanceRecheck = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe("ResilientSessionProvider", () => {
  let dispatch: DispatchSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    useSessionMock.mockReset();
    dispatch = vi.spyOn(window, "dispatchEvent");
    vi.stubGlobal("fetch", endpointSays({}));
  });

  afterEach(() => {
    dispatch.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps the last session while re-checking, and asks next-auth to re-fetch", async () => {
    useSessionMock.mockReturnValue(authenticated("demo@langfuse.com"));
    const { rerender } = render(tree());
    expect(screen.getByTestId("session")).toHaveTextContent(
      "authenticated:demo@langfuse.com",
    );

    // A blip: next-auth reports no session, so consumers would unmount.
    useSessionMock.mockReturnValue(noSession);
    await act(async () => rerender(tree()));
    expect(screen.getByTestId("session")).toHaveTextContent(
      "authenticated:demo@langfuse.com",
    );
    expect(storageKicks(dispatch)).toBe(1);

    // next-auth would drop an update() here, so it becomes a re-read instead.
    await act(async () => {
      screen.getByRole("button", { name: "refresh session" }).click();
    });
    expect(storageKicks(dispatch)).toBe(2);

    // The re-fetch lands, so the real session takes over again.
    useSessionMock.mockReturnValue(authenticated("demo@langfuse.com"));
    await act(async () => rerender(tree()));
    expect(screen.getByTestId("session")).toHaveTextContent(
      "authenticated:demo@langfuse.com",
    );
  });

  it("reports unauthenticated when the server says the session is gone", async () => {
    useSessionMock.mockReturnValue(authenticated("demo@langfuse.com"));
    const { rerender } = render(tree());

    useSessionMock.mockReturnValue(noSession);
    await act(async () => rerender(tree()));
    await advanceRecheck(400);

    expect(screen.getByTestId("session")).toHaveTextContent(
      "unauthenticated:none",
    );
  });

  it("never signs the user out while the session endpoint is unreachable", async () => {
    vi.stubGlobal("fetch", endpointUnreachable());
    useSessionMock.mockReturnValue(authenticated("demo@langfuse.com"));
    const { rerender } = render(tree());

    useSessionMock.mockReturnValue(noSession);
    await act(async () => rerender(tree()));

    // Long past every re-check, with the endpoint still refusing to answer.
    for (const ms of [400, 800, 1600, 3200, 10_000, 10_000]) {
      await advanceRecheck(ms);
    }

    expect(screen.getByTestId("session")).toHaveTextContent(
      "authenticated:demo@langfuse.com",
    );
    expect(storageKicks(dispatch)).toBeGreaterThan(2);
  });
});
