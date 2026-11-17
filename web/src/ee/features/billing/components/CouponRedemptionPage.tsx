// Langfuse Cloud only. Reached via the link sent with an approved program
// application; intentionally not linked from the navigation.

import { useRouter } from "next/router";
import { useSession } from "next-auth/react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import ContainerPage from "@/src/components/layouts/ContainerPage";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { api } from "@/src/utils/api";

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
  // Checkout routes by the server-resolved provider, so this page does too.
  const billingProvider = api.cloudBilling.getBillingProvider.useQuery(
    { orgId: organization?.id ?? "" },
    { enabled: Boolean(organization) && isCloudBillingAvailable && hasAccess },
  );

  // The organization id comes from the query, which is empty until hydration.
  if (session.status === "loading" || !router.isReady) {
    return <PageSpinner />;
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
          Only organization owners can redeem coupons. Ask an owner of this
          organization to open this page.
        </Alert.Description>
      </Alert>
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
      <Alert variant="info">
        <Alert.Title>Apply your coupon at checkout</Alert.Title>
        <Alert.Description>
          <span className="flex flex-col items-start gap-2">
            This organization is billed through Stripe. Enter the code when you
            check out, or add it in the billing portal if you already have a
            subscription. Both are in the billing settings.
            <TextLink path={billingPath} value="Open billing settings" />
          </span>
        </Alert.Description>
      </Alert>
    );
  }

  if (!clickhouse?.organizationId || !clickhouse.attachedPlanId) {
    return (
      <Alert variant="info">
        <Alert.Title>Upgrade to a paid plan first</Alert.Title>
        <Alert.Description>
          <span className="flex flex-col items-start gap-2">
            Credits are applied to a paid subscription. Choose a plan in the
            billing settings, then come back to this page to redeem your coupon.
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

  // Only the program comes from the link. Codes are shared per program, so
  // they stay out of URLs, where analytics, logs, and history would keep them.
  const program = CouponProgramSchema.safeParse(router.query.program);
  // The credit-request form needs both name parts; the account has one name.
  const [firstName = "", ...lastNameParts] = (session.data?.user?.name ?? "")
    .trim()
    .split(/\s+/);

  return (
    <CouponRedemptionForm
      key={organization.id}
      orgId={organization.id}
      submitterEmail={submitterEmail}
      clickhouseOrganizationId={clickhouse.organizationId}
      initialValues={{
        program: program.success ? program.data : "",
        couponCode: "",
        firstName,
        lastName: lastNameParts.join(" "),
      }}
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
