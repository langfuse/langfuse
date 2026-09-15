import { useQueryProject } from "@/src/features/projects/hooks";
import {
  BILLING_PLAN_DIALOG_QUERY,
  billingSettingsPath,
  hasBillingPlanDialogQuery,
} from "@/src/ee/features/billing/utils/planDialogQuery";
import { useRouter } from "next/router";
import { useEffect } from "react";

export default function ProjectBillingRedirect() {
  const router = useRouter();

  const { organization } = useQueryProject();

  useEffect(() => {
    if (!organization) return;
    const search = hasBillingPlanDialogQuery(
      router.query[BILLING_PLAN_DIALOG_QUERY],
    )
      ? `?${BILLING_PLAN_DIALOG_QUERY}=1`
      : "";
    router.replace(`${billingSettingsPath(organization.id)}${search}`);
  }, [organization, router]);

  return "Redirecting...";
}
