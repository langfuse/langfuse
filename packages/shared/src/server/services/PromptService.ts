import { Prompt, PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";
import { env } from "../../env";

export class PromptService {
  private cacheEnabled: boolean;
  private ttlSeconds: number;

  constructor(
    private prisma: PrismaClient,
    private redis: Redis | null,
    private metricIncrementer?: // used for otel metrics
    (name: string, value?: number) => void,
    cacheEnabled?: boolean // used for testing
  ) {
    this.cacheEnabled =
      Boolean(redis) &&
      (cacheEnabled || env.LANGFUSE_CACHE_PROMPT_ENABLED === "true");

    this.ttlSeconds = env.LANGFUSE_CACHE_PROMPT_TTL_SECONDS;
  }

  public async getPrompt(params: PromptParams): Promise<Prompt | null> {
    if (await this.shouldUseCache(params)) {
      const cachedPrompt = await this.getCachedPrompt(params);

      this.incrementMetric(
        cachedPrompt ? Metrics.PromptCacheHit : Metrics.PromptCacheMiss
      );

      if (cachedPrompt) {
        this.logInfo("Returning cached prompt for params", params);

        return cachedPrompt;
      }
    }

    const dbPrompt = await this.getDbPrompt(params);

    if ((await this.shouldUseCache(params)) && dbPrompt) {
      await this.cachePrompt({ ...params, prompt: dbPrompt });

      this.logInfo("Successfully cached prompt for params", params);
    }

    this.logInfo("Returning DB prompt for params", params);

    return dbPrompt;
  }

  private async getDbPrompt(params: PromptParams): Promise<Prompt | null> {
    const { projectId, promptName, version, label } = params;

    if (version) {
      return await this.prisma.prompt.findFirst({
        where: {
          projectId,
          name: promptName,
          version,
        },
      });
    }

    if (label) {
      return await this.prisma.prompt.findFirst({
        where: {
          projectId,
          name: promptName,
          labels: {
            has: label,
          },
        },
      });
    }

    this.logError("Invalid prompt params", params);

    return null;
  }

  private async shouldUseCache(params: PromptParams): Promise<boolean> {
    if (!this.cacheEnabled) return false;

    const isLocked = await this.isCacheLocked(params);

    if (isLocked) {
      this.logInfo("Cache is locked for params", params);
    }

    return !isLocked;
  }

  private async getCachedPrompt(params: PromptParams): Promise<Prompt | null> {
    try {
      const key = this.getCacheKey(params);
      const value = await this.redis?.getex(key, "EX", this.ttlSeconds);

      if (value) return JSON.parse(value) as Prompt;
    } catch (e) {
      this.logError("Error getting cached prompt", e);
    }

    return null;
  }

  private async cachePrompt(params: PromptParams & { prompt: Prompt }) {
    try {
      const keyIndexKey = this.getKeyIndexKey(params);
      const key = this.getCacheKey(params);
      const value = JSON.stringify(params.prompt);

      await this.redis?.sadd(keyIndexKey, key);
      await this.redis?.set(key, value, "EX", this.ttlSeconds);
    } catch (e) {
      this.logError("Error caching prompt", e);
    }
  }

  public async lockCache(
    params: Pick<PromptParams, "projectId" | "promptName">
  ): Promise<void> {
    if (!this.cacheEnabled) return;

    const lockKey = this.getLockKey(params);

    try {
      await this.redis?.setex(lockKey, 30, "locked");
    } catch (e) {
      this.logError("Error locking cache key prefix", lockKey, e);

      throw e;
    }
  }

  public async unlockCache(
    params: Pick<PromptParams, "projectId" | "promptName">
  ): Promise<void> {
    if (!this.cacheEnabled) return;

    const lockKey = this.getLockKey(params);

    try {
      await this.redis?.del(lockKey);
    } catch (e) {
      this.logError("Error unlocking cache key prefix", lockKey, e);

      // Don't re-throw error as lock TTL is short and it's not critical
    }
  }

  private async isCacheLocked(
    params: Pick<PromptParams, "projectId" | "promptName">
  ): Promise<boolean> {
    const lockKey = this.getLockKey(params);

    try {
      return Boolean(await this.redis?.exists(lockKey));
    } catch (e) {
      this.logError("Error checking if cache is locked", lockKey, e);

      return false;
    }
  }

  private getLockKey(
    params: Pick<PromptParams, "projectId" | "promptName">
  ): string {
    // Important to *pre*fix LOCK as otherwise it would be deleted by deleteKeysByPrefix
    return `LOCK:${this.getCacheKeyPrefix(params)}`;
  }

  public async invalidateCache(
    params: Pick<PromptParams, "projectId" | "promptName">
  ): Promise<void> {
    if (!this.cacheEnabled) return;

    const cacheKeyPrefix = this.getCacheKeyPrefix(params);

    try {
      const startTime = Date.now();
      this.logInfo("Invalidating cache for prefix", cacheKeyPrefix);

      const keyIndexKey = this.getKeyIndexKey(params);
      const keys = await this.redis?.smembers(keyIndexKey);

      // Delete all keys for the prefix and the key index
      await this.redis?.del([...(keys ?? []), keyIndexKey]);

      this.logInfo(
        `Cache invalidated for prefix ${cacheKeyPrefix} in ${Date.now() - startTime}ms`
      );
    } catch (e) {
      this.logError("Error deleting keys for prefix", cacheKeyPrefix, e);

      throw e;
    }
  }

  private getCacheKey(params: PromptParams): string {
    const prefix = this.getCacheKeyPrefix(params);

    return `${prefix}:${params.version ?? params.label}`;
  }

  private getCacheKeyPrefix(
    params: Pick<PromptParams, "projectId" | "promptName">
  ): string {
    return `prompt:${params.projectId}:${params.promptName}`;
  }

  private getKeyIndexKey(
    params: Pick<PromptParams, "projectId" | "promptName">
  ): string {
    return `prompt_key_index:${params.projectId}:${params.promptName}`;
  }

  private logError(message: string, ...args: any[]) {
    console.error(`[PromptService] ${message}`, ...args);
  }

  private logInfo(message: string, ...args: any[]) {
    console.log(`[PromptService] ${message}`, ...args);
  }

  private incrementMetric(name: Metrics, value: number = 1) {
    try {
      this.metricIncrementer?.(name, value);
    } catch (e) {
      this.logError("Error incrementing metric", name, e);
    }
  }
}

type PromptParams = {
  projectId: string;
  promptName: string;
} & (
  | { version: number; label: undefined }
  | { version: null | undefined; label: string }
);

enum Metrics {
  PromptCacheHit = "prompt_cache_hit",
  PromptCacheMiss = "prompt_cache_miss",
}
