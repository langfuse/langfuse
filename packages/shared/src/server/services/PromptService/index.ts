import { Prompt, PrismaClient } from "@prisma/client";
import { Redis, Cluster } from "ioredis";
import { randomBytes } from "crypto";
import { env } from "../../../env";
import { logger } from "../../logger";
import { escapeRegex } from "./utils";
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

  // Epoch keys live much longer than cache entries. 7 days gives inactive
  // projects plenty of time while still cleaning up eventually.
  private epochTtlSeconds = 7 * 24 * 60 * 60;

  constructor(
    private prisma: PrismaClient,
    private redis: Redis | Cluster | null,

    private metricIncrementer?: // used for otel metrics

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
    if (params.resolve === false) {
      return this.getRawPrompt(params);
    }

    if (this.cacheEnabled) {
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

    if (this.cacheEnabled && dbPrompt) {
      await this.cachePrompt({ ...params, prompt: dbPrompt });

      this.logDebug("Successfully cached prompt for params", params);
    }

    this.logDebug("Returning DB prompt for params", params);

    return dbPrompt;
  }

  private async getDbPrompt(
    params: PromptParams,
  ): Promise<PromptResult | null> {
    return this.resolvePrompt(await this.findPrompt(params));
  }

  private async getRawPrompt(
    params: PromptParams,
  ): Promise<PromptResult | null> {
    const prompt = await this.findPrompt(params);

    if (!prompt) return null;

    return {
      ...prompt,
      resolutionGraph: null,
    };
  }

  private async findPrompt(params: PromptParams): Promise<Prompt | null> {
    const { projectId, promptName, version, label } = params;

    if (version) {
      return this.prisma.prompt.findFirst({
        where: {
          projectId,
          name: promptName,
          version,
        },
      });
    }

    if (label) {
      return this.prisma.prompt.findFirst({
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

  private async getCachedPrompt(
    params: PromptParams,
  ): Promise<PromptResult | null> {
    try {
      const key = await this.getCacheKey(params);
      if (!key) return null;

      const value = await this.redis?.get(key);

      if (value) return JSON.parse(value) as PromptResult;
    } catch (e) {
      this.logError("Error getting cached prompt", e);
    }

    return null;
  }

  private async cachePrompt(params: PromptParams & { prompt: PromptResult }) {
    try {
      const key = await this.getCacheKey(params);
      if (!key) return;

      const value = JSON.stringify(params.prompt);

      await this.redis?.set(key, value, "EX", this.ttlSeconds);
    } catch (e) {
      this.logError("Error caching prompt", e);
    }
  }

  public async invalidateCache(
    params: Pick<PromptParams, "projectId">,
  ): Promise<void> {
    if (!this.cacheEnabled) return;

    // Rotate the epoch token to move all prompt reads/writes to a fresh namespace.
    // Old keys remain untouched and naturally expire via TTL.
    await this.redis?.set(
      this.getEpochKey(params),
      this.newEpochToken(),
      "EX",
      this.epochTtlSeconds,
    );
  }

  private async getCacheKey(params: PromptParams): Promise<string | null> {
    const epoch = await this.getOrCreateEpoch(params);
    if (!epoch) return null;

    const prefix = this.getCacheKeyPrefix(params, epoch);

    return `${prefix}:${params.version ?? params.label}`;
  }

  private getCacheKeyPrefix(
    params: Pick<PromptParams, "projectId" | "promptName">,
    epoch: string,
  ): string {
    return `prompt:${params.projectId}:${epoch}:${params.promptName}`;
  }

  private getEpochKey(params: Pick<PromptParams, "projectId">): string {
    // Important: epoch is project-scoped (not prompt-scoped) because resolved prompts
    // can include transitive dependencies across multiple prompt names.
    return `prompt_cache_epoch:${params.projectId}`;
  }

  private newEpochToken(): string {
    // 48 bits of entropy in a compact URL-safe string (8 chars).
    return randomBytes(6).toString("base64url");
  }

  private async getOrCreateEpoch(
    params: Pick<PromptParams, "projectId">,
  ): Promise<string | null> {
    const epochKey = this.getEpochKey(params);

    const currentEpoch = await this.redis?.get(epochKey);
    if (currentEpoch) return currentEpoch;

    const newEpoch = this.newEpochToken();
    await this.redis?.set(epochKey, newEpoch, "EX", this.epochTtlSeconds, "NX");

    // Return the winner value in case multiple requests initialize concurrently.
    return (await this.redis?.get(epochKey)) ?? newEpoch;
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
