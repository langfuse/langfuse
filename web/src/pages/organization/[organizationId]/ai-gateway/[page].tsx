import { type GetServerSideProps } from "next";
import { prisma } from "@langfuse/shared/src/db";

import { GatewayPage } from "@/src/features/ai-gateway/components/GatewayPage/GatewayPage";
import { LEGACY_GATEWAY_PROVIDERS_SLUG } from "@/src/features/ai-gateway/constants/gatewayPageSlugs";
import { buildGatewayProvidersRedirectPath } from "@/src/features/ai-gateway/fns/gatewayUrls/buildLegacyGatewaySettingsPath";
import { getGatewaySetupRedirect } from "@/src/features/ai-gateway/server/gatewaySetupRedirect";
import { getServerAuthSession } from "@/src/server/auth";

export default function GatewaySubPageRoute() {
  return <GatewayPage />;
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const organizationId = ctx.params?.organizationId;
  const slug = ctx.params?.page;
  if (typeof organizationId !== "string" || typeof slug !== "string") {
    return { props: {} };
  }

  if (slug === LEGACY_GATEWAY_PROVIDERS_SLUG) {
    const connectionId = ctx.query.connectionId;
    return {
      redirect: {
        destination: buildGatewayProvidersRedirectPath(
          organizationId,
          typeof connectionId === "string" ? connectionId : undefined,
        ),
        permanent: false,
      },
    };
  }

  const session = await getServerAuthSession({ req: ctx.req, res: ctx.res });
  const destination = await getGatewaySetupRedirect({
    prisma,
    session,
    organizationId,
    slug,
  });
  return destination
    ? { redirect: { destination, permanent: false } }
    : { props: {} };
};
