import { type BillingProvider, type Plan } from "@langfuse/shared";

import { type CancellationReason } from "@/src/ee/features/billing/utils/cancellationReasons";
import { isProductionCloudRegion } from "@/src/features/auth/lib/createProjectMembershipsOnSignup";
import {
  getServerPosthog,
  type ServerPosthog,
} from "@/src/features/posthog-analytics/ServerPosthog";

/** Per event, the properties beyond the organization, its plan and its billing provider. */
type BillingEventProperties = {
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
