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
      get: jest.fn().mockResolvedValue("epoch-1"),
      set: jest.fn(),
      del: jest.fn(),
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
      mockRedis.get.mockResolvedValueOnce("epoch-1"); // getOrCreateEpoch
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockPrompt)); // cache read

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
      mockRedis.get.mockResolvedValueOnce("epoch-1"); // getOrCreateEpoch for cache read
      mockRedis.get.mockResolvedValueOnce(null); // cache miss
      mockPrisma.prompt.findFirst.mockResolvedValue(mockPrompt);
      mockRedis.get.mockResolvedValueOnce("epoch-1"); // getOrCreateEpoch for cache write

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
        "prompt:project1:epoch-1:testPrompt:1",
        JSON.stringify(mockPrompt),
        "EX",
        expect.any(Number),
      );
    });

    it("should bypass cache entirely when resolve is false", async () => {
      mockPrisma.prompt.findFirst.mockResolvedValue(mockPrompt);

      const result = await promptService.getPrompt({
        projectId: "project1",
        promptName: "testPrompt",
        version: 1,
        label: undefined,
        resolve: false,
      });

      expect(result).toEqual(mockPrompt);
      expect(mockPrisma.prompt.findFirst).toHaveBeenCalled();
      expect(mockRedis.get).not.toHaveBeenCalled();
      expect(mockRedis.set).not.toHaveBeenCalled();
      expect(mockMetricIncrementer).not.toHaveBeenCalled();
    });
  });

  describe("invalidateCache", () => {
    it("should rotate the epoch token for the project with TTL", async () => {
      await promptService.invalidateCache({
        projectId: "project1",
      });

      expect(mockRedis.set).toHaveBeenCalledWith(
        "prompt_cache_epoch:project1",
        expect.any(String),
        "EX",
        7 * 24 * 60 * 60,
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
    it("should fallback to database if Redis.get throws an error", async () => {
      mockRedis.get.mockRejectedValue(new Error("Redis error"));
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
      mockRedis.get.mockResolvedValueOnce("epoch-1"); // getOrCreateEpoch
      mockRedis.get.mockResolvedValueOnce(null); // cache miss
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

  describe("invalidateCache with Redis errors", () => {
    it("should throw an error if Redis.set fails", async () => {
      mockRedis.set.mockRejectedValue(new Error("Redis error"));

      await expect(
        promptService.invalidateCache({
          projectId: "project1",
        }),
      ).rejects.toThrow("Redis error");
    });
  });
});
