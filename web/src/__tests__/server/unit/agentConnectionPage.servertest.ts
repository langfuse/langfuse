import { type GetServerSidePropsContext } from "next";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { getServerSideProps } from "@/src/pages/agent/connect";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  inspect: vi.fn(),
}));

vi.mock("@/src/server/auth", () => ({
  getServerAuthSession: mocks.session,
}));
vi.mock("@/src/env.mjs", () => ({
  env: { NEXT_PUBLIC_BASE_PATH: "" },
}));
vi.mock("@/src/server/utils/cookies", () => ({
  getCookieName: (name: string) => name,
  getCookieOptions: () => ({ secure: true }),
}));
vi.mock("@/src/features/in-app-agent/server/userConnectionService", () => ({
  inspectAgentUserConnection: mocks.inspect,
}));
vi.mock("@/src/features/in-app-agent/components/AgentConnectionPage", () => ({
  default: () => null,
}));

const token = "a".repeat(64);
function context(params: { queryToken?: string; cookieToken?: string } = {}) {
  const setHeader = vi.fn();
  return {
    setHeader,
    ctx: {
      query:
        params.queryToken === undefined ? {} : { token: params.queryToken },
      req: { cookies: { "langfuse.agent-connection": params.cookieToken } },
      res: { setHeader },
    } as unknown as GetServerSidePropsContext,
  };
}

describe("agent connection page privacy", () => {
  beforeEach(() => {
    mocks.session.mockReset().mockResolvedValue({ user: { id: "user-1" } });
    mocks.inspect.mockReset();
  });

  it("removes the token URL before rendering browser code or inspecting the connection", async () => {
    const { ctx, setHeader } = context({ queryToken: token });
    expect(await getServerSideProps(ctx)).toEqual({
      redirect: { destination: "/agent/connect", permanent: false },
    });
    expect(setHeader).toHaveBeenCalledWith("Referrer-Policy", "no-referrer");
    expect(setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store",
    );
    expect(setHeader).toHaveBeenCalledWith(
      "Set-Cookie",
      `langfuse.agent-connection=${token}; Path=/agent/connect; Max-Age=600; HttpOnly; SameSite=Lax; Secure`,
    );
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.inspect).not.toHaveBeenCalled();
  });

  it("does not put a token in the sign-in destination or inspect before authentication", async () => {
    mocks.session.mockResolvedValue(null);
    const { ctx } = context({ cookieToken: token });
    expect(await getServerSideProps(ctx)).toEqual({
      redirect: {
        destination: "/auth/sign-in?targetPath=%2Fagent%2Fconnect",
        permanent: false,
      },
    });
    expect(mocks.inspect).not.toHaveBeenCalled();
  });

  it("renders consumed links as invalid without replaying confirmation", async () => {
    mocks.inspect.mockRejectedValue(new LangfuseNotFoundError("Expired"));
    const { ctx } = context({ cookieToken: token });
    expect(await getServerSideProps(ctx)).toEqual({
      props: { status: "invalid" },
    });
    expect(mocks.inspect).toHaveBeenCalledExactlyOnceWith(token);
  });

  it("rejects malformed tokens instead of interpolating them into cookie headers", async () => {
    const { ctx, setHeader } = context({
      queryToken: "bad; Domain=attacker.test",
    });
    await getServerSideProps(ctx);
    expect(setHeader).toHaveBeenCalledWith(
      "Set-Cookie",
      "langfuse.agent-connection=; Path=/agent/connect; Max-Age=0; HttpOnly; SameSite=Lax; Secure",
    );
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
});
