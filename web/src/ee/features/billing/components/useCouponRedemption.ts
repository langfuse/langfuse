import { useMutation } from "@tanstack/react-query";

import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";
import { captureUnknownError } from "@/src/utils/captureUnknownError";

import {
  MarketoCreditFormError,
  submitMarketoCreditRequest,
} from "../utils/marketoCreditForm";

export type CouponRedemptionInput = {
  couponCode: string;
  firstName: string;
  lastName: string;
};

/**
 * Redeems a coupon in two steps: the server checks the organization and the
 * code and fills in the rest, then the browser submits it to the
 * credit-request form.
 */
export function useCouponRedemption({
  orgId,
  onInvalidCode,
}: {
  orgId: string;
  onInvalidCode: () => void;
}) {
  const capture = usePostHogClientCapture();
  // Ineligible orgs surface through the default tRPC error toast.
  const prepare = api.cloudBilling.prepareCouponRedemption.useMutation();
  const deliver = useMutation({
    mutationFn: submitMarketoCreditRequest,
    meta: { toastOperation: "billing_coupon.submit" },
    onSuccess: (_, request) =>
      capture("billing_coupon:submitted", { program: request.program }),
    onError: (error) => {
      // Marketo outages and blocked scripts are third-party transport
      // failures: the toast is the whole response. Anything else is ours.
      const isMarketoFailure = error instanceof MarketoCreditFormError;
      if (!isMarketoFailure) captureUnknownError("billing", error);
      showErrorToast(
        "Coupon could not be sent",
        isMarketoFailure
          ? error.message
          : "Something went wrong. Please try again.",
        {
          operation: "billing_coupon.submit",
          errorOrigin: isMarketoFailure ? "network" : "frontend",
          errorCategory: isMarketoFailure ? "transient" : "internal",
        },
      );
    },
  });

  const redeem = ({ couponCode, firstName, lastName }: CouponRedemptionInput) =>
    prepare.mutate(
      { orgId, couponCode },
      {
        onSuccess: (payload) => {
          if (!payload) {
            onInvalidCode();
            return;
          }
          deliver.mutate({ ...payload, firstName, lastName });
        },
      },
    );

  return {
    redeem,
    isPending: prepare.isPending || deliver.isPending,
    isSubmitted: deliver.isSuccess,
  };
}
