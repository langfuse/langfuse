import { type GetServerSideProps, type GetServerSidePropsResult } from "next";

import { env } from "@/src/env.mjs";
import { getServerAuthSession } from "@/src/server/auth";
import { prisma } from "@langfuse/shared/src/db";

const DemoRedirectPage = () => null;

export default DemoRedirectPage;

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    return redirect("/");
  }

  const demoProject =
    env.NEXT_PUBLIC_DEMO_ORG_ID && env.NEXT_PUBLIC_DEMO_PROJECT_ID
      ? await prisma.project.findUnique({
          where: {
            orgId: env.NEXT_PUBLIC_DEMO_ORG_ID,
            id: env.NEXT_PUBLIC_DEMO_PROJECT_ID,
          },
          select: {
            id: true,
          },
        })
      : null;

  if (!demoProject) {
    return redirect("/");
  }

  const demoProjectPath = `/project/${encodeURIComponent(
    demoProject.id,
  )}/traces`;
  const session = await getServerAuthSession({ req: ctx.req, res: ctx.res });

  if (session?.user) {
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
