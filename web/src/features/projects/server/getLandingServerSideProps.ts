import {
  type GetServerSidePropsContext,
  type GetServerSidePropsResult,
} from "next";

import { prisma } from "@langfuse/shared/src/db";
import { env } from "@/src/env.mjs";
import { gatewayOnlyLanding } from "@/src/features/organizations/utils/gatewayOnlyLanding";
import { getSignupOnboardingStatus } from "@/src/features/onboarding/server/onboardingService";
import { hasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { getServerAuthSession } from "@/src/server/auth";
import {
  getRequestOrigin,
  readProjectCookie,
  serializeClearedProjectCookie,
  type ProjectCookie,
} from "@/src/server/utils/cookies";
import {
  forgetLastVisitedProject,
  readLastVisitedProject,
} from "./lastVisitedProject";
import { resolveLandingDestination } from "./resolveLandingDestination";

type LandingProps = Record<string, never>;

/** Trusts the cookie only for this origin and for the user who set it; legacy cookies carry no user. */
function projectIdFromCookie({
  cookie,
  origin,
  userId,
}: {
  cookie: ProjectCookie | null;
  origin: string | null;
  userId: string;
}): string | null {
  if (!cookie || !origin || cookie.origin !== origin) return null;
  if (cookie.userId !== undefined && cookie.userId !== userId) return null;
  return cookie.projectId;
}

/** Carries `/`'s query string over, keeping destination-owned parameters authoritative. */
function withForwardedQuery(destination: string, resolvedUrl: string): string {
  const queryStart = resolvedUrl.indexOf("?");
  if (queryStart === -1) return destination;
  if (!destination.includes("?")) {
    return `${destination}${resolvedUrl.slice(queryStart)}`;
  }
  const [pathname, destinationQuery] = destination.split("?");
  const params = new URLSearchParams(destinationQuery);
  const destinationKeys = new Set(params.keys());
  for (const [key, value] of new URLSearchParams(
    resolvedUrl.slice(queryStart + 1),
  )) {
    if (!destinationKeys.has(key)) params.append(key, value);
  }
  return `${pathname}?${params.toString()}`;
}

/**
 * Server-side redirect for `/`, so a signed-in user opens straight into their
 * last project instead of an organization picker; see
 * `resolveLandingDestination` for what happens without one. Signed-out
 * requests render the page and let the client auth guard handle sign-in.
 */
export async function getLandingServerSideProps(
  ctx: GetServerSidePropsContext,
): Promise<GetServerSidePropsResult<LandingProps>> {
  const session = await getServerAuthSession({ req: ctx.req, res: ctx.res });
  const user = session?.user;
  if (!user) return { props: {} };

  const organizations = user.organizations.map((organization) => ({
    id: organization.id,
    projects: organization.projects.map((project) => ({
      id: project.id,
      hasTraces: project.hasTraces,
    })),
    canOpen:
      gatewayOnlyLanding(session, organization.id)?.canUseGateway !== false,
    canCreateProjects: hasOrganizationAccess({
      session,
      organizationId: organization.id,
      scope: "projects:create",
    }),
  }));
  const isReadable = (projectId: string) =>
    organizations.some(
      (organization) =>
        organization.id !== env.NEXT_PUBLIC_DEMO_ORG_ID &&
        organization.projects.some((project) => project.id === projectId),
    );
  const browserProjectId = projectIdFromCookie({
    cookie: readProjectCookie(ctx.req.cookies ?? {}),
    origin: getRequestOrigin(ctx.req),
    userId: user.id,
  });
  // The browser cookie is fresher than the per-user record, so the record is
  // only read when the cookie is missing or names a project that is gone.
  const serverProjectId =
    browserProjectId !== null && isReadable(browserProjectId)
      ? null
      : await readLastVisitedProject(user.id);

  const decision = await resolveLandingDestination({
    organizations,
    rememberedProjectIds: [browserProjectId, serverProjectId],
    canCreateOrganizations: user.canCreateOrganizations,
    demoOrganizationId: env.NEXT_PUBLIC_DEMO_ORG_ID ?? null,
    hasPendingSignupOnboarding: async () =>
      !(
        await getSignupOnboardingStatus({
          prisma,
          userId: user.id,
          canCreateOrganizations: user.canCreateOrganizations,
        })
      ).completed,
  });

  if (decision.shouldForgetRememberedProject) {
    if (browserProjectId !== null) {
      ctx.res.appendHeader("Set-Cookie", serializeClearedProjectCookie());
    }
    await forgetLastVisitedProject(user.id);
  }

  return {
    redirect: {
      destination: withForwardedQuery(decision.destination, ctx.resolvedUrl),
      permanent: false,
    },
  };
}
