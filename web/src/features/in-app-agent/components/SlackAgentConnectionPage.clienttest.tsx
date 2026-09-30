import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SlackAgentConnectionPage from "./SlackAgentConnectionPage";

const mocks = vi.hoisted(() => ({
  status: "authenticated",
  confirm: vi.fn(),
  mutation: { isPending: false, isSuccess: false, error: null },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: mocks.status,
    data: { user: { email: "person@example.com" } },
  }),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({ slackAgent: { status: { invalidate: vi.fn() } } }),
    slackAgent: {
      status: {
        useQuery: () => ({
          data: { enabled: true, teamId: "TDEMO", links: [] },
          isLoading: false,
        }),
      },
      disconnect: { useMutation: () => ({}) },
      confirmConnection: {
        useMutation: () => ({ ...mocks.mutation, mutate: mocks.confirm }),
      },
    },
  },
}));

describe("SlackAgentConnectionPage", () => {
  const ready = {
    status: "ready" as const,
    token: "link-token",
    connection: {
      teamId: "TDEMO",
      slackUserId: "UPERSON",
      expiresAt: "2026-09-30T18:00:00.000Z",
    },
  };

  beforeEach(() => {
    mocks.status = "authenticated";
    mocks.confirm.mockReset();
    mocks.mutation = { isPending: false, isSuccess: false, error: null };
  });
  afterEach(cleanup);

  it("requires confirmation of the displayed Slack identity without copying a code", () => {
    render(<SlackAgentConnectionPage {...ready} />);
    expect(screen.getByText("person@example.com")).toBeInTheDocument();
    expect(screen.getByText("UPERSON")).toBeInTheDocument();
    expect(screen.getByText("TDEMO")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Generate connection code" }),
    ).toBeNull();
    expect(mocks.confirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Link my account" }));
    expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith({
      token: "link-token",
    });
  });

  it("keeps sign-in on the clean linking destination", () => {
    mocks.status = "unauthenticated";
    render(<SlackAgentConnectionPage {...ready} />);
    const link = screen.getByRole<HTMLAnchorElement>("link", {
      name: "Sign in to Langfuse",
    });
    expect(new URL(link.href).searchParams.get("targetPath")).toBe(
      "/slack-agent",
    );
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("rejects an expired link without offering account confirmation", () => {
    render(<SlackAgentConnectionPage status="invalid" />);
    expect(screen.getByRole("alert")).toHaveTextContent("fresh link");
    expect(
      screen.queryByRole("button", { name: "Link my account" }),
    ).toBeNull();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});
