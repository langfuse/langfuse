/** @jest-environment node */

import { randomUUID } from "crypto";
import { prisma } from "@langfuse/shared/src/db";
import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import {
  GetModelV1Response,
  GetModelsV1Response,
  PostModelsV1Response,
} from "@/src/features/public-api/types/models";

import {
  validateRegexPattern,
  validatePricingTiers,
  validatePricingMethod,
  type PricingTierInput,
} from "@langfuse/shared";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";

describe("validation methods", () => {
  describe("validateRegexPattern", () => {
    it("should accept valid regex patterns", () => {
      expect(() => validateRegexPattern("^input")).not.toThrow();
      expect(() => validateRegexPattern("^(input|prompt)")).not.toThrow();
      expect(() => validateRegexPattern("_cache")).not.toThrow();
      expect(() => validateRegexPattern(".*")).not.toThrow();
    });

    it("should reject empty patterns", () => {
      expect(() => validateRegexPattern("")).toThrow("Pattern cannot be empty");
    });

    it("should reject patterns exceeding 200 characters", () => {
      const longPattern = "a".repeat(201);
      expect(() => validateRegexPattern(longPattern)).toThrow(
        "Pattern exceeds maximum length of 200 characters",
      );
    });

    it("should reject invalid regex syntax", () => {
      expect(() => validateRegexPattern("(unclosed")).toThrow(
        "Invalid regex syntax",
      );
      expect(() => validateRegexPattern("[unclosed")).toThrow(
        "Invalid regex syntax",
      );
      expect(() => validateRegexPattern("(?invalid)")).toThrow(
        "Invalid regex syntax",
      );
    });

    it("should reject patterns that may cause catastrophic backtracking", () => {
      // Known unsafe pattern (exponential backtracking)
      expect(() => validateRegexPattern("(a+)+b")).toThrow(
        "catastrophic backtracking",
      );
      expect(() => validateRegexPattern("(x+x+)+y")).toThrow(
        "catastrophic backtracking",
      );
    });
  });

  describe("validatePricingTiers", () => {
    it("should accept valid pricing tiers", () => {
      const tiers: PricingTierInput[] = [
        {
          name: "Standard",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: { input: 3.0, output: 15.0 },
        },
        {
          name: "Large Context",
          isDefault: false,
          priority: 1,
          conditions: [
            {
              usageDetailPattern: "^input",
              operator: "gt",
              value: 200000,
              caseSensitive: false,
            },
          ],
          prices: { input: 6.0, output: 15.0 },
        },
      ];

      const result = validatePricingTiers(tiers);
      expect(result.valid).toBe(true);
    });

    it("should reject empty tier array", () => {
      const result = validatePricingTiers([]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("At least one pricing tier is required");
    });

    it("should reject tiers with no default", () => {
      const tiers: PricingTierInput[] = [
        {
          name: "Tier 1",
          isDefault: false,
          priority: 1,
          conditions: [],
          prices: { input: 3.0 },
        },
      ];

      const result = validatePricingTiers(tiers);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(
        "Exactly one pricing tier must have isDefault: true",
      );
    });

    it("should reject tiers with multiple defaults", () => {
      const tiers: PricingTierInput[] = [
        {
          name: "Default 1",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: { input: 3.0 },
        },
        {
          name: "Default 2",
          isDefault: true,
          priority: 1,
          conditions: [],
          prices: { input: 6.0 },
        },
      ];

      const result = validatePricingTiers(tiers);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(
        "Only one pricing tier can have isDefault: true",
      );
    });

    it("should reject default tier with non-zero priority", () => {
      const tiers: PricingTierInput[] = [
        {
          name: "Standard",
          isDefault: true,
          priority: 1, // Should be 0
          conditions: [],
          prices: { input: 3.0 },
        },
      ];

      const result = validatePricingTiers(tiers);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(
        "Default pricing tier must have priority: 0",
      );
    });

    it("should reject default tier with conditions", () => {
      const tiers: PricingTierInput[] = [
        {
          name: "Standard",
          isDefault: true,
          priority: 0,
          conditions: [
            {
              usageDetailPattern: "^input",
              operator: "gt",
              value: 100,
              caseSensitive: false,
            },
          ],
          prices: { input: 3.0 },
        },
      ];

      const result = validatePricingTiers(tiers);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(
        "Default pricing tier must have empty conditions array",
      );
    });

    it("should reject duplicate priorities", () => {
      const tiers: PricingTierInput[] = [
        {
          name: "Default",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: { input: 3.0 },
        },
        {
          name: "Tier 1",
          isDefault: false,
          priority: 1,
          conditions: [
            {
              usageDetailPattern: "^input",
              operator: "gt",
              value: 100,
              caseSensitive: false,
            },
          ],
          prices: { input: 5.0 },
        },
        {
          name: "Tier 2",
          isDefault: false,
          priority: 1, // Duplicate!
          conditions: [
            {
              usageDetailPattern: "^input",
              operator: "gt",
              value: 200,
              caseSensitive: false,
            },
          ],
          prices: { input: 7.0 },
        },
      ];

      const result = validatePricingTiers(tiers);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("priorities must be unique");
    });

    it("should reject duplicate names", () => {
      const tiers: PricingTierInput[] = [
        {
          name: "Standard",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: { input: 3.0 },
        },
        {
          name: "Standard", // Duplicate!
          isDefault: false,
          priority: 1,
          conditions: [
            {
              usageDetailPattern: "^input",
              operator: "gt",
              value: 100,
              caseSensitive: false,
            },
          ],
          prices: { input: 5.0 },
        },
      ];

      const result = validatePricingTiers(tiers);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("names must be unique");
    });

    it("should reject tier with invalid regex pattern", () => {
      const tiers: PricingTierInput[] = [
        {
          name: "Standard",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: { input: 3.0 },
        },
        {
          name: "Large Context",
          isDefault: false,
          priority: 1,
          conditions: [
            {
              usageDetailPattern: "(unclosed", // Invalid regex
              operator: "gt",
              value: 100,
              caseSensitive: false,
            },
          ],
          prices: { input: 5.0 },
        },
      ];

      const result = validatePricingTiers(tiers);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid regex pattern");
    });

    it("should reject tier with no prices", () => {
      const tiers: PricingTierInput[] = [
        {
          name: "Standard",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: {}, // Empty!
        },
      ];

      const result = validatePricingTiers(tiers);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must have at least one price defined");
    });

    it("should reject non-default tier with no conditions", () => {
      const tiers: PricingTierInput[] = [
        {
          name: "Standard",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: { input: 3.0 },
        },
        {
          name: "Custom Tier",
          isDefault: false,
          priority: 1,
          conditions: [], // Invalid: non-default must have conditions
          prices: { input: 5.0 },
        },
      ];

      const result = validatePricingTiers(tiers);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(
        'Non-default pricing tier "Custom Tier" must have at least one condition',
      );
    });

    it("should reject tiers with mismatched usage keys", () => {
      const tiers: PricingTierInput[] = [
        {
          name: "Standard",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: { input: 3.0, output: 6.0 },
        },
        {
          name: "High Volume",
          isDefault: false,
          priority: 1,
          conditions: [
            {
              usageDetailPattern: "^input",
              operator: "gt",
              value: 100000,
              caseSensitive: false,
            },
          ],
          prices: { input: 2.5, output_tokens: 5.0 }, // Different keys!
        },
      ];

      const result = validatePricingTiers(tiers);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(
        'Pricing tier "High Volume" must have the same usage keys as the default tier',
      );
      expect(result.error).toContain("Expected: [input, output]");
    });

    it("should accept tiers with same keys in different order", () => {
      const tiers: PricingTierInput[] = [
        {
          name: "Standard",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: { input: 3.0, output: 6.0, cache_read: 1.5 },
        },
        {
          name: "High Volume",
          isDefault: false,
          priority: 1,
          conditions: [
            {
              usageDetailPattern: "^input",
              operator: "gt",
              value: 100000,
              caseSensitive: false,
            },
          ],
          prices: { cache_read: 1.0, input: 2.5, output: 5.0 }, // Same keys, different order
        },
      ];

      const result = validatePricingTiers(tiers);
      expect(result.valid).toBe(true);
    });

    it("should accept single default tier without key consistency check", () => {
      const tiers: PricingTierInput[] = [
        {
          name: "Standard",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: { input: 3.0, output: 6.0 },
        },
      ];

      const result = validatePricingTiers(tiers);
      expect(result.valid).toBe(true);
    });
  });

  describe("validatePricingMethod", () => {
    it("should accept flat prices only", () => {
      const result = validatePricingMethod({
        hasFlatPrices: true,
        hasPricingTiers: false,
      });
      expect(result.valid).toBe(true);
    });

    it("should accept pricing tiers only", () => {
      const result = validatePricingMethod({
        hasFlatPrices: false,
        hasPricingTiers: true,
      });
      expect(result.valid).toBe(true);
    });

    it("should reject both flat prices and pricing tiers", () => {
      const result = validatePricingMethod({
        hasFlatPrices: true,
        hasPricingTiers: true,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Cannot provide both");
    });

    it("should reject neither flat prices nor pricing tiers", () => {
      const result = validatePricingMethod({
        hasFlatPrices: false,
        hasPricingTiers: false,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Must provide either");
    });
  });
});

describe("/models API Endpoints - Pricing Tiers", () => {
  describe("GET /models - with pricing tiers", () => {
    it("should return models with pricingTiers array", async () => {
      const uniqueId = randomUUID();
      const { auth, projectId } = await createOrgProjectAndApiKey();

      // Create model with pricing tiers
      const modelId = `model_${uniqueId}`;
      const model = await prisma.model.create({
        data: {
          id: modelId,
          projectId,
          modelName: `aaa-test-model-${uniqueId}`,
          matchPattern: `^aaa-test-model-${uniqueId}`,
          unit: "TOKENS",
        },
      });

      // Create default tier
      const defaultTier = await prisma.pricingTier.create({
        data: {
          modelId: model.id,
          name: "Standard",
          isDefault: true,
          priority: 0,
          conditions: [],
        },
      });

      await prisma.price.createMany({
        data: [
          {
            modelId: model.id,
            projectId,
            pricingTierId: defaultTier.id,
            usageType: "input",
            price: 3.0,
          },
          {
            modelId: model.id,
            projectId,
            pricingTierId: defaultTier.id,
            usageType: "output",
            price: 15.0,
          },
        ],
      });

      // Create large context tier
      const largeTier = await prisma.pricingTier.create({
        data: {
          modelId: model.id,
          name: "Large Context",
          isDefault: false,
          priority: 1,
          conditions: [
            {
              usageDetailPattern: "^input",
              operator: "gt",
              value: 200000,
              caseSensitive: false,
            },
          ],
        },
      });

      await prisma.price.createMany({
        data: [
          {
            modelId: model.id,
            projectId,
            pricingTierId: largeTier.id,
            usageType: "input",
            price: 6.0,
          },
          {
            modelId: model.id,
            projectId,
            pricingTierId: largeTier.id,
            usageType: "output",
            price: 15.0,
          },
        ],
      });

      // Test GET /models
      const response = await makeZodVerifiedAPICall(
        GetModelsV1Response,
        "GET",
        "/api/public/models",
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      const returnedModel = response.body.data.find((m) => m.id === modelId);
      expect(returnedModel).toBeDefined();

      // Check backward-compatible fields (populated from default tier)
      expect(returnedModel?.inputPrice).toBe(3.0);
      expect(returnedModel?.outputPrice).toBe(15.0);
      expect(returnedModel?.prices).toMatchObject({
        input: { price: 3.0 },
        output: { price: 15.0 },
      });

      // Check new pricingTiers array
      expect(returnedModel?.pricingTiers).toHaveLength(2);

      const defaultTierResponse = returnedModel?.pricingTiers.find(
        (t) => t.isDefault,
      );
      expect(defaultTierResponse).toMatchObject({
        name: "Standard",
        isDefault: true,
        priority: 0,
        conditions: [],
        prices: { input: 3.0, output: 15.0 },
      });

      const largeTierResponse = returnedModel?.pricingTiers.find(
        (t) => !t.isDefault,
      );
      expect(largeTierResponse).toMatchObject({
        name: "Large Context",
        isDefault: false,
        priority: 1,
        prices: { input: 6.0, output: 15.0 },
      });
      expect(largeTierResponse?.conditions).toHaveLength(1);
      expect(largeTierResponse?.conditions[0]).toMatchObject({
        usageDetailPattern: "^input",
        operator: "gt",
        value: 200000,
        caseSensitive: false,
      });
    });
  });

  describe("GET /models/{modelId} - with pricing tiers", () => {
    it("should return single model with pricingTiers array", async () => {
      const uniqueId = randomUUID();
      const { auth, projectId } = await createOrgProjectAndApiKey();

      // Create model with pricing tiers
      const modelId = `model_${uniqueId}`;
      const model = await prisma.model.create({
        data: {
          id: modelId,
          projectId,
          modelName: `aaa-test-model-${uniqueId}`,
          matchPattern: `^aaa-test-model-${uniqueId}`,
          unit: "TOKENS",
        },
      });

      // Create default tier
      const defaultTier = await prisma.pricingTier.create({
        data: {
          modelId: model.id,
          name: "Standard",
          isDefault: true,
          priority: 0,
          conditions: [],
        },
      });

      await prisma.price.createMany({
        data: [
          {
            modelId: model.id,
            projectId,
            pricingTierId: defaultTier.id,
            usageType: "input",
            price: 2.5,
          },
          {
            modelId: model.id,
            projectId,
            pricingTierId: defaultTier.id,
            usageType: "output",
            price: 10.0,
          },
        ],
      });

      // Test GET /models/{modelId}
      const response = await makeZodVerifiedAPICall(
        GetModelV1Response,
        "GET",
        `/api/public/models/${modelId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(modelId);

      // Check backward-compatible fields
      expect(response.body.inputPrice).toBe(2.5);
      expect(response.body.outputPrice).toBe(10.0);

      // Check pricingTiers
      expect(response.body.pricingTiers).toHaveLength(1);
      expect(response.body.pricingTiers[0]).toMatchObject({
        name: "Standard",
        isDefault: true,
        priority: 0,
        conditions: [],
        prices: { input: 2.5, output: 10.0 },
      });
    });
  });

  describe("POST /models - backward compatible (flat prices)", () => {
    it("should create model with default tier from flat prices", async () => {
      const uniqueId = randomUUID();
      const { auth } = await createOrgProjectAndApiKey();

      // Create model with flat prices (legacy format)
      const response = await makeZodVerifiedAPICall(
        PostModelsV1Response,
        "POST",
        "/api/public/models",
        {
          modelName: `aaa-test-model-${uniqueId}`,
          matchPattern: `^aaa-test-model-${uniqueId}`,
          unit: "TOKENS",
          inputPrice: 2.5,
          outputPrice: 10.0,
        },
        auth,
      );

      expect(response.status).toBe(200);
      const modelId = response.body.id;

      // Verify default tier was created
      const tiers = await prisma.pricingTier.findMany({
        where: { modelId },
        include: { prices: true },
      });

      expect(tiers).toHaveLength(1);
      expect(tiers[0]).toMatchObject({
        name: "Standard",
        isDefault: true,
        priority: 0,
        conditions: [],
      });

      // Verify prices are linked to tier
      expect(tiers[0].prices).toHaveLength(2);
      const inputPrice = tiers[0].prices.find((p) => p.usageType === "input");
      const outputPrice = tiers[0].prices.find((p) => p.usageType === "output");
      expect(inputPrice?.price.toNumber()).toBe(2.5);
      expect(outputPrice?.price.toNumber()).toBe(10.0);

      // Verify response includes pricingTiers
      expect(response.body.pricingTiers).toHaveLength(1);
      expect(response.body.pricingTiers[0]).toMatchObject({
        name: "Standard",
        isDefault: true,
        priority: 0,
        prices: { input: 2.5, output: 10.0 },
      });

      // Verify backward-compatible fields are populated
      expect(response.body.inputPrice).toBe(2.5);
      expect(response.body.outputPrice).toBe(10.0);
    });
  });

  describe("POST /models - with pricing tiers", () => {
    it("should create model with multiple pricing tiers", async () => {
      const uniqueId = randomUUID();
      const { auth } = await createOrgProjectAndApiKey();

      const response = await makeZodVerifiedAPICall(
        PostModelsV1Response,
        "POST",
        "/api/public/models",
        {
          modelName: `aaa-test-model-${uniqueId}`,
          matchPattern: `^aaa-test-model-${uniqueId}`,
          unit: "TOKENS",
          pricingTiers: [
            {
              name: "Standard",
              isDefault: true,
              priority: 0,
              conditions: [],
              prices: { input: 3.0, output: 15.0 },
            },
            {
              name: "Large Context (>200K)",
              isDefault: false,
              priority: 1,
              conditions: [
                {
                  usageDetailPattern: "^input",
                  operator: "gt",
                  value: 200000,
                  caseSensitive: false,
                },
              ],
              prices: { input: 6.0, output: 15.0 },
            },
          ],
        },
        auth,
      );

      expect(response.status).toBe(200);
      const modelId = response.body.id;

      // Verify tiers were created in database
      const tiers = await prisma.pricingTier.findMany({
        where: { modelId },
        include: { prices: true },
        orderBy: { priority: "asc" },
      });

      expect(tiers).toHaveLength(2);

      // Verify default tier
      expect(tiers[0]).toMatchObject({
        name: "Standard",
        isDefault: true,
        priority: 0,
      });
      expect(tiers[0].prices).toHaveLength(2);

      // Verify large context tier
      expect(tiers[1]).toMatchObject({
        name: "Large Context (>200K)",
        isDefault: false,
        priority: 1,
      });
      expect(tiers[1].conditions).toMatchObject([
        {
          usageDetailPattern: "^input",
          operator: "gt",
          value: 200000,
          caseSensitive: false,
        },
      ]);

      // Verify response
      expect(response.body.pricingTiers).toHaveLength(2);
      expect(response.body.inputPrice).toBe(3.0); // From default tier
      expect(response.body.outputPrice).toBe(15.0); // From default tier
    });
  });

  describe("POST /models - validation", () => {
    it("should reject model with both flat prices and pricing tiers", async () => {
      const uniqueId = randomUUID();
      const { auth } = await createOrgProjectAndApiKey();

      const response = await makeAPICall(
        "POST",
        "/api/public/models",
        {
          modelName: `aaa-test-model-${uniqueId}`,
          matchPattern: `^aaa-test-model-${uniqueId}`,
          unit: "TOKENS",
          inputPrice: 2.5, // Flat price
          pricingTiers: [
            // AND tiers (not allowed!)
            {
              name: "Standard",
              isDefault: true,
              priority: 0,
              conditions: [],
              prices: { input: 3.0 },
            },
          ],
        },
        auth,
      );

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain(
        "Must provide either flat prices",
      );
    });

    it("should reject model with no pricing information", async () => {
      const uniqueId = randomUUID();
      const { auth } = await createOrgProjectAndApiKey();

      const response = await makeAPICall(
        "POST",
        "/api/public/models",
        {
          modelName: `aaa-test-model-${uniqueId}`,
          matchPattern: `^aaa-test-model-${uniqueId}`,
          unit: "TOKENS",
          // No flat prices AND no pricing tiers
        },
        auth,
      );

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain(
        "Must provide either flat prices",
      );
    });

    it("should reject pricing tiers with no default", async () => {
      const uniqueId = randomUUID();
      const { auth } = await createOrgProjectAndApiKey();

      const response = await makeAPICall(
        "POST",
        "/api/public/models",
        {
          modelName: `aaa-test-model-${uniqueId}`,
          matchPattern: `^aaa-test-model-${uniqueId}`,
          unit: "TOKENS",
          pricingTiers: [
            {
              name: "Tier 1",
              isDefault: false, // No default!
              priority: 1,
              conditions: [],
              prices: { input: 3.0 },
            },
          ],
        },
        auth,
      );

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain("isDefault: true");
    });

    it("should reject pricing tiers with multiple defaults", async () => {
      const uniqueId = randomUUID();
      const { auth } = await createOrgProjectAndApiKey();

      const response = await makeAPICall(
        "POST",
        "/api/public/models",
        {
          modelName: `aaa-test-model-${uniqueId}`,
          matchPattern: `^aaa-test-model-${uniqueId}`,
          unit: "TOKENS",
          pricingTiers: [
            {
              name: "Default 1",
              isDefault: true,
              priority: 0,
              conditions: [],
              prices: { input: 3.0 },
            },
            {
              name: "Default 2",
              isDefault: true, // Multiple defaults!
              priority: 1,
              conditions: [],
              prices: { input: 6.0 },
            },
          ],
        },
        auth,
      );

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain("Only one pricing tier");
    });

    it("should reject pricing tiers with duplicate priorities", async () => {
      const uniqueId = randomUUID();
      const { auth } = await createOrgProjectAndApiKey();

      const response = await makeAPICall(
        "POST",
        "/api/public/models",
        {
          modelName: `aaa-test-model-${uniqueId}`,
          matchPattern: `^aaa-test-model-${uniqueId}`,
          unit: "TOKENS",
          pricingTiers: [
            {
              name: "Standard",
              isDefault: true,
              priority: 0,
              conditions: [],
              prices: { input: 3.0 },
            },
            {
              name: "Tier 1",
              isDefault: false,
              priority: 1,
              conditions: [
                {
                  usageDetailPattern: "^input",
                  operator: "gt",
                  value: 100,
                  caseSensitive: false,
                },
              ],
              prices: { input: 5.0 },
            },
            {
              name: "Tier 2",
              isDefault: false,
              priority: 1, // Duplicate!
              conditions: [
                {
                  usageDetailPattern: "^input",
                  operator: "gt",
                  value: 200,
                  caseSensitive: false,
                },
              ],
              prices: { input: 7.0 },
            },
          ],
        },
        auth,
      );

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain(
        "priorities must be unique",
      );
    });

    it("should reject pricing tiers with duplicate names", async () => {
      const uniqueId = randomUUID();
      const { auth } = await createOrgProjectAndApiKey();

      const response = await makeAPICall(
        "POST",
        "/api/public/models",
        {
          modelName: `aaa-test-model-${uniqueId}`,
          matchPattern: `^aaa-test-model-${uniqueId}`,
          unit: "TOKENS",
          pricingTiers: [
            {
              name: "Standard",
              isDefault: true,
              priority: 0,
              conditions: [],
              prices: { input: 3.0 },
            },
            {
              name: "Standard", // Duplicate name!
              isDefault: false,
              priority: 1,
              conditions: [
                {
                  usageDetailPattern: "^input",
                  operator: "gt",
                  value: 100,
                  caseSensitive: false,
                },
              ],
              prices: { input: 5.0 },
            },
          ],
        },
        auth,
      );

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain("names must be unique");
    });

    it("should reject pricing tiers with invalid regex pattern", async () => {
      const uniqueId = randomUUID();
      const { auth } = await createOrgProjectAndApiKey();

      const response = await makeAPICall(
        "POST",
        "/api/public/models",
        {
          modelName: `aaa-test-model-${uniqueId}`,
          matchPattern: `^aaa-test-model-${uniqueId}`,
          unit: "TOKENS",
          pricingTiers: [
            {
              name: "Standard",
              isDefault: true,
              priority: 0,
              conditions: [],
              prices: { input: 3.0 },
            },
            {
              name: "Large Context",
              isDefault: false,
              priority: 1,
              conditions: [
                {
                  usageDetailPattern: "(unclosed", // Invalid regex!
                  operator: "gt",
                  value: 100,
                  caseSensitive: false,
                },
              ],
              prices: { input: 5.0 },
            },
          ],
        },
        auth,
      );

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain("regex");
    });

    it("should reject default tier with non-zero priority", async () => {
      const uniqueId = randomUUID();
      const { auth } = await createOrgProjectAndApiKey();

      const response = await makeAPICall(
        "POST",
        "/api/public/models",
        {
          modelName: `aaa-test-model-${uniqueId}`,
          matchPattern: `^aaa-test-model-${uniqueId}`,
          unit: "TOKENS",
          pricingTiers: [
            {
              name: "Standard",
              isDefault: true,
              priority: 1, // Should be 0!
              conditions: [],
              prices: { input: 3.0 },
            },
          ],
        },
        auth,
      );

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain("priority: 0");
    });

    it("should reject default tier with conditions", async () => {
      const uniqueId = randomUUID();
      const { auth } = await createOrgProjectAndApiKey();

      const response = await makeAPICall(
        "POST",
        "/api/public/models",
        {
          modelName: `aaa-test-model-${uniqueId}`,
          matchPattern: `^aaa-test-model-${uniqueId}`,
          unit: "TOKENS",
          pricingTiers: [
            {
              name: "Standard",
              isDefault: true,
              priority: 0,
              conditions: [
                // Default shouldn't have conditions!
                {
                  usageDetailPattern: "^input",
                  operator: "gt",
                  value: 100,
                  caseSensitive: false,
                },
              ],
              prices: { input: 3.0 },
            },
          ],
        },
        auth,
      );

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain("empty conditions");
    });
  });
});
