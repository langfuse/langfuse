import { render, screen } from "@testing-library/react";
import SessionDetailPage from "./SessionDetailPage";

// While the pages-router dynamic segments are still missing, the session page
// must render the same inline fallback every other route-param-gated page
// uses. It previously rendered the branded `LangfuseIcon` + "Loading ..."
// screen inside a `fixed inset-0 z-50` overlay — the cold-boot/auth screen —
// which covered the navigation shell and made an ordinary navigation look
// like the whole app was restarting.

const mockRouter: { query: Record<string, string> } = { query: {} };

vi.mock("next/router", () => ({
  useRouter: () => mockRouter,
}));

vi.mock("@/src/features/events", () => ({
  useReadPath: () => ({ isV4: true }),
}));

vi.mock("@/src/features/sessions/SessionPages", () => ({
  SessionEventsPage: ({ sessionId }: { sessionId: string }) => (
    <div>events page for {sessionId}</div>
  ),
  SessionPage: ({ sessionId }: { sessionId: string }) => (
    <div>session page for {sessionId}</div>
  ),
}));

describe("SessionDetailPage", () => {
  beforeEach(() => {
    mockRouter.query = {};
  });

  describe("while the route params are still resolving", () => {
    it("does not render the branded full-screen loading screen", () => {
      const { container } = render(<SessionDetailPage />);

      // The auth/cold-boot screen is the only loading state with a heading.
      expect(screen.queryByRole("heading")).not.toBeInTheDocument();
      expect(screen.queryByText(/Loading \.\.\./)).not.toBeInTheDocument();
      // ...and it is the only one that paints over the navigation shell.
      expect(container.querySelector(".fixed.inset-0")).toBeNull();
    });

    it("renders the shared inline route-params fallback", () => {
      const { container } = render(<SessionDetailPage />);

      expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    });
  });

  it("renders the session page once every route param is present", () => {
    mockRouter.query = { projectId: "p1", sessionId: "s1" };

    render(<SessionDetailPage />);

    expect(screen.getByText("events page for s1")).toBeInTheDocument();
  });
});
