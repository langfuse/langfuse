import { type GetServerSideProps } from "next";

import { getServerAuthSession } from "@/src/server/auth";
import {
  getRequestOrigin,
  readLastProjectCookie,
} from "@/src/server/utils/cookies";

/** RedirectToFirstProject renders nothing; all logic runs in getServerSideProps. */
export default function RedirectToFirstProject() {
  return null;
}

/** getServerSideProps resolves the project sentinel: cookie project, cross-region bounce, then first-project fallback. */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerAuthSession({ req: ctx.req, res: ctx.res });

  if (!session?.user) {
    return {
      redirect: {
        destination: `/auth/sign-in?callbackUrl=${encodeURIComponent(ctx.resolvedUrl)}`,
        permanent: false,
      },
    };
  }

  const path = (ctx.params?.path as string[] | undefined) ?? [];
  const queryString = ctx.resolvedUrl.includes("?")
    ? `?${ctx.resolvedUrl.split("?").slice(1).join("?")}`
    : "";
  const encodedPath = path.map(encodeURIComponent);

  const projectIds = new Set(
    session.user.organizations.flatMap((org) => org.projects).map((p) => p.id),
  );

  const cookie = readLastProjectCookie(ctx.req.cookies ?? {});
  const currentOrigin = getRequestOrigin(ctx.req);

  if (cookie && currentOrigin) {
    if (cookie.origin === currentOrigin) {
      if (projectIds.has(cookie.projectId)) {
        return {
          redirect: {
            destination:
              ["/project", cookie.projectId, ...encodedPath].join("/") +
              queryString,
            permanent: false,
          },
        };
      }
    } else if (sameRegistrableDomain(cookie.origin, currentOrigin)) {
      return {
        redirect: {
          destination:
            [cookie.origin, "project", "~", ...encodedPath].join("/") +
            queryString,
          permanent: false,
        },
      };
    }
  }

  const firstProjectId = session.user.organizations
    .flatMap((org) => org.projects)
    .at(0)?.id;

  if (!firstProjectId) {
    return { redirect: { destination: "/", permanent: false } };
  }

  return {
    redirect: {
      destination:
        ["/project", firstProjectId, ...encodedPath].join("/") + queryString,
      permanent: false,
    },
  };
};

/** sameRegistrableDomain returns true when two origins share the last-two-label registrable domain. */
function sameRegistrableDomain(originA: string, originB: string): boolean {
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
}
