// Langfuse Cloud only. Reached via the link sent with an approved program
// application; intentionally not linked from the navigation.

import { useRouter } from "next/router";
import { useSession } from "next-auth/react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import ContainerPage from "@/src/components/layouts/ContainerPage";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";

import { useIsCloudBillingAvailable } from "../utils/isCloudBilling";
import { CouponProgramSchema } from "../utils/coupons";
import { CouponRedemptionForm } from "./CouponRedemptionForm";

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

  // The organization id comes from the query, which is empty until hydration.
  if (session.status === "loading" || !router.isReady) {
    return <NoDataOrLoading isLoading />;
  }

  if (!organization) {
    return (
      <Alert>
        <Alert.Title>Organization not found</Alert.Title>
        <Alert.Description>
          You are not a member of this organization.
        </Alert.Description>
      </Alert>
    );
  }

  if (!isCloudBillingAvailable) {
    return (
      <Alert>
        <Alert.Title>Not available</Alert.Title>
        <Alert.Description>
          Coupons can only be redeemed on Langfuse Cloud.
        </Alert.Description>
      </Alert>
    );
  }

  if (!hasAccess) {
    return (
      <Alert>
        <Alert.Title>Access denied</Alert.Title>
        <Alert.Description>
          Only organization owners and admins can redeem coupons. Ask one of
          them to open this page.
        </Alert.Description>
      </Alert>
    );
  }

  const billingPath = `/organization/${organization.id}/settings/billing`;
  const clickhouse = organization.cloudConfig?.clickhouse;
  const submitterEmail = session.data?.user?.email;

  if (!clickhouse?.organizationId || !clickhouse.attachedPlanId) {
    const isStripeBilled = Boolean(
      organization.cloudConfig?.stripe?.activeSubscriptionId,
    );
    return (
      <Alert variant="info">
        <Alert.Title>
          {isStripeBilled
            ? "Add your code as a promotion code"
            : "Upgrade to a paid plan first"}
        </Alert.Title>
        <Alert.Description>
          <span className="flex flex-col items-start gap-2">
            {isStripeBilled
              ? "This organization is billed through Stripe. Add the code as a promotion code in the billing settings instead."
              : "Credits are applied to a paid subscription. Choose a plan in the billing settings, then come back to this page to redeem your coupon."}
            <TextLink path={billingPath} value="Open billing settings" />
          </span>
        </Alert.Description>
      </Alert>
    );
  }

  if (!submitterEmail) {
    return (
      <Alert>
        <Alert.Title>Email address required</Alert.Title>
        <Alert.Description>
          Your account needs an email address to redeem a coupon.
        </Alert.Description>
      </Alert>
    );
  }

  const program = CouponProgramSchema.safeParse(router.query.program);
  const couponCode = router.query.code;

  return (
    <CouponRedemptionForm
      orgId={organization.id}
      submitterEmail={submitterEmail}
      clickhouseOrganizationId={clickhouse.organizationId}
      initialValues={{
        program: program.success ? program.data : "",
        couponCode: typeof couponCode === "string" ? couponCode : "",
      }}
    />
  );
}
