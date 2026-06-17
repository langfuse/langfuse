import { type GetServerSideProps } from "next";

import { getServerAuthSession } from "@/src/server/auth";

export default function RedirectToFirstProject() {
  return null;
}

/** getServerSideProps redirects to the Nth project the user has access to, preserving the sub-path. */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerAuthSession({
    req: ctx.req,
    res: ctx.res,
  });

  if (!session?.user) {
    return {
      redirect: {
        destination: `/auth/sign-in?callbackUrl=${encodeURIComponent(ctx.resolvedUrl)}`,
        permanent: false,
      },
    };
  }

  const allProjects = session.user.organizations.flatMap((org) => org.projects);

  const rawPath = ctx.params?.path ?? [];
  const index =
    rawPath.length > 0 && /^\d+$/.test(rawPath[0]!)
      ? parseInt(rawPath[0]!, 10)
      : 0;
  const path = index === 0 ? rawPath : rawPath.slice(1);

  const project = allProjects.at(index);
  if (!project) {
    return { redirect: { destination: "/", permanent: false } };
  }

  const destination = ["/project", project.id, ...path].join("/");

  return { redirect: { destination, permanent: false } };
};
