import { randomBytes } from "crypto";
import type { Redis, Cluster } from "ioredis";
import type { PrismaClient, Skill } from "../../db";
import { env } from "../../env";
import { logger } from "../logger";

type SkillVersion = Pick<Skill, "name" | "version">;
type SkillReference = Pick<Skill, "id" | "name" | "version">;

export class SkillCacheService {
  private readonly cacheEnabled: boolean;
  private readonly epochTtlSeconds = 7 * 24 * 60 * 60;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis | Cluster | null,
  ) {
    this.cacheEnabled =
      Boolean(redis) && env.LANGFUSE_CACHE_SKILL_ENABLED === "true";
  }

  async getReferences({
    projectId,
    versions,
  }: {
    projectId: string;
    versions: SkillVersion[];
  }): Promise<SkillReference[]> {
    const unique = new Map<string, SkillVersion>();
    for (const version of versions) {
      unique.set(JSON.stringify([version.name, version.version]), version);
    }
    versions = Array.from(unique.values());
    if (versions.length === 0) return [];

    let epoch: string | null = null;
    let cachedIds: (string | null)[] = [];
    if (this.cacheEnabled && this.redis) {
      try {
        epoch = await this.getOrCreateEpoch(projectId);
        const keys = versions.map((version) =>
          this.getCacheKey(projectId, epoch!, version),
        );
        cachedIds = await this.redis.mget(...keys);
      } catch (error) {
        epoch = null;
        logger.error("[SkillCacheService] Error reading cache", error);
      }
    }

    const missing = versions.filter((_, index) => !cachedIds[index]);
    const fetched = missing.length
      ? await this.prisma.skill.findMany({
          where: { projectId, OR: missing },
          select: { id: true, name: true, version: true },
        })
      : [];

    if (epoch && this.redis && fetched.length) {
      try {
        // Keep the epoch captured before the DB query; mutations may rotate it.
        const pipeline = this.redis.pipeline();
        for (const skill of fetched) {
          pipeline.set(
            this.getCacheKey(projectId, epoch, skill),
            skill.id,
            "EX",
            env.LANGFUSE_CACHE_SKILL_TTL_SECONDS,
          );
        }
        const results = await pipeline.exec();
        const error = results?.find(([error]) => error)?.[0];
        if (error) throw error;
      } catch (error) {
        logger.error("[SkillCacheService] Error writing cache", error);
      }
    }

    const cached = versions.flatMap((version, index) => {
      const id = cachedIds[index];
      return id ? [{ ...version, id }] : [];
    });
    return cached.concat(fetched);
  }

  async invalidateCache({ projectId }: { projectId: string }): Promise<void> {
    if (!this.cacheEnabled || !this.redis) return;
    try {
      await this.redis.set(
        this.getEpochKey(projectId),
        randomBytes(6).toString("base64url"),
        "EX",
        this.epochTtlSeconds,
      );
    } catch (error) {
      logger.error("[SkillCacheService] Error invalidating cache", error);
    }
  }

  private getEpochKey(projectId: string): string {
    return `skill_reference_epoch:{${encodeURIComponent(projectId)}}`;
  }

  private getCacheKey(
    projectId: string,
    epoch: string,
    { name, version }: SkillVersion,
  ): string {
    // A project hash tag keeps batch reads and writes in one Redis Cluster slot.
    return `skill_reference:{${encodeURIComponent(projectId)}}:${epoch}:${encodeURIComponent(name)}:version:${version}`;
  }

  private async getOrCreateEpoch(projectId: string): Promise<string> {
    const key = this.getEpochKey(projectId);
    const current = await this.redis!.get(key);
    if (current) return current;
    const epoch = randomBytes(6).toString("base64url");
    await this.redis!.set(key, epoch, "EX", this.epochTtlSeconds, "NX");
    return (await this.redis!.get(key)) ?? epoch;
  }
}
