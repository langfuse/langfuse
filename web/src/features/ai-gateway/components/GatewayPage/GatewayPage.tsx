import { useRouter } from "next/router";

import { ErrorPage } from "@/src/components/error-page";
import Page from "@/src/components/layouts/Page";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { FeatureReleaseStatus } from "@/src/components/design-system/FeatureReleaseStatus/FeatureReleaseStatus";
import { GATEWAY_PAGE_SLUGS } from "@/src/features/ai-gateway/constants/gatewayPageSlugs";
import { useGatewayPages } from "@/src/features/ai-gateway/hooks/useGatewayPages";
import { useQueryOrganization } from "@/src/features/organizations/hooks";

const GATEWAY_TITLE = "AI Gateway";
const titleBadges = <FeatureReleaseStatus status="beta" />;

/** An AI Gateway sub-page; the sidebar lists the sub-pages. */
export function GatewayPage() {
  const router = useRouter();
  const organization = useQueryOrganization();
  const pages = useGatewayPages();

  const requestedSlug =
    typeof router.query.page === "string"
      ? router.query.page
      : GATEWAY_PAGE_SLUGS.overview;

  if (!organization) {
    return (
      <Page withPadding headerProps={{ title: GATEWAY_TITLE, titleBadges }}>
        <NoDataOrLoading isLoading />
      </Page>
    );
  }

  const visiblePages = pages.filter((page) => page.show);
  const page =
    visiblePages.find((visiblePage) => visiblePage.slug === requestedSlug) ??
    visiblePages[0];
  if (!page) {
    return (
      <ErrorPage
        title="AI Gateway is not available"
        message="AI Gateway is not enabled for this organization, or your role has no access to it."
      />
    );
  }

  return (
    <Page
      withPadding
      scrollable={page.scrollable}
      headerProps={{
        title: page.title,
        titleBadges,
        tabsProps: page.tabsProps,
        hideTitleRow: page.hideTitle,
      }}
    >
      {page.content}
    </Page>
  );
}
