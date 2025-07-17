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
  });
});
