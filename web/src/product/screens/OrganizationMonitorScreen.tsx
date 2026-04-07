import { useRouter } from "next/router";
import { OrganizationFrame } from "../frames/OrganizationFrame";
import { PlaceholderPage } from "../shell/PlaceholderPage";
import {
  PLACEHOLDER_COPY,
  getOrganizationMonitorBreadcrumbs,
  getOrganizationPreviewHref,
} from "../shell/product-manifest";

export default function OrganizationMonitorScreen() {
  const router = useRouter();
  const organizationId = router.query.organizationId as string | undefined;

  if (!router.isReady || !organizationId) {
    return null;
  }

  return (
    <OrganizationFrame
      organizationId={organizationId}
      title="Organization Monitor"
      breadcrumbs={getOrganizationMonitorBreadcrumbs(organizationId)}
    >
      <PlaceholderPage
        label="Organization Monitor"
        description={PLACEHOLDER_COPY.organizationMonitor}
        route={getOrganizationPreviewHref(organizationId)}
      />
    </OrganizationFrame>
  );
}
