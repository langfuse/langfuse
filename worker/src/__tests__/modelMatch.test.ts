import { expect, describe, it, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { redis } from "@langfuse/shared/src/server";
import {
  findModel,
  findModelInPostgres,
  getRedisModelKey,
} from "../services/modelMatch";

describe("modelMatch", () => {
  describe("findModel", () => {
    it("should return model from Redis if available", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      // First create a model in Postgres
      const mockModel = await prisma.model.create({
        data: {
          projectId,
          modelName: "gpt-4",
          matchPattern: "gpt-4",
          unit: "TOKENS",
          inputPrice: "1.0123",
        },
      });

      // Find it once to cache in Redis
      await findModel({
        projectId,
        model: "gpt-4",
      });

      // Now find it again - should come from Redis
      const result = await findModel({
        projectId,
        model: "gpt-4",
      });

      expect(result).not.toBeNull();
      if (!result) {
        throw new Error("Result is null");
      }
      expect(result.id).toEqual(mockModel.id);
      expect(result.projectId).toEqual(mockModel.projectId);
      expect(result.modelName).toEqual(mockModel.modelName);
      expect(result.matchPattern).toEqual(mockModel.matchPattern);
      expect(result.unit).toEqual(mockModel.unit);
      expect(result.inputPrice?.toString()).toEqual(
        mockModel.inputPrice?.toString(),
      );
      expect(result.outputPrice?.toString()).toEqual(
        mockModel.outputPrice?.toString(),
      );
      expect(result.totalPrice?.toString()).toEqual(
        mockModel.totalPrice?.toString(),
      );

      // Verify the model exists in Redis
      const redisKey = getRedisModelKey({
        projectId,
        model: "gpt-4",
      });

      const cachedModel = await redis?.get(redisKey);
      expect(cachedModel).not.toBeNull();
      const parsedModel = JSON.parse(cachedModel!);
      expect(parsedModel.id).toEqual(mockModel.id);
      expect(parsedModel.projectId).toEqual(mockModel.projectId);
    });

    it("should query Postgres if Redis cache misses", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const mockModel = await prisma.model.create({
        data: {
          projectId,
          modelName: "gpt-4",
          matchPattern: "gpt-4",
          unit: "TOKENS",
        },
      });

      const result = await findModel({
        projectId,
        model: "gpt-4",
      });

      expect(result).toEqual(mockModel);
    });

    it("should cache not found models in Redis", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const nonExistentModel = "nonexistent-model";

      // First lookup should check Postgres and cache the not-found result
      const result1 = await findModel({
        projectId,
        model: nonExistentModel,
      });
      expect(result1).toBeNull();

      // Second lookup should use the cached not-found result
      const result2 = await findModel({
        projectId,
        model: nonExistentModel,
      });
      expect(result2).toBeNull();

      // Verify the not-found token exists in Redis
      const redisKey = getRedisModelKey({
        projectId,
        model: nonExistentModel,
      });
      const cachedValue = await redis?.get(redisKey);
      expect(cachedValue).toBe("LANGFUSE_MODEL_MATCH_NOT_FOUND");
    });
  });

  describe("findModelInPostgres", () => {
    it("should find model by exact match pattern", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const mockModel = await prisma.model.create({
        data: {
          projectId,
          modelName: "gpt-4",
          matchPattern: "gpt-4",
          unit: "TOKENS",
        },
      });

      const result = await findModelInPostgres({
        projectId,
        model: "gpt-4",
      });

      expect(result).toEqual(mockModel);
    });

    it("should find model by regex match pattern", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const mockModel = await prisma.model.create({
        data: {
          projectId,
          modelName: "gpt-4-turbo",
          matchPattern: "gpt-4.*",
          unit: "TOKENS",
        },
      });

      const result = await findModelInPostgres({
        projectId,
        model: "gpt-4-turbo",
      });

      expect(result).toEqual(mockModel);
    });

    it("should return null when no model matches", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const result = await findModelInPostgres({
        projectId,
        model: "nonexistent-model",
      });

      expect(result).toBeNull();
    });
  });

  describe("caching behavior", () => {
    it("should cache model found in Postgres for subsequent calls", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const mockModel = await prisma.model.create({
        data: {
          projectId,
          modelName: "claude-3",
          matchPattern: "claude-3",
          unit: "TOKENS",
          inputPrice: "0.5",
          outputPrice: "1.0",
        },
      });

      // First call should hit Postgres and cache the result
      const result1 = await findModel({
        projectId,
        model: "claude-3",
      });
      expect(result1).not.toBeNull();
      expect(result1?.id).toEqual(mockModel.id);

      // Verify it's now cached in Redis
      const redisKey = getRedisModelKey({
        projectId,
        model: "claude-3",
      });
      const cachedModel = await redis?.get(redisKey);
      expect(cachedModel).not.toBeNull();

      // Second call should use cache (Redis)
      const result2 = await findModel({
        projectId,
        model: "claude-3",
      });
      expect(result2).not.toBeNull();
      expect(result2?.id).toEqual(mockModel.id);
    });

    it("should cache different models separately", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const model1 = await prisma.model.create({
        data: {
          projectId,
          modelName: "gpt-3.5",
          matchPattern: "gpt-3.5",
          unit: "TOKENS",
        },
      });

      const model2 = await prisma.model.create({
        data: {
          projectId,
          modelName: "claude-2",
          matchPattern: "claude-2",
          unit: "TOKENS",
        },
      });

      // Find both models to cache them
      await findModel({ projectId, model: "gpt-3.5" });
      await findModel({ projectId, model: "claude-2" });

      // Verify both are cached separately
      const redisKey1 = getRedisModelKey({ projectId, model: "gpt-3.5" });
      const redisKey2 = getRedisModelKey({ projectId, model: "claude-2" });

      const cached1 = await redis?.get(redisKey1);
      const cached2 = await redis?.get(redisKey2);

      expect(cached1).not.toBeNull();
      expect(cached2).not.toBeNull();
      expect(cached1).not.toEqual(cached2);

      const parsed1 = JSON.parse(cached1!);
      const parsed2 = JSON.parse(cached2!);

      expect(parsed1.id).toEqual(model1.id);
      expect(parsed2.id).toEqual(model2.id);
    });

    it("should cache not-found results to avoid repeated Postgres queries", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const nonExistentModel = "non-existent-model";

      // First call should miss cache, check Postgres, and cache not-found
      const result1 = await findModel({
        projectId,
        model: nonExistentModel,
      });
      expect(result1).toBeNull();

      // Verify not-found token is cached
      const redisKey = getRedisModelKey({
        projectId,
        model: nonExistentModel,
      });
      const cachedValue = await redis?.get(redisKey);
      expect(cachedValue).toBe("LANGFUSE_MODEL_MATCH_NOT_FOUND");

      // Second call should use cached not-found result
      const result2 = await findModel({
        projectId,
        model: nonExistentModel,
      });
      expect(result2).toBeNull();
    });

    it("should handle different project IDs in cache keys", async () => {
      const { projectId: projectId1 } = await createOrgProjectAndApiKey();
      const { projectId: projectId2 } = await createOrgProjectAndApiKey();

      const model1 = await prisma.model.create({
        data: {
          projectId: projectId1,
          modelName: "shared-model",
          matchPattern: "shared-model",
          unit: "TOKENS",
        },
      });

      const model2 = await prisma.model.create({
        data: {
          projectId: projectId2,
          modelName: "shared-model",
          matchPattern: "shared-model",
          unit: "TOKENS",
        },
      });

      // Find models with same name but different project IDs
      await findModel({ projectId: projectId1, model: "shared-model" });
      await findModel({ projectId: projectId2, model: "shared-model" });

      // Verify they have different cache keys
      const redisKey1 = getRedisModelKey({
        projectId: projectId1,
        model: "shared-model",
      });
      const redisKey2 = getRedisModelKey({
        projectId: projectId2,
        model: "shared-model",
      });

      expect(redisKey1).not.toEqual(redisKey2);

      // Verify both are cached with correct project associations
      const cached1 = await redis?.get(redisKey1);
      const cached2 = await redis?.get(redisKey2);

      expect(cached1).not.toBeNull();
      expect(cached2).not.toBeNull();

      const parsed1 = JSON.parse(cached1!);
      const parsed2 = JSON.parse(cached2!);

      expect(parsed1.projectId).toEqual(projectId1);
      expect(parsed2.projectId).toEqual(projectId2);
    });

    it("should handle special characters in model names for cache keys", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const specialModel = "model/with@special#chars";

      const mockModel = await prisma.model.create({
        data: {
          projectId,
          modelName: specialModel,
          matchPattern: "model/with@special#chars",
          unit: "TOKENS",
        },
      });

      // Find model to cache it
      const result = await findModel({
        projectId,
        model: specialModel,
      });
      expect(result).not.toBeNull();

      // Verify cache key is properly encoded
      const redisKey = getRedisModelKey({
        projectId,
        model: specialModel,
      });
      expect(redisKey).toContain(encodeURIComponent(specialModel));

      // Verify it's cached
      const cachedModel = await redis?.get(redisKey);
      expect(cachedModel).not.toBeNull();

      const parsed = JSON.parse(cachedModel!);
      expect(parsed.id).toEqual(mockModel.id);
    });

    it("should properly convert cached model data types", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const mockModel = await prisma.model.create({
        data: {
          projectId,
          modelName: "price-test-model",
          matchPattern: "price-test-model",
          unit: "TOKENS",
          inputPrice: "1.2345",
          outputPrice: "2.6789",
          totalPrice: "3.9999",
          startDate: new Date("2024-01-01"),
        },
      });

      // Find model to cache it
      await findModel({
        projectId,
        model: "price-test-model",
      });

      // Now find it again from cache
      const result = await findModel({
        projectId,
        model: "price-test-model",
      });

      expect(result).not.toBeNull();
      expect(result?.inputPrice?.toString()).toEqual("1.2345");
      expect(result?.outputPrice?.toString()).toEqual("2.6789");
      expect(result?.totalPrice?.toString()).toEqual("3.9999");
      expect(result?.startDate).toBeInstanceOf(Date);
      expect(result?.createdAt).toBeInstanceOf(Date);
      expect(result?.updatedAt).toBeInstanceOf(Date);
    });

    it("should handle null price values in cached models", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const mockModel = await prisma.model.create({
        data: {
          projectId,
          modelName: "null-price-model",
          matchPattern: "null-price-model",
          unit: "TOKENS",
          // inputPrice, outputPrice, totalPrice are null by default
        },
      });

      // Find model to cache it
      await findModel({
        projectId,
        model: "null-price-model",
      });

      // Now find it again from cache
      const result = await findModel({
        projectId,
        model: "null-price-model",
      });

      expect(result).not.toBeNull();
      expect(result?.inputPrice).toBeNull();
      expect(result?.outputPrice).toBeNull();
      expect(result?.totalPrice).toBeNull();
    });

    it("should gracefully handle Redis errors and fallback to Postgres", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const mockModel = await prisma.model.create({
        data: {
          projectId,
          modelName: "error-test-model",
          matchPattern: "error-test-model",
          unit: "TOKENS",
        },
      });

      // Mock Redis to throw an error
      const originalGet = redis?.get;
      if (redis) {
        redis.get = vi
          .fn()
          .mockRejectedValue(new Error("Redis connection failed"));
      }

      try {
        // Should still work by falling back to Postgres
        const result = await findModel({
          projectId,
          model: "error-test-model",
        });

        expect(result).not.toBeNull();
        expect(result?.id).toEqual(mockModel.id);
      } finally {
        // Restore original function
        if (redis && originalGet) {
          redis.get = originalGet;
        }
      }
    });

    it("should work correctly when multiple concurrent requests for same model", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const mockModel = await prisma.model.create({
        data: {
          projectId,
          modelName: "concurrent-model",
          matchPattern: "concurrent-model",
          unit: "TOKENS",
        },
      });

      // Make multiple concurrent requests for the same model
      const promises = Array(5)
        .fill(null)
        .map(() =>
          findModel({
            projectId,
            model: "concurrent-model",
          }),
        );

      const results = await Promise.all(promises);

      // All should return the same model
      results.forEach((result) => {
        expect(result).not.toBeNull();
        expect(result?.id).toEqual(mockModel.id);
      });

      // Verify it's cached
      const redisKey = getRedisModelKey({
        projectId,
        model: "concurrent-model",
      });
      const cachedModel = await redis?.get(redisKey);
      expect(cachedModel).not.toBeNull();
    });

    it("should cache models with regex match patterns correctly", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const mockModel = await prisma.model.create({
        data: {
          projectId,
          modelName: "gpt-4-family",
          matchPattern: "gpt-4.*",
          unit: "TOKENS",
        },
      });

      // Test various models that should match the regex
      const testModels = ["gpt-4", "gpt-4-turbo", "gpt-4-vision"];

      for (const testModel of testModels) {
        const result = await findModel({
          projectId,
          model: testModel,
        });

        expect(result).not.toBeNull();
        expect(result?.id).toEqual(mockModel.id);

        // Verify each is cached separately even though they match the same DB model
        const redisKey = getRedisModelKey({
          projectId,
          model: testModel,
        });
        const cachedModel = await redis?.get(redisKey);
        expect(cachedModel).not.toBeNull();
      }
    });

    it("should handle cache when model startDate is set", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startDate = new Date("2024-06-01");
      const mockModel = await prisma.model.create({
        data: {
          projectId,
          modelName: "date-model",
          matchPattern: "date-model",
          unit: "TOKENS",
          startDate,
        },
      });

      // Find and cache the model
      await findModel({
        projectId,
        model: "date-model",
      });

      // Retrieve from cache
      const result = await findModel({
        projectId,
        model: "date-model",
      });

      expect(result).not.toBeNull();
      expect(result?.startDate).toBeInstanceOf(Date);
      expect(result?.startDate?.getTime()).toEqual(startDate.getTime());
    });

    it("should prioritize project-specific models over global models in cache", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      // Create a global model (projectId is null)
      const globalModel = await prisma.model.create({
        data: {
          projectId: null,
          modelName: "global-model",
          matchPattern: "global-model",
          unit: "TOKENS",
          inputPrice: "1.0",
        },
      });

      // Create a project-specific model with same name
      const projectModel = await prisma.model.create({
        data: {
          projectId,
          modelName: "project-specific-model",
          matchPattern: "global-model", // Same pattern
          unit: "TOKENS",
          inputPrice: "2.0",
        },
      });

      // Find model - should get project-specific one
      const result = await findModel({
        projectId,
        model: "global-model",
      });

      expect(result).not.toBeNull();
      expect(result?.id).toEqual(projectModel.id);
      expect(result?.inputPrice?.toString()).toEqual("2.0");

      // Verify the correct model is cached
      const redisKey = getRedisModelKey({
        projectId,
        model: "global-model",
      });
      const cachedModel = await redis?.get(redisKey);
      expect(cachedModel).not.toBeNull();

      const parsed = JSON.parse(cachedModel!);
      expect(parsed.id).toEqual(projectModel.id);
    });

    it("should validate cache key generation with various inputs", async () => {
      const projectId = "test-project-123";
      const testCases = [
        {
          model: "simple-model",
          expected: "model-match:test-project-123:simple-model",
        },
        {
          model: "model with spaces",
          expected: "model-match:test-project-123:model%20with%20spaces",
        },
        {
          model: "model/with/slashes",
          expected: "model-match:test-project-123:model%2Fwith%2Fslashes",
        },
        {
          model: "model@with#symbols",
          expected: "model-match:test-project-123:model%40with%23symbols",
        },
      ];

      testCases.forEach(({ model, expected }) => {
        const key = getRedisModelKey({ projectId, model });
        expect(key).toEqual(expected);
      });
    });
  });
});
