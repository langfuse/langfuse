import { randomUUID } from "crypto";

import { parseDbOrg } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { redeemEnterpriseTrial } from "@/src/ee/features/billing/server/enterpriseTrial";

const VALID_CODE = "LF-ENTERPRISE-TRIAL-TEST-CODE";
const NOW = new Date("2026-11-12T12:00:00.000Z");

let orgId: string;

const cloudConfig = async () =>
  parseDbOrg(
    await prisma.organization.findUniqueOrThrow({ where: { id: orgId } }),
  ).cloudConfig;

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
    await prisma.organization.deleteMany({ where: { id: orgId } });
  });

  it("starts a 60-day trial for a valid code, once per org", async () => {
    await expect(
      redeemEnterpriseTrial({
        orgId,
        code: ` ${VALID_CODE} `,
        validCodes: ["another-valid-code-1234", VALID_CODE],
        now: NOW,
      }),
    ).resolves.toEqual({
      startedAt: "2026-11-12T12:00:00.000Z",
      endsAt: "2027-01-11T12:00:00.000Z",
    });

    expect(await cloudConfig()).toMatchObject({
      defaultLookBackDays: 7,
      enterpriseTrial: {
        startedAt: "2026-11-12T12:00:00.000Z",
        endsAt: "2027-01-11T12:00:00.000Z",
      },
    });

    await expect(
      redeemEnterpriseTrial({
        orgId,
        code: VALID_CODE,
        validCodes: [VALID_CODE],
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
  ])(
    "rejects %s without starting a trial",
    async (_case, code, existingConfig, expectedHttpCode) => {
      await prisma.organization.update({
        where: { id: orgId },
        data: { cloudConfig: existingConfig },
      });

      await expect(
        redeemEnterpriseTrial({ orgId, code, validCodes: [VALID_CODE] }),
      ).rejects.toMatchObject({ httpCode: expectedHttpCode });

      expect((await cloudConfig())?.enterpriseTrial).toBeUndefined();
    },
  );
});
