/** @jest-environment node */
import { prisma } from "@langfuse/shared/src/db";
import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import {
  PostDatasetsV2Response,
  PostDatasetItemsV1Response,
} from "@/src/features/public-api/types/datasets";
import {
  createOrgProjectAndApiKey,
  isValidJSONSchema,
  DatasetItemValidator,
  getDatasetItems,
  createDatasetItemFilterState,
} from "@langfuse/shared/src/server";
import { validateFieldAgainstSchema } from "@langfuse/shared";

process.env.LANGFUSE_DATASET_SERVICE_READ_FROM_VERSIONED_IMPLEMENTATION =
  "true";
process.env.LANGFUSE_DATASET_SERVICE_WRITE_TO_VERSIONED_IMPLEMENTATION = "true";

// Test schemas
const TEST_SCHEMAS = {
  simpleText: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
    additionalProperties: false,
  },

  chatMessages: {
    type: "object",
    properties: {
      messages: {
        type: "array",
        items: {
          type: "object",
          properties: {
            role: { type: "string", enum: ["user", "assistant", "system"] },
            content: { type: "string" },
          },
          required: ["role", "content"],
        },
      },
    },
    required: ["messages"],
    additionalProperties: false,
  },

  allowsNull: {
    anyOf: [
      { type: "null" },
      { type: "object", properties: { text: { type: "string" } } },
    ],
  },

  requiresObject: {
    type: "object",
    properties: { value: { type: "number" } },
    required: ["value"],
    additionalProperties: false,
  },

  invalid: {
    type: "invalid-type", // Invalid JSON Schema
  },
};

// Test data
const DATA = {
  validSimpleText: { text: "hello" },
  invalidSimpleText: { text: 123 },
  missingRequired: {},
  hasExtra: { text: "hello", extra: "field" },

  validChatMessages: {
    messages: [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ],
  },
  invalidChatMessages: {
    messages: [{ role: "invalid", content: "hello" }],
  },

  validNumber: { value: 42 },
  invalidNumber: { value: "not a number" },
};

// ============================================================================
// UNIT TESTS - Validation Functions
// ============================================================================

describe("Unit Tests - isValidJSONSchema", () => {
  it("should return true for valid JSON Schema", () => {
    expect(isValidJSONSchema(TEST_SCHEMAS.simpleText)).toBe(true);
    expect(isValidJSONSchema(TEST_SCHEMAS.chatMessages)).toBe(true);
    expect(isValidJSONSchema(TEST_SCHEMAS.allowsNull)).toBe(true);
  });

  it("should return false for invalid JSON Schema", () => {
    expect(isValidJSONSchema(TEST_SCHEMAS.invalid)).toBe(false);
  });

  it("should return false for null", () => {
    expect(isValidJSONSchema(null)).toBe(false);
  });

  it("should return false for non-object values", () => {
    expect(isValidJSONSchema("string")).toBe(false);
    expect(isValidJSONSchema(123)).toBe(false);
    expect(isValidJSONSchema([])).toBe(false);
  });

  it("should accept complex nested schemas", () => {
    const complexSchema = {
      type: "object",
      properties: {
        nested: {
          type: "object",
          properties: {
            deep: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
    };
    expect(isValidJSONSchema(complexSchema)).toBe(true);
  });
});

describe("Unit Tests - validateFieldAgainstSchema", () => {
  describe("Valid cases", () => {
    it("should validate valid data against schema", () => {
      const result = validateFieldAgainstSchema({
        data: DATA.validSimpleText,
        schema: TEST_SCHEMAS.simpleText,
      });
      expect(result.isValid).toBe(true);
    });

    it("should validate null when schema allows null", () => {
      const result = validateFieldAgainstSchema({
        data: null,
        schema: TEST_SCHEMAS.allowsNull,
      });
      expect(result.isValid).toBe(true);
    });

    it("should validate complex nested objects", () => {
      const result = validateFieldAgainstSchema({
        data: DATA.validChatMessages,
        schema: TEST_SCHEMAS.chatMessages,
      });
      expect(result.isValid).toBe(true);
    });
  });

  describe("Invalid cases", () => {
    it("should return errors for invalid data", () => {
      const result = validateFieldAgainstSchema({
        data: DATA.invalidSimpleText,
        schema: TEST_SCHEMAS.simpleText,
      });
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].message).toBeDefined();
      }
    });

    it("should reject null when schema doesn't allow null", () => {
      const result = validateFieldAgainstSchema({
        data: null,
        schema: TEST_SCHEMAS.requiresObject,
      });
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it("should validate enum violations", () => {
      const result = validateFieldAgainstSchema({
        data: DATA.invalidChatMessages,
        schema: TEST_SCHEMAS.chatMessages,
      });
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.errors.some((e) => e.keyword === "enum")).toBe(true);
      }
    });

    it("should validate additionalProperties: false", () => {
      const result = validateFieldAgainstSchema({
        data: DATA.hasExtra,
        schema: TEST_SCHEMAS.simpleText,
      });
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(
          result.errors.some((e) => e.keyword === "additionalProperties"),
        ).toBe(true);
      }
    });
  });

  it("should return proper JSON paths in errors", () => {
    const result = validateFieldAgainstSchema({
      data: DATA.invalidChatMessages,
      schema: TEST_SCHEMAS.chatMessages,
    });
    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.errors[0].path).toBeDefined();
      expect(typeof result.errors[0].path).toBe("string");
    }
  });
});

describe("Unit Tests - DatasetItemValidator", () => {
  const defaultValidator = new DatasetItemValidator({
    inputSchema: TEST_SCHEMAS.simpleText,
    expectedOutputSchema: TEST_SCHEMAS.requiresObject,
  });

  it("should validate both input and expectedOutput", () => {
    const result = defaultValidator.validateAndNormalize({
      input: DATA.validSimpleText,
      expectedOutput: DATA.validNumber,
      metadata: undefined,
      validateOpts: { normalizeUndefinedToNull: true },
    });

    expect(result.success).toBe(true);
  });

  it("should return inputErrors when input invalid", () => {
    const result = defaultValidator.validateAndNormalize({
      input: DATA.invalidSimpleText,
      expectedOutput: DATA.validNumber,
      metadata: undefined,
      validateOpts: { normalizeUndefinedToNull: true },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.cause?.inputErrors).toBeDefined();
      expect(result.cause?.expectedOutputErrors).toBeUndefined();
    }
  });

  it("should return expectedOutputErrors when expectedOutput invalid", () => {
    const result = defaultValidator.validateAndNormalize({
      input: DATA.validSimpleText,
      expectedOutput: DATA.invalidNumber,
      metadata: undefined,
      validateOpts: { normalizeUndefinedToNull: true },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.cause?.inputErrors).toBeUndefined();
      expect(result.cause?.expectedOutputErrors).toBeDefined();
    }
  });

  it("should return both errors when both invalid", () => {
    const result = defaultValidator.validateAndNormalize({
      input: DATA.invalidSimpleText,
      expectedOutput: DATA.invalidNumber,
      metadata: undefined,
      validateOpts: { normalizeUndefinedToNull: true },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.cause?.inputErrors).toBeDefined();
      expect(result.cause?.expectedOutputErrors).toBeDefined();
      expect(result.cause?.inputErrors?.length).toBeGreaterThan(0);
      expect(result.cause?.expectedOutputErrors?.length).toBeGreaterThan(0);
    }
  });

  it("should treat undefined as null when normalizeUndefinedToNull=true", () => {
    const validator = new DatasetItemValidator({
      inputSchema: TEST_SCHEMAS.requiresObject,
      expectedOutputSchema: TEST_SCHEMAS.requiresObject,
    });

    const result = validator.validateAndNormalize({
      input: undefined,
      expectedOutput: undefined,
      metadata: undefined,
      validateOpts: { normalizeUndefinedToNull: true },
    });
    expect(result.success).toBe(false);
  });

  it("should reject null when schema doesn't allow null", () => {
    const result = defaultValidator.validateAndNormalize({
      input: "whassup",
      expectedOutput: null,
      metadata: undefined,
      validateOpts: { normalizeUndefinedToNull: true },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.cause?.inputErrors).toBeDefined();
      expect(result.cause?.inputErrors?.length).toBeGreaterThan(0);
      expect(result.cause?.expectedOutputErrors).toBeDefined();
      expect(result.cause?.expectedOutputErrors?.length).toBeGreaterThan(0);
    }
  });

  it("should block if input is null despite allowed in schema", () => {
    const validator = new DatasetItemValidator({
      inputSchema: TEST_SCHEMAS.allowsNull,
      expectedOutputSchema: TEST_SCHEMAS.allowsNull,
    });
    const result = validator.validateAndNormalize({
      input: null,
      expectedOutput: { text: "hello" },
      metadata: undefined,
      validateOpts: { normalizeUndefinedToNull: true },
    });
    expect(result.success).toBe(false);
  });

  it("should pass when null is allowed in schema", () => {
    const validator = new DatasetItemValidator({
      inputSchema: TEST_SCHEMAS.allowsNull,
      expectedOutputSchema: TEST_SCHEMAS.allowsNull,
    });
    const result = validator.validateAndNormalize({
      input: { text: "hello" },
      expectedOutput: null,
      metadata: undefined,
      validateOpts: { normalizeUndefinedToNull: true },
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// INTEGRATION TESTS - Public API
// ============================================================================

describe("Public API - Dataset Schema Enforcement", () => {
  let auth: string;
  let projectId: string;

  beforeEach(async () => {
    const { auth: newAuth, projectId: newProjectId } =
      await createOrgProjectAndApiKey();
    auth = newAuth;
    projectId = newProjectId;
  });

  describe("POST /api/public/v2/datasets - Schema Creation", () => {
    it("should create dataset with input schema", async () => {
      const res = await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        {
          name: "test-dataset",
          description: "Test dataset",
          inputSchema: TEST_SCHEMAS.simpleText,
        },
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("test-dataset");
      expect(res.body.inputSchema).toEqual(TEST_SCHEMAS.simpleText);
      expect(res.body.expectedOutputSchema).toBeNull();
    });

    it("should create dataset with expectedOutput schema", async () => {
      const res = await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        {
          name: "test-dataset-2",
          expectedOutputSchema: TEST_SCHEMAS.requiresObject,
        },
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.expectedOutputSchema).toEqual(
        TEST_SCHEMAS.requiresObject,
      );
      expect(res.body.inputSchema).toBeNull();
    });

    it("should create dataset with both schemas", async () => {
      const res = await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        {
          name: "test-dataset-3",
          inputSchema: TEST_SCHEMAS.chatMessages,
          expectedOutputSchema: TEST_SCHEMAS.simpleText,
        },
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.inputSchema).toEqual(TEST_SCHEMAS.chatMessages);
      expect(res.body.expectedOutputSchema).toEqual(TEST_SCHEMAS.simpleText);
    });

    it("should create dataset without schemas", async () => {
      const res = await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        {
          name: "test-dataset-4",
        },
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.inputSchema).toBeNull();
      expect(res.body.expectedOutputSchema).toBeNull();
    });

    it("should reject invalid JSON schema format", async () => {
      const res = await makeAPICall(
        "POST",
        "/api/public/v2/datasets",
        {
          name: "test-dataset-invalid",
          inputSchema: { type: "invalid-type" },
        },
        auth,
      );

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/public/v2/datasets - UPSERT with Validation", () => {
    it("should add schema to existing dataset via UPSERT", async () => {
      // Create dataset without schema
      await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        { name: "upsert-dataset" },
        auth,
      );

      // UPSERT with schema (should validate existing items)
      const res = await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        {
          name: "upsert-dataset",
          inputSchema: TEST_SCHEMAS.simpleText,
        },
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.inputSchema).toEqual(TEST_SCHEMAS.simpleText);
    });

    it("should block UPSERT if existing items fail validation", async () => {
      // Create dataset without schema
      await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        { name: "upsert-fail" },
        auth,
      );

      // Create item with invalid data (no schema yet)
      await makeAPICall(
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "upsert-fail",
          input: { text: 123 }, // Invalid for simpleText schema
        },
        auth,
      );

      // Try to add schema via UPSERT - should fail
      const res = await makeAPICall(
        "POST",
        "/api/public/v2/datasets",
        {
          name: "upsert-fail",
          inputSchema: TEST_SCHEMAS.simpleText,
        },
        auth,
      );

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("validation failed");
    });
  });

  describe("GET /api/public/v2/datasets - Schema Fields", () => {
    it("should return schemas in dataset list", async () => {
      await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        {
          name: "get-test",
          inputSchema: TEST_SCHEMAS.simpleText,
        },
        auth,
      );

      const res = await makeAPICall(
        "GET",
        "/api/public/v2/datasets?page=1&limit=10",
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.data[0].inputSchema).toEqual(TEST_SCHEMAS.simpleText);
    });

    it("should return null schemas when not set", async () => {
      await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        { name: "no-schema-test" },
        auth,
      );

      const res = await makeAPICall(
        "GET",
        "/api/public/v2/datasets?page=1&limit=10",
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      const dataset = res.body.data.find(
        (d: any) => d.name === "no-schema-test",
      );
      expect(dataset.inputSchema).toBeNull();
      expect(dataset.expectedOutputSchema).toBeNull();
    });
  });

  describe("POST /api/public/dataset-items - Schema Validation", () => {
    it("should create item with valid input (schema enforced)", async () => {
      await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        {
          name: "valid-input-test",
          inputSchema: TEST_SCHEMAS.simpleText,
        },
        auth,
      );

      const res = await makeZodVerifiedAPICall(
        PostDatasetItemsV1Response,
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "valid-input-test",
          input: { text: "hello" },
        },
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.input).toEqual({ text: "hello" });
    });

    it("should create item with valid expectedOutput (schema enforced)", async () => {
      await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        {
          name: "valid-output-test",
          expectedOutputSchema: TEST_SCHEMAS.requiresObject,
        },
        auth,
      );

      const res = await makeZodVerifiedAPICall(
        PostDatasetItemsV1Response,
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "valid-output-test",
          input: "Hello",
          expectedOutput: { value: 42 },
        },
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.expectedOutput).toEqual({ value: 42 });
    });

    it("should create item without schemas set", async () => {
      await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        { name: "no-validation" },
        auth,
      );

      const res = await makeZodVerifiedAPICall(
        PostDatasetItemsV1Response,
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "no-validation",
          input: "anything goes",
          expectedOutput: 123,
        },
        auth,
      );

      expect(res.status).toBe(200);
    });

    it("should not create item with null even when schema allows null", async () => {
      await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        {
          name: "allows-null",
          inputSchema: TEST_SCHEMAS.allowsNull,
        },
        auth,
      );

      const res = await makeAPICall(
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "allows-null",
          input: null,
        },
        auth,
      );

      expect(res.status).toBe(400);
    });

    it("should reject item with invalid input", async () => {
      await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        {
          name: "reject-invalid",
          inputSchema: TEST_SCHEMAS.simpleText,
        },
        auth,
      );

      const res = await makeAPICall(
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "reject-invalid",
          input: { text: 123 }, // Invalid type
        },
        auth,
      );

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("validation failed");
    });

    it("should reject item with invalid expectedOutput", async () => {
      await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        {
          name: "reject-output",
          expectedOutputSchema: TEST_SCHEMAS.requiresObject,
        },
        auth,
      );

      const res = await makeAPICall(
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "reject-output",
          expectedOutput: "not an object",
        },
        auth,
      );

      expect(res.status).toBe(400);
    });

    it("should reject item with null when schema doesn't allow null", async () => {
      await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        {
          name: "no-null",
          inputSchema: TEST_SCHEMAS.simpleText, // Requires object
        },
        auth,
      );

      const res = await makeAPICall(
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "no-null",
          input: null,
        },
        auth,
      );

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("validation failed");
    });

    it("should reject item with missing required fields", async () => {
      await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        {
          name: "missing-fields",
          inputSchema: TEST_SCHEMAS.simpleText,
        },
        auth,
      );

      const res = await makeAPICall(
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "missing-fields",
          input: {}, // Missing required 'text' field
        },
        auth,
      );

      expect(res.status).toBe(400);
    });

    it("should validate complex nested structures", async () => {
      await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        {
          name: "nested-test",
          inputSchema: TEST_SCHEMAS.chatMessages,
        },
        auth,
      );

      const validRes = await makeZodVerifiedAPICall(
        PostDatasetItemsV1Response,
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "nested-test",
          input: {
            messages: [
              { role: "user", content: "hello" },
              { role: "assistant", content: "hi" },
            ],
          },
        },
        auth,
      );

      expect(validRes.status).toBe(200);

      // Invalid nested data
      const invalidRes = await makeAPICall(
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "nested-test",
          input: {
            messages: [{ role: "invalid-role", content: "test" }],
          },
        },
        auth,
      );

      expect(invalidRes.status).toBe(400);
    });
  });

  describe("POST /api/public/dataset-items - UPSERT Validation", () => {
    it("should validate on UPSERT create", async () => {
      await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        {
          name: "upsert-create",
          inputSchema: TEST_SCHEMAS.simpleText,
        },
        auth,
      );

      const res = await makeAPICall(
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "upsert-create",
          id: "custom-id-1",
          input: { text: 123 }, // Invalid
        },
        auth,
      );

      expect(res.status).toBe(400);
    });

    it("should validate on UPSERT update", async () => {
      await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        {
          name: "upsert-update",
          inputSchema: TEST_SCHEMAS.simpleText,
        },
        auth,
      );

      // Create valid item
      await makeZodVerifiedAPICall(
        PostDatasetItemsV1Response,
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "upsert-update",
          id: "update-id",
          input: { text: "valid" },
        },
        auth,
      );

      // Update with invalid data
      const res = await makeAPICall(
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "upsert-update",
          id: "update-id",
          input: { text: 999 }, // Invalid
        },
        auth,
      );

      expect(res.status).toBe(400);
    });
  });

  describe("Dataset Schema Addition - Existing Items Validation", () => {
    it("should block schema addition if existing items are invalid", async () => {
      // Create dataset without schema
      await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        { name: "existing-invalid" },
        auth,
      );

      // Create items with data that won't match future schema
      await makeAPICall(
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "existing-invalid",
          input: { text: 123 }, // Will be invalid for simpleText schema
        },
        auth,
      );

      await makeAPICall(
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "existing-invalid",
          input: { text: 456 },
        },
        auth,
      );

      // Try to add schema - should fail because items are invalid
      const res = await makeAPICall(
        "POST",
        "/api/public/v2/datasets",
        {
          name: "existing-invalid",
          inputSchema: TEST_SCHEMAS.simpleText,
        },
        auth,
      );

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("validation failed");
      expect(res.body.message).toContain("2 item(s)"); // Both items failed
    });

    it("should allow schema addition if all existing items are valid", async () => {
      // Create dataset
      await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        { name: "existing-valid" },
        auth,
      );

      // Create valid items
      await makeAPICall(
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "existing-valid",
          input: { text: "hello" },
        },
        auth,
      );

      await makeAPICall(
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "existing-valid",
          input: { text: "world" },
        },
        auth,
      );

      // Add schema - should succeed
      const res = await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        {
          name: "existing-valid",
          inputSchema: TEST_SCHEMAS.simpleText,
        },
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.inputSchema).toEqual(TEST_SCHEMAS.simpleText);
    });

    it("should fail when existing items have null and schema doesn't allow null", async () => {
      // Create dataset
      await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        { name: "null-items" },
        auth,
      );

      // Create item with null input
      await makeAPICall(
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "null-items",
          input: "hello",
          expectedOutput: null,
        },
        auth,
      );

      // Try to add schema that doesn't allow null
      const res = await makeAPICall(
        "POST",
        "/api/public/v2/datasets",
        {
          name: "null-items",
          expectedOutputSchema: TEST_SCHEMAS.simpleText, // Requires object
        },
        auth,
      );

      expect(res.status).toBe(400);
    });
  });

  describe("End-to-End Workflow", () => {
    it("should enforce schema across full workflow", async () => {
      // 1. Create dataset with schema
      const datasetRes = await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        {
          name: "e2e-workflow",
          inputSchema: TEST_SCHEMAS.simpleText,
          expectedOutputSchema: TEST_SCHEMAS.requiresObject,
        },
        auth,
      );
      expect(datasetRes.status).toBe(200);

      // 2. Create valid item (should succeed)
      const validItemRes = await makeZodVerifiedAPICall(
        PostDatasetItemsV1Response,
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "e2e-workflow",
          input: { text: "valid input" },
          expectedOutput: { value: 100 },
        },
        auth,
      );
      expect(validItemRes.status).toBe(200);

      // 3. Try to create invalid item (should fail)
      const invalidItemRes = await makeAPICall(
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "e2e-workflow",
          input: { text: 123 }, // Invalid
          expectedOutput: { value: 50 },
        },
        auth,
      );
      expect(invalidItemRes.status).toBe(400);

      // 4. Verify only valid item was created
      const dataset = await prisma.dataset.findFirst({
        where: { name: "e2e-workflow", projectId },
      });
      if (!dataset) {
        throw new Error("Dataset not found");
      }
      const datasetItems = await getDatasetItems({
        projectId,
        filterState: createDatasetItemFilterState({ datasetIds: [dataset.id] }),
        includeIO: false,
      });
      expect(datasetItems.length).toBe(1);

      // 5. Update schema (should validate existing items)
      const updateSchemaRes = await makeAPICall(
        "POST",
        "/api/public/v2/datasets",
        {
          name: "e2e-workflow",
          inputSchema: TEST_SCHEMAS.chatMessages, // Change schema
        },
        auth,
      );
      // Should fail because existing item doesn't match new schema
      expect(updateSchemaRes.status).toBe(400);

      // 6. Remove schema (should succeed)
      const removeSchemaRes = await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        {
          name: "e2e-workflow",
          inputSchema: null,
          expectedOutputSchema: null,
        },
        auth,
      );
      expect(removeSchemaRes.status).toBe(200);
      expect(removeSchemaRes.body.inputSchema).toBeNull();
    });
  });

  describe("Error Response Format", () => {
    it("should return detailed validation errors", async () => {
      await makeZodVerifiedAPICall(
        PostDatasetsV2Response,
        "POST",
        "/api/public/v2/datasets",
        {
          name: "error-format",
          inputSchema: TEST_SCHEMAS.chatMessages,
        },
        auth,
      );

      const res = await makeAPICall(
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "error-format",
          input: {
            messages: [{ role: "bad-role", content: "test" }],
          },
        },
        auth,
      );

      expect(res.status).toBe(400);
      expect(res.body.message).toBeDefined();
      // Check that error details are included
      const errorMessage = res.body.message;
      expect(typeof errorMessage).toBe("string");
    });
  });
});
