import {
  type GetServerSidePropsContext,
  type GetServerSidePropsResult,
} from "next";

import { env } from "@/src/env.mjs";
import {
  getAvailableCloudRegionOptions,
  isRegionProduction,
} from "@/src/features/organizations/cloudRegions";
import { getServerAuthSession } from "@/src/server/auth";
import {
  getRequestOrigin,
  readProjectCookie,
} from "@/src/server/utils/cookies";
import { prisma } from "@langfuse/shared/src/db";
import {
  buildDemoTargetPath,
  getDemoProjectPath,
} from "@/src/features/auth/lib/demoProjectAccess";

const redirect = (destination: string): GetServerSidePropsResult<never> => ({
  redirect: { destination, permanent: false },
});

export const getDemoRedirectServerSideProps = async (
  ctx: GetServerSidePropsContext,
  options?: {
    traceId?: string;
  },
): Promise<GetServerSidePropsResult<never>> => {
  const crossRegionDestination = getCrossRegionDestination(
    ctx,
    options?.traceId,
  );
  if (crossRegionDestination) {
    return redirect(crossRegionDestination);
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

  const session = await getServerAuthSession({ req: ctx.req, res: ctx.res });

  if (session?.user) {
    return redirect(
      getDemoProjectPath({
        demoProjectId: demoProject.id,
        traceId: options?.traceId,
      }),
    );
  }

  const authPath =
    env.AUTH_DISABLE_SIGNUP === "true" ||
    env.NEXT_PUBLIC_SIGN_UP_DISABLED === "true"
      ? "/auth/sign-in"
      : "/auth/sign-up";

  const demoTargetPath = buildDemoTargetPath(options?.traceId);
  return redirect(
    `${authPath}?targetPath=${encodeURIComponent(demoTargetPath)}`,
  );
};

const getCrossRegionDestination = (
  ctx: GetServerSidePropsContext,
  traceId?: string,
): string | null => {
  const currentRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  if (!currentRegion || !isRegionProduction(currentRegion)) {
    return null;
  }

  const currentOrigin = getRequestOrigin(ctx.req);
  if (!currentOrigin) {
    return null;
  }

  const resolvedUrl = ctx.resolvedUrl || buildDemoTargetPath(traceId);
  const projectCookie = readProjectCookie(ctx.req.cookies ?? {});
  if (
    projectCookie &&
    projectCookie.origin !== currentOrigin &&
    sameRegistrableDomain(projectCookie.origin, currentOrigin)
  ) {
    return `${projectCookie.origin}${resolvedUrl}`;
  }

  const sessionOrigins = getSessionOrigins(ctx.req.cookies ?? {});
  if (sessionOrigins.length === 0 || sessionOrigins.includes(currentOrigin)) {
    return null;
  }

  const preferredOrigin = sessionOrigins[0];
  if (!sameRegistrableDomain(preferredOrigin, currentOrigin)) {
    return null;
  }

  return `${preferredOrigin}${resolvedUrl}`;
};

const getSessionOrigins = (
  cookies: Partial<Record<string, string>>,
): string[] =>
  getAvailableCloudRegionOptions().flatMap((region) => {
    if (!region.rootUrl) {
      return [];
    }

    if (!hasSessionCookieForRegion(cookies, region.name)) {
      return [];
    }

    try {
      return [new URL(region.rootUrl).origin];
    } catch {
      return [];
    }
  });

const hasSessionCookieForRegion = (
  cookies: Partial<Record<string, string>>,
  regionName: string,
): boolean => {
  const baseCookieNames = [
    `__Secure-next-auth.session-token.${regionName}`,
    `next-auth.session-token.${regionName}`,
  ];

  return Object.keys(cookies).some((cookieName) =>
    baseCookieNames.some(
      (baseName) =>
        cookieName === baseName || cookieName.startsWith(`${baseName}.`),
    ),
  );
};

const sameRegistrableDomain = (originA: string, originB: string): boolean => {
  const registrableDomain = (origin: string): string | null => {
    try {
      return new URL(origin).hostname.split(".").slice(-2).join(".");
    } catch {
      return null;
    }
  };
  const domainA = registrableDomain(originA);
  const domainB = registrableDomain(originB);
  return domainA !== null && domainA === domainB;
};
