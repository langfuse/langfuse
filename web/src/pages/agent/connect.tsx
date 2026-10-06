import { type GetServerSideProps } from "next";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { env } from "@/src/env.mjs";
import { getServerAuthSession } from "@/src/server/auth";
import { getCookieName, getCookieOptions } from "@/src/server/utils/cookies";
import { inspectAgentUserConnection } from "@/src/features/in-app-agent/server/userConnectionService";
import { type AgentConnectionPageProps } from "@/src/features/in-app-agent/components/AgentConnectionPage";

export { default } from "@/src/features/in-app-agent/components/AgentConnectionPage";

export const getServerSideProps: GetServerSideProps<
  AgentConnectionPageProps
> = async (ctx) => {
  ctx.res.setHeader("Cache-Control", "private, no-store");
  ctx.res.setHeader("Referrer-Policy", "no-referrer");
  ctx.res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const cookieName = getCookieName("langfuse.agent-connection");
  const path = `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/agent/connect`;

  if (ctx.query.token !== undefined) {
    const token = ctx.query.token;
    const valid = typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
    const cookie = [
      `${cookieName}=${valid ? token : ""}`,
      `Path=${path}`,
      `Max-Age=${valid ? 600 : 0}`,
      "HttpOnly",
      "SameSite=Lax",
    ];
    if (getCookieOptions().secure) cookie.push("Secure");
    ctx.res.setHeader("Set-Cookie", cookie.join("; "));
    return { redirect: { destination: "/agent/connect", permanent: false } };
  }

  const token = ctx.req.cookies[cookieName];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return { props: { status: "invalid" } };
  }

  const session = await getServerAuthSession(ctx);
  if (!session?.user) {
    return {
      redirect: {
        destination: "/auth/sign-in?targetPath=%2Fagent%2Fconnect",
        permanent: false,
      },
    };
  }

  try {
    const connection = await inspectAgentUserConnection(token);
    return { props: { status: "ready", token, connection } };
  } catch (error) {
    if (!(error instanceof LangfuseNotFoundError)) throw error;
    return { props: { status: "invalid" } };
  }
};
