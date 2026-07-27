import { type GetServerSideProps, type GetServerSidePropsResult } from "next";

import { env } from "@/src/env.mjs";
import { getServerAuthSession } from "@/src/server/auth";

const DemoRedirectPage = () => null;

export default DemoRedirectPage;

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const demoProjectId = env.NEXT_PUBLIC_DEMO_PROJECT_ID?.trim();

  if (!demoProjectId) {
    return redirect("/");
  }

  const demoProjectPath = `/project/${encodeURIComponent(demoProjectId)}/traces`;
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
