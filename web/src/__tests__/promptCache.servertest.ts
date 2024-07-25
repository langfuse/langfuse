import { type PrismaClient, type Prompt } from "@prisma/client";
import { PromptService, type redis } from "@langfuse/shared/src/server"; // Adjust the import path as needed

type Redis = NonNullable<typeof redis>;

// Mocks
jest.mock("@prisma/client");
jest.mock("ioredis");
jest.mock("@langfuse/shared", () => ({
  env: {
    LANGFUSE_PROMPT_CACHE_ENABLED: "true",
    LANGFUSE_PROMPT_CACHE_TTL_SECONDS: 300,
  },
}));

describe("PromptService", () => {
  let promptService: PromptService;
  let mockPrisma: jest.Mocked<PrismaClient>;
  let mockRedis: jest.Mocked<Redis>;
  let mockMetricIncrementer: jest.Mock;

  const mockPrompt: Omit<Prompt, "updatedAt" | "createdAt"> = {
    id: "1",
    projectId: "project1",
    name: "testPrompt",
    version: 1,
    prompt: "Test prompt content",
    labels: ["test"],
    createdBy: "API",
    type: "text",
    isActive: null,
    config: {},
    tags: [],
  };

  beforeEach(() => {
    mockPrisma = {
      prompt: {
        findFirst: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaClient>;

    mockRedis = {
      getex: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      eval: jest.fn(),
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
        "LOCK:prompt:project1:testPrompt",
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

      expect(mockRedis.del).toHaveBeenCalledWith(
        "LOCK:prompt:project1:testPrompt",
      );
    });
  });

  describe("invalidateCache", () => {
    it("should call deleteKeysByPrefix with correct prefix", async () => {
      await promptService.invalidateCache({
        projectId: "project1",
        promptName: "testPrompt",
      });

      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.any(String),
        0,
        "prompt:project1:testPrompt",
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
        true,
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
});
