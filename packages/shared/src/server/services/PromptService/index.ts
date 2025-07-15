import { Prompt, PrismaClient } from "@prisma/client";
import { Redis, Cluster } from "ioredis";
import { env } from "../../../env";
import { logger } from "../../logger";
import { escapeRegex } from "./utils";
import { safeMultiDel } from "../../redis/redis";
import {
  PromptGraph,
  PromptParams,
  PartialPrompt,
  ResolvedPromptGraph,
  PromptServiceMetrics,
  PromptResult,
} from "./types";

import { ParsedPromptDependencyTag } from "../../../features/prompts/parsePromptDependencyTags";

export const MAX_PROMPT_NESTING_DEPTH = 5;

export class PromptService {
  private cacheEnabled: boolean;
  private ttlSeconds: number;

  constructor(
    // eslint-disable-next-line no-unused-vars
    private prisma: PrismaClient,
    private redis: Redis | Cluster | null,
    // eslint-disable-next-line no-unused-vars
    private metricIncrementer?: // used for otel metrics
    // eslint-disable-next-line no-unused-vars
    (name: string, value?: number) => void,
    cacheEnabled?: boolean, // used for testing
  ) {
    if (cacheEnabled !== undefined) {
      this.cacheEnabled = cacheEnabled;
    } else {
      this.cacheEnabled =
        Boolean(redis) && env.LANGFUSE_CACHE_PROMPT_ENABLED === "true";
    }

    this.ttlSeconds = env.LANGFUSE_CACHE_PROMPT_TTL_SECONDS;
  }

  public async getPrompt(params: PromptParams): Promise<PromptResult | null> {
    if (await this.shouldUseCache(params)) {
      const cachedPrompt = await this.getCachedPrompt(params);

      this.incrementMetric(
        cachedPrompt
          ? PromptServiceMetrics.PromptCacheHit
          : PromptServiceMetrics.PromptCacheMiss,
      );

      if (cachedPrompt) {
        this.logDebug("Returning cached prompt for params", params);

        return cachedPrompt;
      }
    }

    const dbPrompt = await this.getDbPrompt(params);

    if ((await this.shouldUseCache(params)) && dbPrompt) {
      await this.cachePrompt({ ...params, prompt: dbPrompt });

      this.logDebug("Successfully cached prompt for params", params);
    }

    this.logDebug("Returning DB prompt for params", params);

    return dbPrompt;
  }

  private async getDbPrompt(
    params: PromptParams,
  ): Promise<PromptResult | null> {
    const { projectId, promptName, version, label } = params;

    if (version) {
      const prompt = await this.prisma.prompt.findFirst({
        where: {
          projectId,
          name: promptName,
          version,
        },
      });

      return this.resolvePrompt(prompt);
    }

    if (label) {
      const prompt = await this.prisma.prompt.findFirst({
        where: {
          projectId,
          name: promptName,
          labels: {
            has: label,
          },
        },
      });

      return this.resolvePrompt(prompt);
    }

    this.logError("Invalid prompt params", params);

    return null;
  }

  public async resolvePrompt(
    prompt: Prompt | null,
  ): Promise<PromptResult | null> {
    if (!prompt) return prompt;

    const promptGraph = await this.buildAndResolvePromptGraph({
      projectId: prompt.projectId,
      parentPrompt: prompt,
    });

    return {
      ...prompt,
      prompt: promptGraph.resolvedPrompt,
      resolutionGraph: promptGraph.graph,
    };
  }

  private async shouldUseCache(params: PromptParams): Promise<boolean> {
    if (!this.cacheEnabled) return false;

    const isLocked = await this.isCacheLocked(params);

    if (isLocked) {
      this.logInfo("Cache is locked for params", params);
    }

    return !isLocked;
  }

  private async getCachedPrompt(
    params: PromptParams,
  ): Promise<PromptResult | null> {
    try {
      const key = this.getCacheKey(params);
      const value = await this.redis?.getex(key, "EX", this.ttlSeconds);

      if (value) return JSON.parse(value) as PromptResult;
    } catch (e) {
      this.logError("Error getting cached prompt", e);
    }

    return null;
  }

  private async cachePrompt(params: PromptParams & { prompt: PromptResult }) {
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

  /**
   * Lock the cache so reads will go to the database and not to Redis
   *
   * This is useful in order to return consistent data during the
   * invalidation of the cache where we are looping through the relevant cache keys
   */
  public async lockCache(
    params: Pick<PromptParams, "projectId" | "promptName">,
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
    params: Pick<PromptParams, "projectId" | "promptName">,
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
    params: Pick<PromptParams, "projectId" | "promptName">,
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
    params: Pick<PromptParams, "projectId" | "promptName">,
  ): string {
    // Important to *pre*fix LOCK as otherwise it would be deleted by deleteKeysByPrefix
    return `LOCK:prompt:${params.projectId}`;
  }

  public async invalidateCache(
    params: Pick<PromptParams, "projectId" | "promptName">,
  ): Promise<void> {
    if (!this.cacheEnabled) return;

    const keyIndexKey = this.getKeyIndexKey(params);
    const keys = await this.redis?.smembers(keyIndexKey);

    /*
     * Previously, the cache key index was based on both projectId and promptName.
     * Now with prompt composability, we only use projectId for the key index.
     * When invalidating the cache, we delete all keys for a projectId.
     * For backwards compatibility, we also clear any existing entries in the old
     * key index format (projectId + promptName) to ensure consistent caching.
     */
    const legacyKeyIndexKey = `${keyIndexKey}:${params.promptName}`;
    const legacyKeys = await this.redis?.smembers(legacyKeyIndexKey);

    // Delete all keys for the prefix and the key index using safe multi-delete
    const keysToDelete = [
      ...(keys ?? []),
      keyIndexKey,
      ...(legacyKeys ?? []),
      legacyKeyIndexKey,
    ];
    await safeMultiDel(this.redis, keysToDelete);
  }

  private getCacheKey(params: PromptParams): string {
    const prefix = this.getCacheKeyPrefix(params);

    return `${prefix}:${params.version ?? params.label}`;
  }

  private getCacheKeyPrefix(
    params: Pick<PromptParams, "projectId" | "promptName">,
  ): string {
    return `prompt:${params.projectId}:${params.promptName}`;
  }

  private getKeyIndexKey(
    params: Pick<PromptParams, "projectId" | "promptName">,
  ): string {
    return `prompt_key_index:${params.projectId}`;
  }

  public async buildAndResolvePromptGraph(params: {
    projectId: string;
    parentPrompt: PartialPrompt;
    dependencies?: ParsedPromptDependencyTag[];
  }): Promise<ResolvedPromptGraph> {
    try {
      const { projectId, parentPrompt, dependencies } = params;

      const graph: PromptGraph = {
        root: {
          name: parentPrompt.name,
          version: parentPrompt.version,
          id: parentPrompt.id,
        },
        dependencies: {},
      };
      const seen = new Set<string>();

      const resolve = async (
        currentPrompt: PartialPrompt,
        deps: ParsedPromptDependencyTag[] | undefined,
        level: number,
      ) => {
        // Nesting depth check
        if (level >= MAX_PROMPT_NESTING_DEPTH) {
          throw Error(
            `Maximum nesting depth exceeded (${MAX_PROMPT_NESTING_DEPTH})`,
          );
        }

        // Circular dependency check
        if (
          seen.has(currentPrompt.id) ||
          (currentPrompt.name === parentPrompt.name &&
            currentPrompt.id !== parentPrompt.id) // ensure that the parent prompt cannot reference a prompt of the same name but different version
        ) {
          throw Error(
            `Circular dependency detected involving prompt '${currentPrompt.name}' version ${currentPrompt.version}`,
          );
        }

        seen.add(currentPrompt.id);

        // deps can be either passed (if a prompt is created and content was scanned) or retrieved from db
        let promptDependencies = deps;
        if (!deps) {
          promptDependencies = (
            await this.prisma.promptDependency.findMany({
              where: {
                projectId,
                parentId: currentPrompt.id,
              },
              select: {
                childName: true,
                childLabel: true,
                childVersion: true,
              },
            })
          ).map(
            (dep) =>
              ({
                name: dep.childName,
                ...(dep.childVersion
                  ? { type: "version", version: dep.childVersion }
                  : { type: "label", label: dep.childLabel }),
              }) as ParsedPromptDependencyTag,
          );
        }

        if (promptDependencies && promptDependencies.length) {
          // Instantiate resolved prompt, use stringfied version for regex operations
          // Do this inside if clause to skip stringify/parse overhead for prompts without dependencies
          let resolvedPrompt = JSON.stringify(currentPrompt.prompt);

          for (const dep of promptDependencies) {
            const depPrompt = await this.prisma.prompt.findFirst({
              where: {
                projectId,
                name: dep.name,
                ...(dep.type === "version"
                  ? { version: dep.version }
                  : { labels: { has: dep.label } }),
              },
            });

            const logName = `${dep.name} - ${dep.type} ${dep.type === "version" ? dep.version : dep.label}`;

            if (!depPrompt)
              throw Error(`Prompt dependency not found: ${logName}`);
            if (depPrompt.type !== "text")
              throw Error(`Prompt dependency is not a text prompt: ${logName}`);

            // side-effect: populate adjacency list to return later as well
            graph.dependencies[currentPrompt.id] ??= []; // initializes an empty list if it does not exist yet
            graph.dependencies[currentPrompt.id].push({
              id: depPrompt.id,
              name: depPrompt.name,
              version: depPrompt.version,
            });

            // resolve the prompt content recursively
            const resolvedDepPrompt = await resolve(
              depPrompt,
              undefined,
              level + 1,
            );

            const versionPattern = `@@@langfusePrompt:name=${escapeRegex(depPrompt.name)}\\|version=${escapeRegex(depPrompt.version)}@@@`;
            const labelPatterns = depPrompt.labels.map(
              (label) =>
                `@@@langfusePrompt:name=${escapeRegex(depPrompt.name)}\\|label=${escapeRegex(label)}@@@`,
            );
            const combinedPattern = [versionPattern, ...labelPatterns].join(
              "|",
            );
            const regex = new RegExp(combinedPattern, "g");

            const replaceValue = JSON.stringify(resolvedDepPrompt)
              .slice(1, -1) // this is necessary to avoid parsing errors as resolved value is unstringified
              .replace(/\$/g, "$$$$"); // Escape dollar signs in replacement string. $ has special meaning in replace(), so we need to escape it with $$. Since we're in a string that will be used as a replacement, we need to double escape it (hence $$$$)

            resolvedPrompt = resolvedPrompt.replace(regex, replaceValue);
          }

          seen.delete(currentPrompt.id);

          return JSON.parse(resolvedPrompt);
        } else {
          seen.delete(currentPrompt.id);

          return currentPrompt.prompt;
        }
      };

      const resolvedPrompt = await resolve(parentPrompt, dependencies, 0);

      return {
        graph: Object.keys(graph.dependencies).length > 0 ? graph : null,
        resolvedPrompt,
      };
    } catch (err) {
      console.error(err);

      throw err;
    }
  }

  private logError(message: string, ...args: any[]) {
    logger.error(`[PromptService] ${message}`, ...args);
  }

  private logInfo(message: string, ...args: any[]) {
    logger.info(`[PromptService] ${message}`, ...args);
  }

  private logDebug(message: string, ...args: any[]) {
    logger.debug(`[PromptService] ${message}`, ...args);
  }

  private incrementMetric(name: PromptServiceMetrics, value: number = 1) {
    try {
      this.metricIncrementer?.(name, value);
    } catch (e) {
      this.logError("Error incrementing metric", name, e);
    }
  }
}
