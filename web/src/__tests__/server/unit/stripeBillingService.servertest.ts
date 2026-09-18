import type { CloudConfigSchema } from "@langfuse/shared";
import type * as SharedServer from "@langfuse/shared/src/server";
import type Stripe from "stripe";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { NEXTAUTH_URL: "https://cloud.langfuse.com" },
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  auditLog: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({ env: mocks.env }));

vi.mock("@/src/ee/features/billing/utils/stripe", () => ({
  stripeClient: undefined,
}));

vi.mock("@/src/features/audit-logs/server", () => ({
  auditLog: mocks.auditLog,
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServer>();
  return { ...actual, logger: mocks.logger };
});

import { BillingService } from "@/src/ee/features/billing/server/stripe/stripeBillingService";
import { type OrgAuthedContext } from "@/src/server/api/trpc";

const ORG_ID = "org-1";

const findUnique = vi.fn();
const subscriptions = {
  retrieve: vi.fn(),
  update: vi.fn(),
};

const stripe = { subscriptions };

const ctx = {
  prisma: { organization: { findUnique } },
  session: {
    orgId: ORG_ID,
    orgRole: "OWNER",
    user: { id: "user-1", email: "user@example.com" },
  },
} as unknown as OrgAuthedContext;

const service = () => new BillingService(stripe as unknown as Stripe, ctx);

const stubOrg = (cloudConfig: CloudConfigSchema | null) => ({
  id: ORG_ID,
  name: "Org",
  createdAt: new Date("2026-01-15T00:00:00Z"),
  updatedAt: new Date("2026-01-15T00:00:00Z"),
  cloudConfig,
  cloudBillingCycleAnchor: new Date("2026-01-15T00:00:00Z"),
  cloudCurrentCycleUsage: 0,
});

const trpcCode = async (promise: Promise<unknown>) => {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(TRPCError);
  return (error as TRPCError).code;
};

describe("stripeBillingService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("cancel, reactivate and clear without an active subscription", () => {
    it.each([
      ["cancel", (s: BillingService) => s.cancel(ORG_ID)],
      ["reactivate", (s: BillingService) => s.reactivate(ORG_ID)],
      [
        "clearPlanSwitchSchedule",
        (s: BillingService) => s.clearPlanSwitchSchedule(ORG_ID),
      ],
    ])(
      "maps %s onto PRECONDITION_FAILED and does not call Stripe",
      async (_label, call) => {
        findUnique.mockResolvedValue(
          stubOrg({ stripe: { customerId: "cus_1" } }),
        );

        expect(await trpcCode(call(service()))).toBe("PRECONDITION_FAILED");
        expect(subscriptions.retrieve).not.toHaveBeenCalled();
        expect(subscriptions.update).not.toHaveBeenCalled();
      },
    );
  });
});
