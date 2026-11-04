import { type GetServerSideProps } from "next";

import { SettingsPage } from "@/src/features/settings/SettingsPage";
import { getLegacyGatewaySettingsRedirect } from "@/src/features/ai-gateway/server/gatewaySetupRedirect";

export default function OrganizationSettingsRoute() {
  return <SettingsPage scope="organization" />;
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const organizationId = ctx.params?.organizationId;
  const slug = ctx.params?.page;
  if (typeof organizationId !== "string" || typeof slug !== "string") {
    return { props: {} };
  }

  const search = ctx.resolvedUrl.includes("?")
    ? ctx.resolvedUrl.slice(ctx.resolvedUrl.indexOf("?"))
    : "";
  const destination = getLegacyGatewaySettingsRedirect(
    organizationId,
    slug,
    search,
  );
  return destination
    ? { redirect: { destination, permanent: false } }
    : { props: {} };
};
