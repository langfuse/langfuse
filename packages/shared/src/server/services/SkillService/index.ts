import { Redis, Cluster } from "ioredis";
import { randomBytes } from "crypto";
import { env } from "../../../env";
import { logger } from "../../logger";
import { type Prisma, type PrismaClient, type Skill } from "../../../db";
import { SkillParams, SkillResult, SkillServiceMetrics } from "./types";

type PrismaClientOrTransaction = PrismaClient | Prisma.TransactionClient;

export class SkillService {
  private cacheEnabled: boolean;
  private ttlSeconds: number;

  // Epoch keys live much longer than cache entries. 7 days gives inactive
  // projects plenty of time while still cleaning up eventually.
  private epochTtlSeconds = 7 * 24 * 60 * 60;

  constructor(
    private prisma: PrismaClientOrTransaction,
    private redis: Redis | Cluster | null,

    private metricIncrementer?: // used for otel metrics

    (name: string, value?: number) => void,
    cacheEnabled?: boolean, // used for testing
  ) {
    if (cacheEnabled !== undefined) {
      this.cacheEnabled = cacheEnabled;
    } else {
      this.cacheEnabled =
        Boolean(redis) && env.LANGFUSE_CACHE_SKILL_ENABLED === "true";
    }

    this.ttlSeconds = env.LANGFUSE_CACHE_SKILL_TTL_SECONDS;
  }

  public async getSkill(params: SkillParams): Promise<SkillResult | null> {
    if (this.cacheEnabled) {
      const cachedSkill = await this.getCachedSkill(params);

      this.incrementMetric(
        cachedSkill
          ? SkillServiceMetrics.SkillCacheHit
          : SkillServiceMetrics.SkillCacheMiss,
      );

      if (cachedSkill) {
        this.logDebug("Returning cached skill for params", params);

        return cachedSkill;
      }
    }

    const dbSkill = await this.findSkill(params);

    if (this.cacheEnabled && dbSkill) {
      await this.cacheSkill({ ...params, skill: dbSkill });

      this.logDebug("Successfully cached skill for params", params);
    }

    this.logDebug("Returning DB skill for params", params);

    return dbSkill;
  }

  private async findSkill(params: SkillParams): Promise<Skill | null> {
    const { projectId, skillName, version, label } = params;

    if (version) {
      return this.prisma.skill.findFirst({
        where: {
          projectId,
          name: skillName,
          version,
        },
      });
    }

    if (label) {
      return this.prisma.skill.findFirst({
        where: {
          projectId,
          name: skillName,
          labels: {
            has: label,
          },
        },
      });
    }

    this.logError("Invalid skill params", params);

    return null;
  }

  private async getCachedSkill(
    params: SkillParams,
  ): Promise<SkillResult | null> {
    try {
      const key = await this.getCacheKey(params);
      if (!key) return null;

      const value = await this.redis?.get(key);

      if (value) return JSON.parse(value) as SkillResult;
    } catch (e) {
      this.logError("Error getting cached skill", e);
    }

    return null;
  }

  private async cacheSkill(params: SkillParams & { skill: SkillResult }) {
    try {
      const key = await this.getCacheKey(params);
      if (!key) return;

      const value = JSON.stringify(params.skill);

      await this.redis?.set(key, value, "EX", this.ttlSeconds);
    } catch (e) {
      this.logError("Error caching skill", e);
    }
  }

  public async invalidateCache(
    params: Pick<SkillParams, "projectId">,
  ): Promise<void> {
    if (!this.cacheEnabled) return;

    // Rotate the epoch token to move all skill reads/writes to a fresh namespace.
    // Old keys remain untouched and naturally expire via TTL.
    await this.redis?.set(
      this.getEpochKey(params),
      this.newEpochToken(),
      "EX",
      this.epochTtlSeconds,
    );
  }

  private async getCacheKey(params: SkillParams): Promise<string | null> {
    const epoch = await this.getOrCreateEpoch(params);
    if (!epoch) return null;

    const prefix = this.getCacheKeyPrefix(params, epoch);

    return `${prefix}:${params.version ?? params.label}`;
  }

  private getCacheKeyPrefix(
    params: Pick<SkillParams, "projectId" | "skillName">,
    epoch: string,
  ): string {
    return `skill:${params.projectId}:${epoch}:${params.skillName}`;
  }

  private getEpochKey(params: Pick<SkillParams, "projectId">): string {
    // Epoch is project-scoped so a single write can invalidate every skill read
    // for the project in one operation.
    return `skill_cache_epoch:${params.projectId}`;
  }

  private newEpochToken(): string {
    // 48 bits of entropy in a compact URL-safe string (8 chars).
    return randomBytes(6).toString("base64url");
  }

  private async getOrCreateEpoch(
    params: Pick<SkillParams, "projectId">,
  ): Promise<string | null> {
    const epochKey = this.getEpochKey(params);

    const currentEpoch = await this.redis?.get(epochKey);
    if (currentEpoch) return currentEpoch;

    const newEpoch = this.newEpochToken();
    await this.redis?.set(epochKey, newEpoch, "EX", this.epochTtlSeconds, "NX");

    // Return the winner value in case multiple requests initialize concurrently.
    return (await this.redis?.get(epochKey)) ?? newEpoch;
  }

  private logError(message: string, ...args: any[]) {
    logger.error(`[SkillService] ${message}`, ...args);
  }

  private logDebug(message: string, ...args: any[]) {
    logger.debug(`[SkillService] ${message}`, ...args);
  }

  private incrementMetric(name: SkillServiceMetrics, value = 1) {
    try {
      this.metricIncrementer?.(name, value);
    } catch (e) {
      this.logError("Error incrementing metric", name, e);
    }
  }
}
