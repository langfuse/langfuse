import { useMemo } from "react";
import { useSession } from "next-auth/react";

import { useIsCloudBillingAvailable } from "@/src/ee/features/billing/utils/isCloudBilling";
import { getSessionPaymentBanner } from "@/src/features/payment-banner/getSessionPaymentBanner";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";

export function usePaymentBanner() {
  const session = useSession();
  const { organization } = useQueryProjectOrOrganization();
  const isCloudBilling = useIsCloudBillingAvailable();

  return useMemo(
    () =>
      getSessionPaymentBanner(
        session.data,
        session.status,
        organization,
        isCloudBilling,
      ),
    [session.data, session.status, organization, isCloudBilling],
  );
}
