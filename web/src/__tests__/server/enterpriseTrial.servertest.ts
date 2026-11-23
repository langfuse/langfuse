import { randomUUID } from "crypto";

import { parseDbOrg } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { redeemEnterpriseTrial } from "@/src/ee/features/billing/server/enterpriseTrial";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";

const VALID_CODE = "LF-ENTERPRISE-TRIAL-TEST-CODE";
const COUPONS = [{ code: VALID_CODE, durationDays: 14 }];
const NOW = new Date("2026-11-12T12:00:00.000Z");
const CH_ORGANIZATION_ID = "0d5e6f7a-1b2c-4d3e-8f9a-0b1c2d3e4f5a";

let orgId: string;

const dbOrg = () =>
  prisma.organization.findUniqueOrThrow({ where: { id: orgId } });

const cloudConfig = async () => parseDbOrg(await dbOrg()).cloudConfig;

const redeemValidCode = () =>
  redeemEnterpriseTrial({
    orgId,
    code: VALID_CODE,
    coupons: COUPONS,
    now: NOW,
  });

describe("redeemEnterpriseTrial", () => {
  beforeEach(async () => {
    orgId = randomUUID();
    await prisma.organization.create({
      data: {
        id: orgId,
        name: "Enterprise trial test org",
        // Unrelated config must survive the write.
        cloudConfig: { defaultLookBackDays: 7 },
      },
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await prisma.organization.deleteMany({ where: { id: orgId } });
  });

  it("starts a trial as long as the redeemed code grants, once per org", async () => {
    await expect(
      redeemEnterpriseTrial({
        orgId,
        code: ` ${VALID_CODE} `,
        coupons: [
          { code: "LF-ENTERPRISE-TRIAL-60-DAYS", durationDays: 60 },
          { code: VALID_CODE, durationDays: 14 },
        ],
        now: NOW,
      }),
    ).resolves.toEqual({
      startedAt: "2026-11-12T12:00:00.000Z",
      endsAt: "2026-11-26T12:00:00.000Z",
    });

    expect(await cloudConfig()).toMatchObject({
      defaultLookBackDays: 7,
      enterpriseTrial: {
        startedAt: "2026-11-12T12:00:00.000Z",
        endsAt: "2026-11-26T12:00:00.000Z",
      },
    });

    await expect(
      redeemEnterpriseTrial({
        orgId,
        code: VALID_CODE,
        coupons: COUPONS,
      }),
    ).rejects.toMatchObject({ httpCode: 409 });
  });

  it.each([
    ["an invalid code", "LF-ENTERPRISE-TRIAL-WRONG-CODE", {}, 400],
    [
      "an org with an active Stripe subscription",
      VALID_CODE,
      { stripe: { activeSubscriptionId: "sub_123" } },
      409,
    ],
    ["an org with a plan override", VALID_CODE, { plan: "Team" }, 409],
    [
      "an org whose stored config does not parse",
      VALID_CODE,
      // The malformed CH organization id fails the schema, which hides the
      // paid Stripe state next to it from the paid check.
      {
        clickhouse: { organizationId: "not-a-uuid" },
        stripe: { activeSubscriptionId: "sub_123" },
      },
      409,
    ],
  ])(
    "rejects %s without starting a trial",
    async (_case, code, existingConfig, expectedHttpCode) => {
      await prisma.organization.update({
        where: { id: orgId },
        data: { cloudConfig: existingConfig },
      });

      await expect(
        redeemEnterpriseTrial({ orgId, code, coupons: COUPONS }),
      ).rejects.toMatchObject({ httpCode: expectedHttpCode });

      expect((await dbOrg()).cloudConfig).toEqual(existingConfig);
    },
  );

  it("rejects a valid code once the org has used up its coupon attempts", async () => {
    vi.spyOn(RateLimitService.prototype, "rateLimitRequest").mockResolvedValue({
      isRateLimited: () => true,
      res: { msBeforeNext: 30_000 },
    } as never);

    await expect(redeemValidCode()).rejects.toMatchObject({ httpCode: 429 });

    expect(await cloudConfig()).not.toHaveProperty("enterpriseTrial");
  });

  it("keeps a CH organization id that a checkout saved after the trial read the org", async () => {
    const staleOrg = await dbOrg();
    // A first CHB checkout claims the id with raw SQL, which leaves
    // updated_at unchanged.
    await prisma.$executeRaw`
      UPDATE organizations
      SET cloud_config = cloud_config || jsonb_build_object(
        'clickhouse', jsonb_build_object('organizationId', ${CH_ORGANIZATION_ID}::text)
      )
      WHERE id = ${orgId}
    `;
    vi.spyOn(prisma.organization, "findUnique").mockResolvedValueOnce(
      staleOrg as never,
    );

    await redeemValidCode();

    expect(await cloudConfig()).toMatchObject({
      clickhouse: { organizationId: CH_ORGANIZATION_ID },
      enterpriseTrial: { endsAt: "2026-11-26T12:00:00.000Z" },
    });
  });

  it.each([
    ["WARNING", null],
    ["BLOCKED", "BLOCKED"],
  ])(
    "turns a free-tier %s state into %s, so the trial's own warning can still fire",
    async (state, expectedState) => {
      await prisma.organization.update({
        where: { id: orgId },
        data: { cloudFreeTierUsageThresholdState: state },
      });

      await redeemValidCode();

      expect((await dbOrg()).cloudFreeTierUsageThresholdState).toBe(
        expectedState,
      );
    },
  );
});
