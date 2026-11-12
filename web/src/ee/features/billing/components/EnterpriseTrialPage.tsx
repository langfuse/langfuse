// Langfuse Cloud only

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  ENTERPRISE_TRIAL_DURATION_DAYS,
  ENTERPRISE_TRIAL_UNIT_LIMIT,
  planLabels,
} from "@langfuse/shared";

import ContainerPage from "@/src/components/layouts/ContainerPage";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { Form } from "@/src/components/design-system/Form/Form";
import { Input } from "@/src/components/design-system/Input/Input";
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
          <Alert>
            <Alert.Title>Not available</Alert.Title>
            <Alert.Description>
              Enterprise trials are only available on Langfuse Cloud.
            </Alert.Description>
          </Alert>
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
      <Alert>
        <Alert.Title>Access denied</Alert.Title>
        <Alert.Description>
          Only organization owners can start an enterprise trial.
        </Alert.Description>
      </Alert>
    );
  }

  const trialEndsAt = organization.cloudConfig?.enterpriseTrial?.endsAt;
  if (organization.plan === "cloud:enterprise-trial" && trialEndsAt) {
    return (
      <div className="flex flex-col items-start gap-4">
        <Alert variant="info">
          <Alert.Title>Your enterprise trial is active</Alert.Title>
          <Alert.Description>
            {`All Enterprise features are available until ${formatDate(trialEndsAt)}. Ingestion pauses at ${numberFormatter(ENTERPRISE_TRIAL_UNIT_LIMIT, 0)} units per billing period.`}
          </Alert.Description>
        </Alert>
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
      <Alert>
        <Alert.Title>Already on a paid plan</Alert.Title>
        <Alert.Description>
          {`This organization is on the ${planLabels[organization.plan]} plan. Enterprise trials are only available to organizations on the Hobby plan; reach out to your Langfuse contact to try Enterprise features.`}
        </Alert.Description>
      </Alert>
    );
  }
  if (trialEndsAt) {
    return (
      <Alert>
        <Alert.Title>Trial already used</Alert.Title>
        <Alert.Description>
          {`This organization's enterprise trial ended on ${formatDate(trialEndsAt)}. Upgrade to a paid plan in the billing settings to keep using Enterprise features.`}
        </Alert.Description>
      </Alert>
    );
  }

  return <RedeemEnterpriseTrialForm orgId={organization.id} />;
}

function RedeemEnterpriseTrialForm({ orgId }: { orgId: string }) {
  const session = useSession();
  const capture = usePostHogClientCapture();
  const [code, setCode] = useState("");
  const redeem = api.cloudBilling.redeemEnterpriseTrial.useMutation({
    // The error is shown under the field instead of as a toast.
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "enterprise-trial.redeem"),
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
        {`Try every Enterprise feature, including SSO, project-level roles and audit logs, for ${ENTERPRISE_TRIAL_DURATION_DAYS} days. No payment method is needed. Ingestion pauses at ${numberFormatter(ENTERPRISE_TRIAL_UNIT_LIMIT, 0)} units per billing period.`}
      </p>
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          if (code.trim().length === 0) return;
          redeem.mutate({ orgId, code: code.trim() });
        }}
        actions={[
          {
            id: "start-trial",
            type: "submit",
            text: "Start trial",
            loading: redeem.isPending,
            disabled: code.trim().length === 0,
          },
        ]}
      >
        <Form.Field
          label="Coupon code"
          description="Your Langfuse contact shares this code with you."
        >
          {(field) => (
            <div className="flex flex-col gap-1">
              <Input
                id={field.id}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                aria-describedby={field.inputDescribedById}
                aria-invalid={Boolean(redeem.error)}
                error={Boolean(redeem.error)}
                autoComplete="off"
                maxLength={256}
              />
              {redeem.error && (
                <p role="alert" className="text-destructive text-sm">
                  {redeem.error.message}
                </p>
              )}
            </div>
          )}
        </Form.Field>
      </Form>
    </div>
  );
}
