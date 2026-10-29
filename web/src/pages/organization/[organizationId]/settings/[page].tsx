import { type GetServerSideProps } from "next";
import { prisma } from "@langfuse/shared/src/db";

import { SettingsPage } from "@/src/features/settings";
import { getGatewaySetupRedirect } from "@/src/features/ai-gateway/server/gatewaySetupRedirect";
import { getServerAuthSession } from "@/src/server/auth";

export default function OrganizationSettingsRoute() {
  return <SettingsPage scope="organization" />;
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const organizationId = ctx.params?.organizationId;
  const slug = ctx.params?.page;
  if (typeof organizationId !== "string" || typeof slug !== "string") {
    return { props: {} };
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
