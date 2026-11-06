import { useRouter } from "next/router";

import ContainerPage from "@/src/components/layouts/ContainerPage";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { PagedSettingsContainer } from "@/src/components/PagedSettingsContainer";
import { FeatureReleaseStatus } from "@/src/components/design-system/FeatureReleaseStatus/FeatureReleaseStatus";
import { GATEWAY_PAGE_SLUGS } from "@/src/features/ai-gateway/constants/gatewayPageSlugs";
import { buildGatewayPagePath } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayPagePath";
import { useGatewayPages } from "@/src/features/ai-gateway/hooks/useGatewayPages";
import { useQueryOrganization } from "@/src/features/organizations/hooks";

const headerProps = {
  title: "AI Gateway",
  titleBadges: <FeatureReleaseStatus status="beta" />,
};

export function GatewayPage() {
  const router = useRouter();
  const organization = useQueryOrganization();
  const pages = useGatewayPages();

  const activeSlug =
    typeof router.query.page === "string" ? router.query.page : undefined;
  const fullHeight = activeSlug !== GATEWAY_PAGE_SLUGS.analytics;

  if (!organization) {
    return (
      <ContainerPage headerProps={headerProps}>
        <NoDataOrLoading isLoading />
      </ContainerPage>
    );
  }

  return (
    <ContainerPage
      headerProps={headerProps}
      extendRight={fullHeight}
      fullHeight={fullHeight}
    >
      <PagedSettingsContainer
        activeSlug={activeSlug}
        pages={pages}
        fullHeight={fullHeight}
        basePath={buildGatewayPagePath(organization.id)}
      />
    </ContainerPage>
  );
}
