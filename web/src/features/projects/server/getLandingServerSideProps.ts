import {
  type GetServerSidePropsContext,
  type GetServerSidePropsResult,
} from "next";

import { env } from "@/src/env.mjs";
import { hasOrganizationAccess } from "@/src/features/rbac";
import { getServerAuthSession } from "@/src/server/auth";
import {
  getRequestOrigin,
  readProjectCookie,
  type ProjectCookie,
} from "@/src/server/utils/cookies";
import { readLastVisitedProject } from "./lastVisitedProject";
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

/** Carries `/`'s query string over when the destination has none of its own. */
function withForwardedQuery(destination: string, resolvedUrl: string): string {
  const queryStart = resolvedUrl.indexOf("?");
  if (queryStart === -1 || destination.includes("?")) return destination;
  return `${destination}${resolvedUrl.slice(queryStart)}`;
}

/**
 * Server-side redirect for `/`, so a signed-in user opens straight into their
 * last project instead of an organization picker. Signed-out requests render
 * the page and let the client auth guard handle sign-in as before.
 */
export async function getLandingServerSideProps(
  ctx: GetServerSidePropsContext,
): Promise<GetServerSidePropsResult<LandingProps>> {
  const session = await getServerAuthSession({ req: ctx.req, res: ctx.res });
  const user = session?.user;
  if (!user) return { props: {} };

  const organizations = user.organizations.map((organization) => ({
    id: organization.id,
    projectIds: organization.projects.map((project) => project.id),
    canCreateProjects: hasOrganizationAccess({
      session,
      organizationId: organization.id,
      scope: "projects:create",
    }),
  }));
  const browserProjectId = projectIdFromCookie({
    cookie: readProjectCookie(ctx.req.cookies ?? {}),
    origin: getRequestOrigin(ctx.req),
    userId: user.id,
  });
  // The browser cookie is fresher than the per-user record, so the record is
  // only read when the cookie is missing or names a project that is gone.
  const browserProjectIsReadable = organizations.some(
    (organization) =>
      browserProjectId !== null &&
      organization.projectIds.includes(browserProjectId),
  );
  const serverProjectId = browserProjectIsReadable
    ? null
    : await readLastVisitedProject(user.id);

  const destination = resolveLandingDestination({
    organizations,
    rememberedProjectIds: [browserProjectId, serverProjectId],
    canCreateOrganizations: user.canCreateOrganizations,
    demoOrganizationId: env.NEXT_PUBLIC_DEMO_ORG_ID ?? null,
  });

  return {
    redirect: {
      destination: withForwardedQuery(destination, ctx.resolvedUrl),
      permanent: false,
    },
  };
}
