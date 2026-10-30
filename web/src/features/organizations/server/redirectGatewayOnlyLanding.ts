import { type GetServerSideProps } from "next";

import { gatewayOnlyLanding } from "@/src/features/organizations/utils/gatewayOnlyLanding";
import { getServerAuthSession } from "@/src/server/auth";

/** redirectGatewayOnlyLanding sends members who can only use the AI Gateway to their org settings */
export const redirectGatewayOnlyLanding: GetServerSideProps = async (ctx) => {
  const session = await getServerAuthSession({ req: ctx.req, res: ctx.res });
  const landing = gatewayOnlyLanding(session, ctx.query.organizationId);
  if (!landing?.canUseGateway) return { props: {} };
  return {
    redirect: {
      destination: `/organization/${encodeURIComponent(landing.organizationId)}/settings`,
      permanent: false,
    },
  };
};
