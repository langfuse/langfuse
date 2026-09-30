import { type GetServerSideProps } from "next";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { env } from "@/src/env.mjs";
import { getServerAuthSession } from "@/src/server/auth";
import { getCookieName, getCookieOptions } from "@/src/server/utils/cookies";
import { inspectSlackAgentConnection } from "@/src/features/slack-agent/server/service";
import { type SlackAgentConnectionPageProps } from "@/src/features/in-app-agent/components/SlackAgentConnectionPage";

export { default } from "@/src/features/in-app-agent/components/SlackAgentConnectionPage";

export const getServerSideProps: GetServerSideProps<
  SlackAgentConnectionPageProps
> = async (ctx) => {
  ctx.res.setHeader("Cache-Control", "private, no-store");
  ctx.res.setHeader("Referrer-Policy", "no-referrer");
  ctx.res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const cookieName = getCookieName("langfuse.slack-agent-connection");
  const path = `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/slack-agent`;

  if (ctx.query.token !== undefined) {
    const token = ctx.query.token;
    const valid = typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
    const cookie = [
      `${cookieName}=${valid ? token : "invalid"}`,
      `Path=${path}`,
      `Max-Age=${valid ? 600 : 60}`,
      "HttpOnly",
      "SameSite=Lax",
    ];
    if (getCookieOptions().secure) cookie.push("Secure");
    ctx.res.setHeader("Set-Cookie", cookie.join("; "));
    return { redirect: { destination: "/slack-agent", permanent: false } };
  }

  const token = ctx.req.cookies[cookieName];
  if (!token) return { props: { status: "manage" } };
  if (!/^[a-f0-9]{64}$/.test(token)) return { props: { status: "invalid" } };

  const session = await getServerAuthSession(ctx);
  if (!session?.user) {
    return {
      redirect: {
        destination: "/auth/sign-in?targetPath=%2Fslack-agent",
        permanent: false,
      },
    };
  }

  try {
    const connection = await inspectSlackAgentConnection(token);
    return { props: { status: "ready", token, connection } };
  } catch (error) {
    if (!(error instanceof LangfuseNotFoundError)) throw error;
    ctx.res.setHeader(
      "Set-Cookie",
      `${cookieName}=; Path=${path}; Max-Age=0; HttpOnly; SameSite=Lax${getCookieOptions().secure ? "; Secure" : ""}`,
    );
    return { props: { status: "invalid" } };
  }
};
