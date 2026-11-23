// Langfuse Cloud only

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useSession } from "next-auth/react";
import { ENTERPRISE_TRIAL_UNIT_LIMIT, planLabels } from "@langfuse/shared";

import ContainerPage from "@/src/components/layouts/ContainerPage";
import { Banner } from "@/src/components/design-system/Banner/Banner";
import { Button } from "@/src/components/design-system/Button/Button";
import { Form } from "@/src/components/design-system/Form/Form";
import { useIsCloudBillingAvailable } from "@/src/ee/features/billing/utils/isCloudBilling";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { api, reportTrpcErrorWithoutToast } from "@/src/utils/api";
import { numberFormatter } from "@/src/utils/numbers";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

type SessionOrganization = NonNullable<ReturnType<typeof useQueryOrganization>>;

/**
 * Lets an org owner start the enterprise trial with a coupon code. Reached only
 * by a link that sales shares, so it is not part of the navigation.
 */
export function EnterpriseTrialPage() {
  const organization = useQueryOrganization();
  const isCloudBillingAvailable = useIsCloudBillingAvailable();

  return (
    <ContainerPage headerProps={{ title: "Enterprise trial" }}>
      <div className="max-w-xl">
        {!isCloudBillingAvailable && (
          <Banner title="Not available">
            Enterprise trials are only available on Langfuse Cloud.
          </Banner>
        )}
        {isCloudBillingAvailable && organization && (
          <EnterpriseTrialContent organization={organization} />
        )}
      </div>
    </ContainerPage>
  );
}

function EnterpriseTrialContent({
  organization,
}: {
  organization: SessionOrganization;
}) {
  const hasAccess = useHasOrganizationAccess({
    organizationId: organization.id,
    scope: "langfuseCloudBilling:CRUD",
  });

  if (!hasAccess) {
    return (
      <Banner title="Access denied">
        Only organization owners can start an enterprise trial.
      </Banner>
    );
  }

  const trialEndsAt = organization.cloudConfig?.enterpriseTrial?.endsAt;
  if (organization.plan === "cloud:enterprise-trial" && trialEndsAt) {
    return (
      <div className="flex flex-col items-start gap-4">
        <Banner variant="info" title="Your enterprise trial is active">
          {`All Enterprise features are available until ${formatDate(trialEndsAt)}. After that, the organization returns to the Hobby plan. Ingestion pauses at ${numberFormatter(ENTERPRISE_TRIAL_UNIT_LIMIT, 0)} units per billing period.`}
        </Banner>
        <Button
          text="View usage and billing"
          variant="secondary"
          href={`/organization/${organization.id}/settings/billing`}
        />
      </div>
    );
  }
  if (organization.plan !== "cloud:hobby") {
    return (
      <Banner title="Already on a paid plan">
        {`This organization is on the ${planLabels[organization.plan]} plan. Enterprise trials are only available to organizations on the Hobby plan; reach out to your Langfuse contact to try Enterprise features.`}
      </Banner>
    );
  }
  if (trialEndsAt) {
    return (
      <Banner title="Trial already used">
        {`This organization's enterprise trial ended on ${formatDate(trialEndsAt)}. Upgrade to a paid plan in the billing settings to keep using Enterprise features.`}
      </Banner>
    );
  }

  return <RedeemEnterpriseTrialForm orgId={organization.id} />;
}

const redeemTrialFormSchema = z.object({
  code: z.string().trim().min(1, "Enter your coupon code").max(256),
});

type RedeemTrialFormInput = z.input<typeof redeemTrialFormSchema>;
type RedeemTrialFormOutput = z.output<typeof redeemTrialFormSchema>;

function RedeemEnterpriseTrialForm({ orgId }: { orgId: string }) {
  const session = useSession();
  const capture = usePostHogClientCapture();
  const form = useForm<RedeemTrialFormInput, undefined, RedeemTrialFormOutput>({
    resolver: zodResolver(redeemTrialFormSchema),
    defaultValues: { code: "" },
  });
  const redeem = api.cloudBilling.redeemEnterpriseTrial.useMutation({
    // The error is shown under the field instead of as a toast.
    onError: (error) => {
      reportTrpcErrorWithoutToast(error, "enterprise-trial.redeem");
      form.setError("code", { message: error.message }, { shouldFocus: true });
    },
    onSuccess: async (trial) => {
      capture("organization_settings:enterprise_trial_redeemed");
      showSuccessToast({
        operation: "cloudBilling.redeemEnterpriseTrial",
        title: "Enterprise trial started",
        description: `All Enterprise features are available until ${formatDate(trial.endsAt)}.`,
      });
      // Reloads the org's plan into the session, which switches this page to
      // the active-trial view.
      await session.update();
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm">
        {`Try every Enterprise feature, such as SSO, SCIM, audit logs and unlimited members, with no payment method needed. Your coupon code sets how long the trial lasts; when it ends, the organization returns to the Hobby plan. Ingestion pauses at ${numberFormatter(ENTERPRISE_TRIAL_UNIT_LIMIT, 0)} units per billing period.`}
      </p>
      <Form
        onSubmit={form.handleSubmit(({ code }) =>
          redeem.mutate({ orgId, code }),
        )}
        actions={[
          {
            id: "start-trial",
            type: "submit",
            text: "Start trial",
            loading: redeem.isPending,
          },
        ]}
      >
        <Form.InputField
          control={form.control}
          name="code"
          label="Coupon code"
          description="Your Langfuse contact shares this code with you."
          required
          maxLength={256}
          autoComplete="off"
        />
      </Form>
    </div>
  );
}
