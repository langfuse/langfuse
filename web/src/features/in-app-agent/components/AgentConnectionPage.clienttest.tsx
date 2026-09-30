import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import AgentConnectionPage from "./AgentConnectionPage";

const mocks = vi.hoisted(() => ({
  status: "authenticated",
  confirm: vi.fn(),
  mutation: { isPending: false, isSuccess: false, error: null },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: mocks.status,
    data: { user: { email: "person@example.com", name: "Person" } },
  }),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    agentUserConnections: {
      confirm: {
        useMutation: () => ({ ...mocks.mutation, mutate: mocks.confirm }),
      },
    },
  },
}));

describe("AgentConnectionPage", () => {
  const ready = {
    status: "ready" as const,
    token: "link-token",
    connection: {
      projectId: "project-1",
      projectName: "Demo project",
      workspaceId: "TDEMO",
      externalUserId: "UPERSON",
      apiKeyName: "Slack bot",
    },
  };

  beforeEach(() => {
    mocks.status = "authenticated";
    mocks.confirm.mockReset();
    mocks.mutation = { isPending: false, isSuccess: false, error: null };
  });

  afterEach(cleanup);

  it("only links after the signed-in user explicitly confirms the displayed identity", () => {
    render(<AgentConnectionPage {...ready} />);

    expect(screen.getByText("person@example.com")).toBeInTheDocument();
    expect(screen.getByText("UPERSON")).toBeInTheDocument();
    expect(screen.getByText("TDEMO")).toBeInTheDocument();
    expect(screen.getByText("Demo project")).toBeInTheDocument();
    expect(mocks.confirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Link my account" }));

    expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith({
      token: "link-token",
    });
  });

  it("preserves the connection destination through sign-in without inspecting it anonymously", () => {
    mocks.status = "unauthenticated";
    render(<AgentConnectionPage {...ready} />);

    const link = screen.getByRole<HTMLAnchorElement>("link", {
      name: "Sign in to Langfuse",
    });
    const url = new URL(link.href);
    expect(url.pathname).toBe("/auth/sign-in");
    expect(url.searchParams.get("targetPath")).toBe("/agent/connect");
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("does not offer confirmation for an expired or consumed link", () => {
    render(<AgentConnectionPage status="invalid" />);

    expect(screen.getByRole("alert")).toHaveTextContent("fresh link");
    expect(
      screen.queryByRole("button", { name: "Link my account" }),
    ).toBeNull();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});
