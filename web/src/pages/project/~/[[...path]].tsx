import { type GetServerSideProps } from "next";

import { getServerAuthSession } from "@/src/server/auth";

export default function RedirectToFirstProject() {
  return null;
}

/** getServerSideProps redirects to the first project the user has access to, preserving the sub-path. */
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

  const firstProject = session.user.organizations
    .flatMap((org) => org.projects)
    .at(0);

  if (!firstProject) {
    return { redirect: { destination: "/", permanent: false } };
  }

  const path = (ctx.params?.path as string[] | undefined) ?? [];
  const destination = ["/project", firstProject.id, ...path].join("/");

  return { redirect: { destination, permanent: false } };
};
