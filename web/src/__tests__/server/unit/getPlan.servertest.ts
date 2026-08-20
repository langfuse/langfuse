import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server/getPlan";
import { CloudConfigSchema } from "@langfuse/shared";

const CHB_ORG_ID = "0d5e6f7a-1b2c-4d3e-8f9a-0b1c2d3e4f5a";
const STRIPE_TEAM_PRODUCT_ID = "prod_QhK9qKGH25BTcS";

const cloudConfig = (input: unknown) => CloudConfigSchema.parse(input);

// getOrganizationPlanServerSide only resolves cloud plans when a cloud region is
// set; without it every case would short-circuit to the self-hosted branch.
describe("getOrganizationPlanServerSide (cloud)", () => {
  const originalRegion = process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  beforeAll(() => {
    process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
  });

  afterAll(() => {
    if (originalRegion === undefined) {
      delete process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    } else {
      process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
    }
  });

  it.each([
    ["core", "cloud:core"],
    ["pro", "cloud:pro"],
    ["team", "cloud:team"],
    ["enterprise", "cloud:enterprise"],
  ])("maps CHB plan code %s to %s", (planCode, expected) => {
    expect(
      getOrganizationPlanServerSide(
        cloudConfig({ clickhouse: { organizationId: CHB_ORG_ID, planCode } }),
      ),
    ).toBe(expected);
  });

  it("resolves a CHB org whose plan code drifted to cloud:hobby, not to stale Stripe state", () => {
    // A code cloudConfigSchema does not recognize is dropped to null rather than
    // failing the whole config. The org must still resolve to the free tier: it
    // carries CHB state, so leftover Stripe fields must not decide its plan.
    const parsed = cloudConfig({
      clickhouse: { organizationId: CHB_ORG_ID, planCode: "scale" },
      stripe: { activeProductId: STRIPE_TEAM_PRODUCT_ID },
    });
    expect(parsed.clickhouse?.planCode).toBeNull();

    expect(getOrganizationPlanServerSide(parsed)).toBe("cloud:hobby");
  });

  it("resolves a CHB org with no plan code yet to cloud:hobby", () => {
    expect(
      getOrganizationPlanServerSide(
        cloudConfig({ clickhouse: { organizationId: CHB_ORG_ID } }),
      ),
    ).toBe("cloud:hobby");
  });

  it("lets a manual plan override outrank a CHB plan code", () => {
    expect(
      getOrganizationPlanServerSide(
        cloudConfig({
          plan: "Enterprise",
          clickhouse: { organizationId: CHB_ORG_ID, planCode: "core" },
        }),
      ),
    ).toBe("cloud:enterprise");
  });

  it("still resolves Stripe orgs from the product id", () => {
    expect(
      getOrganizationPlanServerSide(
        cloudConfig({ stripe: { activeProductId: STRIPE_TEAM_PRODUCT_ID } }),
      ),
    ).toBe("cloud:team");
  });

  it("resolves an org with no billing state to cloud:hobby", () => {
    expect(getOrganizationPlanServerSide(cloudConfig({}))).toBe("cloud:hobby");
  });
});
