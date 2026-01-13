import { type PrismaClient, type Prompt } from "@prisma/client";
import { PromptService, type redis } from "@langfuse/shared/src/server"; // Adjust the import path as needed

type Redis = NonNullable<typeof redis>;

describe("PromptService", () => {
  let promptService: PromptService;
  let mockPrisma: jest.Mocked<PrismaClient>;
  let mockRedis: jest.Mocked<Redis>;
  let mockMetricIncrementer: jest.Mock;

  const mockPrompt: Omit<Prompt, "updatedAt" | "createdAt"> & {
    resolutionGraph: null;
  } = {
    id: "1",
    projectId: "project1",
    name: "testPrompt",
    version: 1,
    prompt: "Test prompt content",
    labels: ["test"],
    createdBy: "API",
    type: "text",
    isActive: false, // Computed from labels (no "production" label)
    config: {},
    tags: [],
    commitMessage: null,
    resolutionGraph: null,
  };

  beforeEach(() => {
    mockPrisma = {
      prompt: {
        findFirst: jest.fn(),
      },
      promptDependency: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as jest.Mocked<PrismaClient>;

    mockRedis = {
      getex: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      eval: jest.fn(),
      sadd: jest.fn(),
      smembers: jest.fn(),
    } as unknown as jest.Mocked<Redis>;

    mockMetricIncrementer = jest.fn();

    promptService = new PromptService(
      mockPrisma,
      mockRedis,
      mockMetricIncrementer,
      true,
    );
  });

  describe("getPrompt", () => {
    it("should return cached prompt if available", async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockRedis.getex.mockResolvedValue(JSON.stringify(mockPrompt));

      const result = await promptService.getPrompt({
        projectId: "project1",
        promptName: "testPrompt",
        version: 1,
        label: undefined,
      });

      expect(result).toEqual(mockPrompt);
      expect(mockMetricIncrementer).toHaveBeenCalledWith("prompt_cache_hit", 1);
    });

    it("should fetch from database if not in cache", async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockRedis.getex.mockResolvedValue(null);
      mockPrisma.prompt.findFirst.mockResolvedValue(mockPrompt);

      const result = await promptService.getPrompt({
        projectId: "project1",
        promptName: "testPrompt",
        version: 1,
        label: undefined,
      });

      expect(result).toEqual(mockPrompt);
      expect(mockPrisma.prompt.findFirst).toHaveBeenCalled();
      expect(mockMetricIncrementer).toHaveBeenCalledWith(
        "prompt_cache_miss",
        1,
      );

      expect(mockRedis.set).toHaveBeenCalledWith(
        "prompt:project1:testPrompt:1",
        JSON.stringify(mockPrompt),
        "EX",
        300,
      );

      expect(mockRedis.sadd).toHaveBeenCalledWith(
        "prompt_key_index:project1",
        "prompt:project1:testPrompt:1",
      );
    });

    it("should not use cache if locked", async () => {
      mockRedis.exists.mockResolvedValue(1);
      mockPrisma.prompt.findFirst.mockResolvedValue(mockPrompt);

      const result = await promptService.getPrompt({
        projectId: "project1",
        promptName: "testPrompt",
        version: 1,
        label: undefined,
      });

      expect(result).toEqual(mockPrompt);
      expect(mockRedis.getex).not.toHaveBeenCalled();
      expect(mockPrisma.prompt.findFirst).toHaveBeenCalled();
    });
  });

  describe("lockCache", () => {
    it("should set a lock in Redis", async () => {
      await promptService.lockCache({
        projectId: "project1",
        promptName: "testPrompt",
      });

      expect(mockRedis.setex).toHaveBeenCalledWith(
        "LOCK:prompt:project1",
        30,
        "locked",
      );
    });
  });

  describe("unlockCache", () => {
    it("should remove the lock from Redis", async () => {
      await promptService.unlockCache({
        projectId: "project1",
        promptName: "testPrompt",
      });

      expect(mockRedis.del).toHaveBeenCalledWith("LOCK:prompt:project1");
    });
  });

  describe("invalidateCache", () => {
    it("should call deleteKeysByPrefix with correct prefix", async () => {
      await promptService.invalidateCache({
        projectId: "project1",
        promptName: "testPrompt",
      });

      // Legacy index
      expect(mockRedis.smembers).toHaveBeenCalledWith(
        "prompt_key_index:project1:testPrompt",
      );

      expect(mockRedis.smembers).toHaveBeenCalledWith(
        "prompt_key_index:project1",
      );
    });
  });

  describe("caching disabled", () => {
    beforeEach(() => {
      promptService = new PromptService(
        mockPrisma,
        mockRedis,
        mockMetricIncrementer,
        false,
      );
    });

    it("should not use cache when disabled", async () => {
      mockPrisma.prompt.findFirst.mockResolvedValue(mockPrompt);

      const result = await promptService.getPrompt({
        projectId: "project1",
        promptName: "testPrompt",
        version: 1,
        label: undefined,
      });

      expect(result).toEqual(mockPrompt);
      expect(mockRedis.getex).not.toHaveBeenCalled();
      expect(mockPrisma.prompt.findFirst).toHaveBeenCalled();
      expect(mockMetricIncrementer).not.toHaveBeenCalled();
    });
  });

  describe("null Redis instance", () => {
    beforeEach(() => {
      promptService = new PromptService(
        mockPrisma,
        null,
        mockMetricIncrementer,
      );
    });

    it("should not use cache with null Redis instance", async () => {
      mockPrisma.prompt.findFirst.mockResolvedValue(mockPrompt);

      const result = await promptService.getPrompt({
        projectId: "project1",
        promptName: "testPrompt",
        version: 1,
        label: undefined,
      });

      expect(result).toEqual(mockPrompt);
      expect(mockPrisma.prompt.findFirst).toHaveBeenCalled();
      expect(mockMetricIncrementer).not.toHaveBeenCalled();
    });
  });

  describe("getPrompt with Redis errors", () => {
    it("should fallback to database if Redis.exists throws an error", async () => {
      mockRedis.exists.mockRejectedValue(new Error("Redis error"));
      mockPrisma.prompt.findFirst.mockResolvedValue(mockPrompt);

      const result = await promptService.getPrompt({
        projectId: "project1",
        promptName: "testPrompt",
        version: 1,
        label: undefined,
      });

      expect(result).toEqual(mockPrompt);
      expect(mockPrisma.prompt.findFirst).toHaveBeenCalled();
      expect(mockMetricIncrementer).toHaveBeenCalledWith(
        "prompt_cache_miss",
        1,
      );
    });

    it("should fallback to database if Redis.getex throws an error", async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockRedis.getex.mockRejectedValue(new Error("Redis error"));
      mockPrisma.prompt.findFirst.mockResolvedValue(mockPrompt);

      const result = await promptService.getPrompt({
        projectId: "project1",
        promptName: "testPrompt",
        version: 1,
        label: undefined,
      });

      expect(result).toEqual(mockPrompt);
      expect(mockPrisma.prompt.findFirst).toHaveBeenCalled();
      expect(mockMetricIncrementer).toHaveBeenCalledWith(
        "prompt_cache_miss",
        1,
      );
    });

    it("should not cache if Redis.set throws an error after database fetch", async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockRedis.getex.mockResolvedValue(null);
      mockPrisma.prompt.findFirst.mockResolvedValue(mockPrompt);
      mockRedis.set.mockRejectedValue(new Error("Redis error"));

      const result = await promptService.getPrompt({
        projectId: "project1",
        promptName: "testPrompt",
        version: 1,
        label: undefined,
      });

      expect(result).toEqual(mockPrompt);
      expect(mockPrisma.prompt.findFirst).toHaveBeenCalled();
      expect(mockMetricIncrementer).toHaveBeenCalledWith(
        "prompt_cache_miss",
        1,
      );
    });
  });

  describe("lockCache with Redis errors", () => {
    it("should throw an error if Redis.setex fails", async () => {
      mockRedis.setex.mockRejectedValue(new Error("Redis error"));

      await expect(
        promptService.lockCache({
          projectId: "project1",
          promptName: "testPrompt",
        }),
      ).rejects.toThrow("Redis error");
    });
  });

  describe("unlockCache with Redis errors", () => {
    it("should log error but not throw if Redis.del fails", async () => {
      mockRedis.del.mockRejectedValue(new Error("Redis error"));

      await promptService.unlockCache({
        projectId: "project1",
        promptName: "testPrompt",
      });
    });
  });

  describe("invalidateCache with Redis errors", () => {
    it("should throw an error if Redis.eval fails", async () => {
      mockRedis.smembers.mockRejectedValue(new Error("Redis error"));

      await expect(
        promptService.invalidateCache({
          projectId: "project1",
          promptName: "testPrompt",
        }),
      ).rejects.toThrow("Redis error");
    });
  });
});
