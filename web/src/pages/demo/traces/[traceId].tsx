import { type GetServerSideProps, type GetServerSidePropsResult } from "next";

import { env } from "@/src/env.mjs";
import {
  ensureDemoProjectAccess,
  getDemoProjectConfig,
} from "@/src/features/auth/lib/demoProjectAccess";
import {
  buildDemoTraceProjectPath,
  buildRegionalDemoTraceTargetPath,
} from "@/src/features/auth/lib/demoTraceRedirect";
import { getServerAuthSession } from "@/src/server/auth";

const DemoTraceRedirectPage = () => null;

export default DemoTraceRedirectPage;

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const traceId = getSingleParam(ctx.params?.traceId);
  const demoProjectConfig = getDemoProjectConfig();

  if (!traceId || !demoProjectConfig) {
    return redirect("/");
  }

  const demoTracePath = buildDemoTraceProjectPath({
    projectId: demoProjectConfig.projectId,
    traceId,
    query: ctx.query,
  });
  const session = await getServerAuthSession({ req: ctx.req, res: ctx.res });

  if (session?.user) {
    const hasDemoAccess = await ensureDemoProjectAccess({
      userId: session.user.id,
    });

    if (!hasDemoAccess) {
      return redirect("/");
    }

    return redirect(demoTracePath);
  }

  const authPath =
    env.AUTH_DISABLE_SIGNUP === "true" ||
    env.NEXT_PUBLIC_SIGN_UP_DISABLED === "true"
      ? "/auth/sign-in"
      : "/auth/sign-up";

  const targetPath = buildRegionalDemoTraceTargetPath({
    traceId,
    query: ctx.query,
  });

  return redirect(`${authPath}?targetPath=${encodeURIComponent(targetPath)}`);
};

const getSingleParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const redirect = (destination: string): GetServerSidePropsResult<never> => ({
  redirect: { destination, permanent: false },
});
