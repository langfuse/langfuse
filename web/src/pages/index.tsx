import { type GetServerSideProps } from "next";

import { NoOrganizationPage } from "@/src/features/organizations/components/NoOrganizationPage";
import { OrganizationLandingService } from "@/src/features/organizations/server/organizationLandingService";
import { getServerAuthSession } from "@/src/server/auth";
import {
  getRequestOrigin,
  readProjectCookie,
} from "@/src/server/utils/cookies";

export default function Home() {
  return <NoOrganizationPage />;
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerAuthSession({ req: ctx.req, res: ctx.res });
  if (!session?.user) return { props: {} };

  const cookie = readProjectCookie(ctx.req.cookies ?? {});
  const lastProjectId =
    cookie && cookie.origin === getRequestOrigin(ctx.req)
      ? cookie.projectId
      : null;
  const destination = new OrganizationLandingService(session).landingPath(
    lastProjectId,
  );
  if (!destination) return { props: {} };
  return { redirect: { destination, permanent: false } };
};
