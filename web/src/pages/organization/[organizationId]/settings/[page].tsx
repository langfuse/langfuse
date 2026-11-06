import { type GetServerSideProps } from "next";

import { SettingsPage } from "@/src/features/settings/SettingsPage";
import {
  GATEWAY_PAGE_SLUGS,
  type GatewayPageSlug,
} from "@/src/features/ai-gateway/constants/gatewayPageSlugs";
import { buildGatewayPagePath } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayPagePath";

export default function OrganizationSettingsRoute() {
  return <SettingsPage scope="organization" />;
}

/** Former settings slugs of the AI Gateway pages, e.g. from Cmd+K recents. */
const LEGACY_GATEWAY_SETTINGS_SLUGS = new Map<string, GatewayPageSlug>([
  ["ai-gateway", GATEWAY_PAGE_SLUGS.setup],
  ["ai-gateway-models", GATEWAY_PAGE_SLUGS.models],
  ["ai-gateway-api-keys", GATEWAY_PAGE_SLUGS.apiKeys],
  ["ai-gateway-analytics", GATEWAY_PAGE_SLUGS.analytics],
]);

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const organizationId = ctx.params?.organizationId;
  const slug = ctx.params?.page;
  const gatewaySlug =
    typeof slug === "string"
      ? LEGACY_GATEWAY_SETTINGS_SLUGS.get(slug)
      : undefined;
  if (typeof organizationId !== "string" || !gatewaySlug) {
    return { props: {} };
  }
  return {
    redirect: {
      destination: buildGatewayPagePath(organizationId, gatewaySlug),
      permanent: false,
    },
  };
};
