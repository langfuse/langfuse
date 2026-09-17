import { type GetServerSideProps, type GetServerSidePropsResult } from "next";
import { CloudConfigSchema } from "@langfuse/shared";

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
            deletedAt: null,
          },
          select: {
            id: true,
            organization: {
              select: {
                cloudConfig: true,
              },
            },
          },
        })
      : null;

  const isCloudDemoOrg = CloudConfigSchema.safeParse(
    demoProject?.organization.cloudConfig,
  ).success;

  if (!demoProject || !isCloudDemoOrg) {
    return redirect("/");
  }

  const { demoTargetPath, demoProjectPath } = getDemoRedirectPaths({
    resolvedUrl: ctx.resolvedUrl,
    projectId: demoProject.id,
  });
  const session = await getServerAuthSession({ req: ctx.req, res: ctx.res });

  if (session?.user) {
    return redirect(demoProjectPath);
  }

  const authPath =
    env.AUTH_DISABLE_SIGNUP === "true" ||
    env.NEXT_PUBLIC_SIGN_UP_DISABLED === "true"
      ? "/auth/sign-in"
      : "/auth/sign-up";

  return redirect(
    `${authPath}?targetPath=${encodeURIComponent(demoTargetPath)}`,
  );
};

const redirect = (destination: string): GetServerSidePropsResult<never> => ({
  redirect: { destination, permanent: false },
});

function getDemoRedirectPaths({
  resolvedUrl,
  projectId,
}: {
  resolvedUrl: string;
  projectId: string;
}) {
  const encodedProjectId = encodeURIComponent(projectId);

  try {
    const url = new URL(resolvedUrl, "https://langfuse.invalid");

    if (url.pathname.startsWith("/demo/")) {
      const demoSuffix = url.pathname.slice("/demo".length);
      const pathSuffix = `${url.search}${url.hash}`;

      return {
        demoTargetPath: `${url.pathname}${pathSuffix}`,
        demoProjectPath: `/project/${encodedProjectId}${demoSuffix}${pathSuffix}`,
      };
    }

    if (url.pathname === "/demo") {
      const pathSuffix = `${url.search}${url.hash}`;

      return {
        demoTargetPath: `/demo${pathSuffix}`,
        demoProjectPath: `/project/${encodedProjectId}/traces${pathSuffix}`,
      };
    }
  } catch {
    // Fall through to the stable default below.
  }

  return {
    demoTargetPath: "/demo",
    demoProjectPath: `/project/${encodedProjectId}/traces`,
  };
}
