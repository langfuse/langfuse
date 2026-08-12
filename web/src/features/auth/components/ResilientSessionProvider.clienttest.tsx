import { act, render, screen } from "@testing-library/react";
import { useContext } from "react";
import { SessionContext, type SessionContextValue } from "next-auth/react";
import type * as nextAuthReactModule from "next-auth/react";

import { ResilientSessionProvider } from "@/src/features/auth/components/ResilientSessionProvider";

const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));

vi.mock("next-auth/react", async (importOriginal) => {
  const actual = await importOriginal<typeof nextAuthReactModule>();
  return { ...actual, useSession: useSessionMock };
});

const authenticated = (email: string): SessionContextValue => ({
  data: {
    user: { email },
    expires: "2999-01-01",
  } as SessionContextValue["data"],
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
    <span data-testid="session">
      {`${session?.status}:${session?.data?.user?.email ?? "none"}`}
    </span>
  );
}

const tree = () => (
  <ResilientSessionProvider>
    <SessionReadout />
  </ResilientSessionProvider>
);

const storageKicks = (dispatch: ReturnType<typeof vi.spyOn>) =>
  dispatch.mock.calls.filter(
    ([event]) =>
      event instanceof StorageEvent && event.key === "nextauth.message",
  ).length;

describe("ResilientSessionProvider", () => {
  let dispatch: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    useSessionMock.mockReset();
    dispatch = vi.spyOn(window, "dispatchEvent");
  });

  afterEach(() => {
    dispatch.mockRestore();
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

    // The re-fetch lands, so the real session takes over again.
    useSessionMock.mockReturnValue(authenticated("demo@langfuse.com"));
    await act(async () => rerender(tree()));
    expect(screen.getByTestId("session")).toHaveTextContent(
      "authenticated:demo@langfuse.com",
    );
  });

  it("reports unauthenticated once the re-checks agree the session is gone", async () => {
    useSessionMock.mockReturnValue(authenticated("demo@langfuse.com"));
    const { rerender } = render(tree());

    useSessionMock.mockReturnValue(noSession);
    await act(async () => rerender(tree()));

    // Two re-checks, each given time to land, both still find no session.
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.getByTestId("session")).toHaveTextContent(
      "unauthenticated:none",
    );
    expect(storageKicks(dispatch)).toBe(2);
  });
});
