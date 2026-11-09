import { type GetServerSideProps } from "next";

import { SettingsPage } from "@/src/features/settings/SettingsPage";
import { buildLegacyGatewaySettingsPath } from "@/src/features/ai-gateway/fns/gatewayUrls/buildLegacyGatewaySettingsPath";

export default function OrganizationSettingsRoute() {
  return <SettingsPage scope="organization" />;
}

/** Redirects here, unlike `next.config` redirects, also apply to client-side navigation. */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const organizationId = ctx.params?.organizationId;
  const slug = ctx.params?.page;
  if (typeof organizationId !== "string" || typeof slug !== "string") {
    return { props: {} };
  }

  const connectionId = ctx.query.connectionId;
  const destination = buildLegacyGatewaySettingsPath(
    organizationId,
    slug,
    typeof connectionId === "string" ? connectionId : undefined,
  );
  return destination
    ? { redirect: { destination, permanent: false } }
    : { props: {} };
};
