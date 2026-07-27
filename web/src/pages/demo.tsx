import { type GetServerSideProps, type GetServerSidePropsResult } from "next";

import { env } from "@/src/env.mjs";
import {
  ensureDemoProjectAccess,
  getDemoProjectConfig,
} from "@/src/features/auth/lib/demoProjectAccess";
import { getServerAuthSession } from "@/src/server/auth";

const DemoRedirectPage = () => null;

export default DemoRedirectPage;

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const demoProjectConfig = getDemoProjectConfig();

  if (!demoProjectConfig) {
    return redirect("/");
  }

  const demoProjectPath = `/project/${encodeURIComponent(
    demoProjectConfig.projectId,
  )}/traces`;
  const session = await getServerAuthSession({ req: ctx.req, res: ctx.res });

  if (session?.user) {
    const hasDemoAccess = await ensureDemoProjectAccess({
      userId: session.user.id,
    });

    if (!hasDemoAccess) {
      return redirect("/");
    }

    return redirect(demoProjectPath);
  }

  const authPath =
    env.AUTH_DISABLE_SIGNUP === "true" ||
    env.NEXT_PUBLIC_SIGN_UP_DISABLED === "true"
      ? "/auth/sign-in"
      : "/auth/sign-up";

  return redirect(`${authPath}?targetPath=${encodeURIComponent("/demo")}`);
};

const redirect = (destination: string): GetServerSidePropsResult<never> => ({
  redirect: { destination, permanent: false },
});
