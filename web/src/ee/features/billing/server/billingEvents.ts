import { type BillingProvider, type Plan } from "@langfuse/shared";

import { type CancellationReason } from "@/src/ee/features/billing/utils/cancellationReasons";
import { stripeProducts } from "@/src/ee/features/billing/utils/stripeCatalogue";
import { isProductionCloudRegion } from "@/src/features/auth/lib/createProjectMembershipsOnSignup";
import {
  getServerPosthog,
  type ServerPosthog,
} from "@/src/features/posthog-analytics/ServerPosthog";

type PlanChangeDirection = "upgrade" | "downgrade" | "same";

/** Per event, the properties beyond the organization, its plan and its billing provider. */
type BillingEventProperties = {
  "billing:checkout_started": { targetPlan: Plan | null };
  "billing:plan_change_requested": {
    targetPlan: Plan | null;
    direction: PlanChangeDirection;
  };
  "billing:plan_change_reverted": Record<string, never>;
  "billing:cancellation_scheduled": {
    reason: CancellationReason | null;
    reasonPosition: number | null;
    hasNote: boolean;
  };
  "billing:cancellation_reverted": Record<string, never>;
};

type BillingEventContext = {
  userId: string;
  organizationId: string;
  plan: Plan | null;
  billingProvider: BillingProvider;
};

const planOrder = (plan: Plan | null) =>
  stripeProducts.find((product) => product.mappedPlan === plan)?.orderKey ?? 0;

/** The plan a Stripe product id stands for, or null for an unknown id. */
export const planOfProduct = (stripeProductId: string): Plan | null =>
  stripeProducts.find((product) => product.stripeProductId === stripeProductId)
    ?.mappedPlan ?? null;

/** Whether moving between two plans goes up or down the price list. */
export function planChangeDirection(
  plan: Plan | null,
  targetPlan: Plan | null,
): PlanChangeDirection {
  const difference = planOrder(targetPlan) - planOrder(plan);
  if (difference === 0) return "same";
  return difference > 0 ? "upgrade" : "downgrade";
}

/** @internal */
export const createBillingEventCapture =
  ({
    capture,
    isEnabled,
  }: {
    capture: ServerPosthog["capture"];
    isEnabled: () => boolean;
  }) =>
  <Event extends keyof BillingEventProperties>(
    { userId, organizationId, plan, billingProvider }: BillingEventContext,
    event: Event,
    properties: BillingEventProperties[Event],
  ) => {
    try {
      if (!isEnabled()) return;
      capture({
        distinctId: userId,
        event,
        properties: { organizationId, plan, billingProvider, ...properties },
      });
    } catch {}
  };

/**
 * Captures a billing action in production Cloud regions, on the shared client.
 * Never throws or waits, so tracking never fails or slows a billing request.
 */
export const captureBillingEvent = createBillingEventCapture({
  capture: (event) => getServerPosthog().capture(event),
  isEnabled: isProductionCloudRegion,
});
