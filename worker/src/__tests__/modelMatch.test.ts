import { expect, describe, it, beforeEach, afterEach } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey, redis } from "@langfuse/shared/src/server";
import {
  findModel,
  findModelInPostgres,
  getRedisModelKey,
  clearModelCacheForProject,
} from "@langfuse/shared/src/server";

describe("modelMatch", () => {
  describe("findModel", () => {
    it("should return model with prices from Redis if available", async () => {
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

      // Create prices for the model
      const mockPrice = await prisma.price.create({
        data: {
          modelId: mockModel.id,
          usageType: "input",
          price: "0.03",
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

      expect(result.model).not.toBeNull();
      if (!result.model) {
        throw new Error("Result model is null");
      }
      expect(result.model.id).toEqual(mockModel.id);
      expect(result.model.projectId).toEqual(mockModel.projectId);
      expect(result.model.modelName).toEqual(mockModel.modelName);
      expect(result.model.matchPattern).toEqual(mockModel.matchPattern);
      expect(result.model.unit).toEqual(mockModel.unit);
      expect(result.model.inputPrice?.toString()).toEqual(
        mockModel.inputPrice?.toString(),
      );
      expect(result.model.outputPrice?.toString()).toEqual(
        mockModel.outputPrice?.toString(),
      );
      expect(result.model.totalPrice?.toString()).toEqual(
        mockModel.totalPrice?.toString(),
      );

      // Verify prices are included
      expect(result.prices).toHaveLength(1);
      expect(result.prices[0].id).toEqual(mockPrice.id);
      expect(result.prices[0].usageType).toEqual(mockPrice.usageType);

      // Verify the model with prices exists in Redis
      const redisKey = getRedisModelKey({
        projectId,
        model: "gpt-4",
      });

      const cachedValue = await redis?.get(redisKey);
      expect(cachedValue).not.toBeNull();
      const parsed = JSON.parse(cachedValue!);
      expect(parsed.model.id).toEqual(mockModel.id);
      expect(parsed.model.projectId).toEqual(mockModel.projectId);
      expect(parsed.prices).toHaveLength(1);
      expect(parsed.prices[0].id).toEqual(mockPrice.id);
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

      expect(result.model).toEqual(mockModel);
      expect(result.prices).toEqual([]);
    });

    it("should cache not found models in Redis", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const nonExistentModel = "nonexistent-model";

      // First lookup should check Postgres and cache the not-found result
      const result1 = await findModel({
        projectId,
        model: nonExistentModel,
      });
      expect(result1.model).toBeNull();
      expect(result1.prices).toEqual([]);

      // Second lookup should use the cached not-found result
      const result2 = await findModel({
        projectId,
        model: nonExistentModel,
      });
      expect(result2.model).toBeNull();
      expect(result2.prices).toEqual([]);

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

  describe("clearModelCacheForProject", () => {
    it("should clear all cached models for a project", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      // Create and cache multiple models
      await prisma.model.create({
        data: {
          projectId,
          modelName: "gpt-4",
          matchPattern: "gpt-4",
          unit: "TOKENS",
          inputPrice: "1.0",
        },
      });

      await prisma.model.create({
        data: {
          projectId,
          modelName: "gpt-3.5-turbo",
          matchPattern: "gpt-3.5-turbo",
          unit: "TOKENS",
          inputPrice: "0.5",
        },
      });

      // Cache both models by finding them
      await findModel({ projectId, model: "gpt-4" });
      await findModel({ projectId, model: "gpt-3.5-turbo" });

      // Verify models are cached in Redis
      const redisKey1 = getRedisModelKey({ projectId, model: "gpt-4" });
      const redisKey2 = getRedisModelKey({ projectId, model: "gpt-3.5-turbo" });

      const cachedModel1 = await redis?.get(redisKey1);
      const cachedModel2 = await redis?.get(redisKey2);

      expect(cachedModel1).not.toBeNull();
      expect(cachedModel2).not.toBeNull();

      // Clear the cache for the project
      await clearModelCacheForProject(projectId);

      // Verify models are no longer cached
      const clearedModel1 = await redis?.get(redisKey1);
      const clearedModel2 = await redis?.get(redisKey2);

      expect(clearedModel1).toBeNull();
      expect(clearedModel2).toBeNull();
    });

    it("should clear cached not-found tokens for a project", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const nonExistentModel = "nonexistent-model";

      // Cache a not-found result
      await findModel({ projectId, model: nonExistentModel });

      // Verify the not-found token is cached
      const redisKey = getRedisModelKey({ projectId, model: nonExistentModel });
      const cachedValue = await redis?.get(redisKey);
      expect(cachedValue).toBe("LANGFUSE_MODEL_MATCH_NOT_FOUND");

      // Clear the cache for the project
      await clearModelCacheForProject(projectId);

      // Verify the not-found token is cleared
      const clearedValue = await redis?.get(redisKey);
      expect(clearedValue).toBeNull();
    });
  });
});
