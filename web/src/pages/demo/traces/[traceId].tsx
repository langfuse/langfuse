import { type GetServerSideProps, type GetServerSidePropsResult } from "next";

import { env } from "@/src/env.mjs";
import {
  ensureDemoProjectAccess,
  getDemoProjectConfig,
} from "@/src/features/auth/lib/demoProjectAccess";
import { getServerAuthSession } from "@/src/server/auth";

const DemoTraceRedirectPage = () => null;

export default DemoTraceRedirectPage;

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const traceId = getSingleParam(ctx.params?.traceId);
  const demoProjectConfig = getDemoProjectConfig();

  if (!traceId || !demoProjectConfig) {
    return redirect("/");
  }

  const demoTracePath = buildDemoTracePath({
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

  const targetPath = buildRegionalDemoTracePath({
    traceId,
    query: ctx.query,
  });

  return redirect(`${authPath}?targetPath=${encodeURIComponent(targetPath)}`);
};

const buildDemoTracePath = ({
  projectId,
  traceId,
  query,
}: {
  projectId: string;
  traceId: string;
  query: Record<string, string | string[] | undefined>;
}) => {
  const queryString = buildQueryString(query);

  return `/project/${encodeURIComponent(projectId)}/traces/${encodeURIComponent(
    traceId,
  )}${queryString ? `?${queryString}` : ""}`;
};

const buildRegionalDemoTracePath = ({
  traceId,
  query,
}: {
  traceId: string;
  query: Record<string, string | string[] | undefined>;
}) => {
  const queryString = buildQueryString(query);

  return `/demo/traces/${encodeURIComponent(traceId)}${
    queryString ? `?${queryString}` : ""
  }`;
};

const buildQueryString = (
  query: Record<string, string | string[] | undefined>,
) => {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (key === "traceId" || typeof value === "undefined") {
      continue;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => searchParams.append(key, item));
    } else {
      searchParams.set(key, value);
    }
  }

  return searchParams.toString();
};

const getSingleParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const redirect = (destination: string): GetServerSidePropsResult<never> => ({
  redirect: { destination, permanent: false },
});
