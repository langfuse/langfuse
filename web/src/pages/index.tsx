import { type GetServerSideProps } from "next";

import { NoOrganizationPage } from "@/src/features/organizations/components/NoOrganizationPage";
import { OrganizationLandingService } from "@/src/features/organizations/server/organizationLandingService";
import { getServerAuthSession } from "@/src/server/auth";
import {
  getRequestOrigin,
  readOrganizationCookie,
  readProjectCookie,
} from "@/src/server/utils/cookies";

export default function Home() {
  return <NoOrganizationPage />;
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerAuthSession({ req: ctx.req, res: ctx.res });
  if (!session?.user) return { props: {} };

  const cookies = ctx.req.cookies ?? {};
  const origin = getRequestOrigin(ctx.req);
  const organizationCookie = readOrganizationCookie(cookies);
  const projectCookie = readProjectCookie(cookies);
  const destination = new OrganizationLandingService(session).landingPath({
    organizationId:
      organizationCookie?.origin === origin
        ? organizationCookie.organizationId
        : null,
    projectId:
      projectCookie?.origin === origin ? projectCookie.projectId : null,
  });
  if (!destination) return { props: {} };
  return { redirect: { destination, permanent: false } };
};
