import {
  type GetServerSideProps,
  type GetServerSidePropsContext,
  type GetServerSidePropsResult,
} from "next";

import { getServerAuthSession } from "@/src/server/auth";
import { type Session } from "next-auth";
import {
  getRequestOrigin,
  readProjectCookie,
  type ProjectCookie,
} from "@/src/server/utils/cookies";

/** RedirectToFirstProject renders nothing; all logic runs in getServerSideProps. */
const RedirectToFirstProject = () => null;
export default RedirectToFirstProject;

/** getServerSideProps resolves the project sentinel: cross-region bounce, sign-in gate, then project redirect. */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const sCtx = parseSentinelRequest(ctx);

  const crossRegion = crossRegionRedirect(sCtx);
  if (crossRegion) return crossRegion;

  const signIn = await signInRedirect(sCtx);
  if (signIn) return signIn;

  return projectRedirect(sCtx);
};

/** parseSentinelRequest reads the cookie, origin, and resolved URL the sentinel needs, deferring the session to a memoized fetch. */
const parseSentinelRequest = (
  ctx: GetServerSidePropsContext,
): SentinelContext => {
  let session: Promise<Session | null> | undefined;
  return {
    cookie: readProjectCookie(ctx.req.cookies ?? {}),
    origin: getRequestOrigin(ctx.req),
    resolvedUrl: ctx.resolvedUrl,
    getSession: () =>
      (session ??= getServerAuthSession({ req: ctx.req, res: ctx.res })),
  };
};

/** crossRegionRedirect bounces to the cookie's origin when it is a sibling region the session lives on. */
const crossRegionRedirect = (req: SentinelContext) => {
  const { cookie, origin, resolvedUrl } = req;
  if (
    cookie &&
    origin &&
    cookie.origin !== origin &&
    sameRegistrableDomain(cookie.origin, origin)
  ) {
    return redirect(`${cookie.origin}${resolvedUrl}`);
  }
};

/** signInRedirect sends the user to sign-in, returning to the sentinel URL afterward. */
const signInRedirect = async ({ getSession, resolvedUrl }: SentinelContext) => {
  const session = await getSession();
  if (!session?.user)
    return redirect(
      `/auth/sign-in?callbackUrl=${encodeURIComponent(resolvedUrl)}`,
    );
};

/** projectRedirect resolves to the last visited project, the first accessible project, or home if no projects are available. */
const projectRedirect = async ({
  cookie,
  origin,
  resolvedUrl,
  getSession,
}: SentinelContext) => {
  const session = await getSession();
  const rest = resolvedUrl.slice(sentinelPathPrefix.length);
  const projects =
    session?.user?.organizations.flatMap((org) => org.projects) ?? [];

  if (cookie && origin && cookie.origin === origin) {
    if (projects.some((p) => p.id === cookie.projectId)) {
      return redirect(`/project/${cookie.projectId}${rest}`);
    }
  }

  const firstProjectId = projects.at(0)?.id;
  if (!firstProjectId) return redirect("/");

  return redirect(`/project/${firstProjectId}${rest}`);
};

/** redirect wraps a destination in a non-permanent getServerSideProps redirect result. */
const redirect = (destination: string): GetServerSidePropsResult<never> => ({
  redirect: { destination, permanent: false },
});

/** sameRegistrableDomain returns true when two origins share the last-two-label registrable domain. */
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

/** sentinelPathPrefix is the route prefix stripped to recover the trailing path and query. */
const sentinelPathPrefix = "/project/~";

/** SentinelContext holds the request-derived inputs every redirect step reads. */
type SentinelContext = {
  cookie: ProjectCookie | null;
  origin: string | null;
  resolvedUrl: string;
  getSession: () => Promise<Session | null>;
};
