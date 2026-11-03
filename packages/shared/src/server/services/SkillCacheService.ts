import type { Redis, Cluster } from "ioredis";
import type { PrismaClient, Skill } from "../../db";
import { env } from "../../env";
import { logger } from "../logger";

type SkillVersion = Pick<Skill, "name" | "version">;
type SkillReference = Pick<Skill, "id" | "name" | "version">;

export class SkillCacheService {
  private readonly cacheEnabled: boolean;

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

    let cachedIds: (string | null)[] = [];
    if (this.cacheEnabled && this.redis) {
      try {
        const keys = versions.map((version) =>
          this.getCacheKey(projectId, version),
        );
        cachedIds = await this.redis.mget(...keys);
      } catch (error) {
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

    if (this.cacheEnabled && this.redis && fetched.length) {
      try {
        const pipeline = this.redis.pipeline();
        for (const skill of fetched) {
          pipeline.set(
            this.getCacheKey(projectId, skill),
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

  async invalidateCache({
    projectId,
    versions,
  }: {
    projectId: string;
    versions: SkillVersion[];
  }): Promise<void> {
    if (!this.cacheEnabled || !this.redis || versions.length === 0) return;
    try {
      await this.redis.del(
        ...versions.map((version) => this.getCacheKey(projectId, version)),
      );
    } catch (error) {
      logger.error("[SkillCacheService] Error invalidating cache", error);
    }
  }

  private getCacheKey(
    projectId: string,
    { name, version }: SkillVersion,
  ): string {
    // A project hash tag keeps batch reads and writes in one Redis Cluster slot.
    return `skill_reference:{${encodeURIComponent(projectId)}}:${encodeURIComponent(name)}:version:${version}`;
  }
}
