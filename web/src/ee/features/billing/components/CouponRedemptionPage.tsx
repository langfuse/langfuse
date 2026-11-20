// Langfuse Cloud only. Reached via the link sent with a coupon code;
// intentionally not linked from the navigation.

import { useRouter } from "next/router";
import { useSession } from "next-auth/react";

import { Banner } from "@/src/components/design-system/Banner/Banner";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import ContainerPage from "@/src/components/layouts/ContainerPage";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";

import { useIsCloudBillingAvailable } from "../utils/isCloudBilling";
import { CouponRedemptionForm } from "./CouponRedemptionForm";
import { useBillingProvider } from "./useBillingProvider";

export function CouponRedemptionPage() {
  const organization = useQueryOrganization();
  const billingPath = organization
    ? `/organization/${organization.id}/settings/billing`
    : null;

  return (
    <ContainerPage
      headerProps={{
        title: "Redeem coupon",
        ...(billingPath && {
          breadcrumb: [{ name: "Billing", href: billingPath }],
        }),
      }}
    >
      <CouponRedemptionContent />
    </ContainerPage>
  );
}

function CouponRedemptionContent() {
  const router = useRouter();
  const session = useSession();
  const organization = useQueryOrganization();
  const isCloudBillingAvailable = useIsCloudBillingAvailable();
  const hasAccess = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "langfuseCloudBilling:CRUD",
  });
  // Checkout routes by the server-resolved provider, so this page does too.
  const billingProvider = useBillingProvider({
    orgId: organization?.id,
    enabled: isCloudBillingAvailable && hasAccess,
  });

  // The organization id comes from the query, which is empty until hydration.
  if (session.status === "loading" || !router.isReady) {
    return <PageSpinner />;
  }

  if (!organization) {
    return (
      <Banner title="Organization not found">
        You are not a member of this organization.
      </Banner>
    );
  }

  if (!isCloudBillingAvailable) {
    return (
      <Banner title="Not available">
        Coupons can only be redeemed on Langfuse Cloud.
      </Banner>
    );
  }

  if (!hasAccess) {
    return (
      <Banner title="Access denied">
        Only organization owners can redeem coupons. Ask an owner of this
        organization to open this page.
      </Banner>
    );
  }

  if (billingProvider.isPending) {
    return <PageSpinner />;
  }

  const billingPath = `/organization/${organization.id}/settings/billing`;
  const clickhouse = organization.cloudConfig?.clickhouse;
  const submitterEmail = session.data?.user?.email;
  const isStripeBilled =
    (billingProvider.data ??
      (clickhouse?.organizationId ? "clickhouse" : "stripe")) === "stripe";

  if (isStripeBilled) {
    return (
      <Banner
        variant="info"
        title="Apply your coupon at checkout"
        actions={[{ text: "Open billing settings", href: billingPath }]}
      >
        This organization is billed through Stripe. Enter the code when you
        check out, or add it in the billing portal if you already have a
        subscription. Both are in the billing settings.
      </Banner>
    );
  }

  if (!clickhouse?.organizationId || !clickhouse.attachedPlanId) {
    return (
      <Banner
        variant="info"
        title="Upgrade to a paid plan first"
        actions={[{ text: "Open billing settings", href: billingPath }]}
      >
        Credits are applied to a paid subscription. Choose a plan in the billing
        settings, then come back to this page to redeem your coupon.
      </Banner>
    );
  }

  if (!submitterEmail) {
    return (
      <Banner title="Email address required">
        Your account needs an email address to redeem a coupon.
      </Banner>
    );
  }

  // The credit-request form needs both name parts; the account has one name.
  const [firstName = "", ...lastNameParts] = (session.data?.user?.name ?? "")
    .trim()
    .split(/\s+/);

  return (
    <CouponRedemptionForm
      key={organization.id}
      orgId={organization.id}
      orgName={organization.name}
      clickhouseOrganizationId={clickhouse.organizationId}
      submitterEmail={submitterEmail}
      initialName={{ firstName, lastName: lastNameParts.join(" ") }}
    />
  );
}

function PageSpinner() {
  return (
    <div className="flex justify-center py-12">
      <Spinner variant="muted" size="lg" />
    </div>
  );
}
