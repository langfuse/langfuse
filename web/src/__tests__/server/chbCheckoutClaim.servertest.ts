/**
 * Postgres-backed half of the ChbBillingService suite.
 *
 * The unit suite (`unit/chbBillingService.servertest.ts`) mocks `$executeRaw`,
 * so it can prove *that* checkout claims the CH organization id but not that the
 * statement doing it is correct. These cases run the real guarded UPDATE against
 * a real row, because its failure mode is a silent one: a merge that writes the
 * wrong JSON shape makes `parseDbOrg` discard the org's entire cloudConfig on
 * every later read, not just the field it got wrong. That takes the org's
 * rate-limit and lookback overrides with it, hides the CHB state this very
 * checkout just wrote — so `getBillingProvider` routes the org back to Stripe —
 * and makes `hasPaidBillingState` report a paying org as unpaid, which is the
 * gate keeping it from being ingestion-blocked at the free-tier threshold.
 */

import { randomUUID } from "crypto";

import { parseDbOrg } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type ChbApiClient,
  type ChbCheckoutSession,
} from "@/src/ee/features/billing/server/chb/chbApiClient";
import { ChbBillingService } from "@/src/ee/features/billing/server/chb/chbBillingService";
import { mapChbPlanCodeToStripeProductId } from "@/src/ee/features/billing/utils/chbCatalogue";
import { type OrgAuthedContext } from "@/src/server/api/trpc";

const CORE_PRODUCT_ID = mapChbPlanCodeToStripeProductId("LANGFUSE_CORE")!;

let orgId: string;
let chOrganizationId: string;

/**
 * Set `cloud_config` through raw SQL rather than Prisma: the cases below turn on
 * the difference between a JSON-null and a SQL NULL, and Prisma's JSON handling
 * abstracts exactly that away.
 */
const setCloudConfig = async (json: string | null) => {
  if (json === null) {
    await prisma.$executeRaw`UPDATE organizations SET cloud_config = NULL WHERE id = ${orgId}`;
    return;
  }
  await prisma.$executeRaw`UPDATE organizations SET cloud_config = ${json}::jsonb WHERE id = ${orgId}`;
};

const rawCloudConfig = async (): Promise<unknown> => {
  const [row] = await prisma.$queryRaw<{ cloud_config: unknown }[]>`
    SELECT cloud_config FROM organizations WHERE id = ${orgId}
  `;
  return row?.cloud_config ?? null;
};

/** The org as the rest of the app sees it — through parseDbOrg. */
const parsedCloudConfig = async () => {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
  });
  return parseDbOrg(org).cloudConfig;
};

const clientMock = {
  createCheckoutSession: vi.fn(),
} as unknown as ChbApiClient;

const service = () => {
  const ctx = {
    prisma,
    session: {
      orgId,
      orgRole: "OWNER",
      user: { id: `user-${randomUUID()}`, email: "owner@example.com" },
    },
  } as unknown as OrgAuthedContext;
  return new ChbBillingService(clientMock, ctx);
};

describe("chbBillingService checkout claim (postgres)", () => {
  beforeEach(async () => {
    orgId = `org-chb-claim-${randomUUID()}`;
    chOrganizationId = randomUUID();
    await prisma.organization.create({
      data: { id: orgId, name: "CHB Claim Test Org" },
    });
    vi.mocked(clientMock.createCheckoutSession).mockResolvedValue({
      checkoutUrl: "https://billing.clickhouse.test/checkout/abc",
      organizationId: chOrganizationId,
    } satisfies ChbCheckoutSession);
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    vi.resetAllMocks();
  });

  it("claims the CH organization id when the org has no cloudConfig at all", async () => {
    await setCloudConfig(null);

    await service().createCheckoutSession(orgId, CORE_PRODUCT_ID);

    expect(await parsedCloudConfig()).toMatchObject({
      clickhouse: { organizationId: chOrganizationId },
    });
  });

  it("keeps unrelated cloudConfig keys when it claims", async () => {
    await setCloudConfig(
      JSON.stringify({
        monthlyObservationLimit: 50_000,
        defaultLookBackDays: 30,
      }),
    );

    await service().createCheckoutSession(orgId, CORE_PRODUCT_ID);

    expect(await parsedCloudConfig()).toMatchObject({
      monthlyObservationLimit: 50_000,
      defaultLookBackDays: 30,
      clickhouse: { organizationId: chOrganizationId },
    });
  });

  it("merges into an existing clickhouse sub-object instead of replacing it", async () => {
    // A webhook may have written plan state before checkout returns; the claim
    // rebuilds the sub-object from the row, so that state must survive.
    await setCloudConfig(
      JSON.stringify({ clickhouse: { planCode: "LANGFUSE_CORE" } }),
    );

    await service().createCheckoutSession(orgId, CORE_PRODUCT_ID);

    expect(await parsedCloudConfig()).toMatchObject({
      clickhouse: {
        organizationId: chOrganizationId,
        planCode: "LANGFUSE_CORE",
      },
    });
  });

  /**
   * The regression this file exists for. A stored JSON-null `clickhouse` passes
   * the WHERE guard (`-> 'organizationId'` on a JSON-null yields SQL NULL, which
   * the guard coalesces to 'null'), so the merge runs — and without NULLIF,
   * `'null'::jsonb || '{...}'::jsonb` concatenates into `[null, {...}]` rather
   * than merging. That array fails CloudConfigSchema and takes the whole
   * cloudConfig down with it on every later read.
   *
   * The sibling key is an observation limit rather than a `plan` override on
   * purpose: `plan` and `stripe.customerId` are both checkout interlocks, so an
   * org carrying either never reaches this statement.
   */
  it("merges a JSON-null clickhouse value without corrupting cloudConfig", async () => {
    await setCloudConfig(
      JSON.stringify({ monthlyObservationLimit: 50_000, clickhouse: null }),
    );

    await service().createCheckoutSession(orgId, CORE_PRODUCT_ID);

    // The stored shape stays an object, so the row still parses...
    expect(await rawCloudConfig()).toEqual({
      monthlyObservationLimit: 50_000,
      clickhouse: { organizationId: chOrganizationId },
    });
    // ...and the override survives, rather than the whole config reading as
    // null — which would also hide the CHB state this checkout just wrote.
    expect(await parsedCloudConfig()).toMatchObject({
      monthlyObservationLimit: 50_000,
      clickhouse: { organizationId: chOrganizationId },
    });
  });

  it("refuses a second claim once an organization id is stored", async () => {
    await setCloudConfig(
      JSON.stringify({ clickhouse: { organizationId: chOrganizationId } }),
    );
    // CHB hands back a different org for a request that asked to reuse one:
    // sticky routing is broken, so checkout must refuse rather than clobber.
    vi.mocked(clientMock.createCheckoutSession).mockResolvedValue({
      checkoutUrl: "https://billing.clickhouse.test/checkout/def",
      organizationId: randomUUID(),
    } satisfies ChbCheckoutSession);

    await expect(
      service().createCheckoutSession(orgId, CORE_PRODUCT_ID),
    ).rejects.toThrow(/different organization/i);

    expect(await parsedCloudConfig()).toMatchObject({
      clickhouse: { organizationId: chOrganizationId },
    });
  });
});
