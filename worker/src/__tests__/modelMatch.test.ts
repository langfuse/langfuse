import { expect, describe, it, beforeEach, afterEach } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  findModel,
  findModelInPostgres,
  getRedisModelKey,
  invalidateAllCachedModels,
  invalidateModelCache,
  redis,
} from "@langfuse/shared/src/server";

describe("modelMatch", () => {
  beforeEach(async () => {
    // Clear Redis and database before each test
    await redis?.flushall();
  });

  afterEach(async () => {
    await redis?.flushall();
  });

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

      expect(result).toEqual(mockModel);
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
    it("should invalidate Redis cache", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const mockModel = await prisma.model.create({
        data: {
          projectId,
          modelName: "gpt-4",
          matchPattern: "gpt-4",
          unit: "TOKENS",
        },
      });

      await findModel({
        projectId,
        model: "gpt-4",
      });

      await invalidateModelCache(projectId);

      const redisKey = getRedisModelKey({
        projectId,
        model: "gpt-4",
      });

      const cachedModel = await redis?.get(redisKey);
      expect(cachedModel).toBeNull();
    });

    it("should invalidate all cached models for a project if no existing models", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      await invalidateModelCache(projectId);

      const keys = await redis?.keys("model:*");
      expect(keys).toEqual([]);
    });

    it("should invalidate all cached models", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.model.create({
        data: {
          projectId,
          modelName: "gpt-4",
          matchPattern: "gpt-4",
          unit: "TOKENS",
        },
      });

      await findModel({
        projectId,
        model: "gpt-4",
      });

      const { projectId: projectId2 } = await createOrgProjectAndApiKey();
      const mockModel2 = await prisma.model.create({
        data: {
          projectId: projectId2,
          modelName: "gpt-4",
          matchPattern: "gpt-4",
          unit: "TOKENS",
        },
      });

      await findModel({
        projectId: projectId2,
        model: "gpt-4",
      });

      await invalidateAllCachedModels();

      const keys = await redis?.keys("model:*");
      expect(keys).toEqual([]);
    });

    it("should invalidate all caches if no existing models", async () => {
      await invalidateAllCachedModels();

      const keys = await redis?.keys("model:*");
      expect(keys).toEqual([]);
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
});
