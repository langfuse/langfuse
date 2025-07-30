import { PrismaClient, LangfuseNotFoundError } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";
import { env } from "../env";

export class ClickhouseReadSkipCache {
  private static instance: ClickhouseReadSkipCache | null = null;
  private projectSkipMap = new Map<string, boolean>();
  private initialized = false;
  private initializing = false;
  private initPromise: Promise<void> | null = null;
  private prisma: PrismaClient;

  private constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  public static getInstance(prisma?: PrismaClient): ClickhouseReadSkipCache {
    if (!ClickhouseReadSkipCache.instance) {
      if (!prisma) {
        throw new Error("PrismaClient is required for first initialization");
      }
      ClickhouseReadSkipCache.instance = new ClickhouseReadSkipCache(prisma);
    }
    return ClickhouseReadSkipCache.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initializing) {
      if (this.initPromise) {
        await this.initPromise;
      }
      return;
    }

    this.initializing = true;
    this.initPromise = this.performInitialization();

    try {
      await this.initPromise;
      this.initialized = true;
    } catch (error) {
      this.initializing = false;
      this.initPromise = null;
      throw error;
    }
  }

  private async performInitialization(): Promise<void> {
    if (!env.LANGFUSE_SKIP_INGESTION_CLICKHOUSE_READ_MIN_PROJECT_CREATE_DATE) {
      logger.info(
        "No min project create date set, ClickhouseReadSkipCache will not pre-populate",
      );
      return;
    }

    const cutoffDate = new Date(
      env.LANGFUSE_SKIP_INGESTION_CLICKHOUSE_READ_MIN_PROJECT_CREATE_DATE,
    );

    logger.info(
      `Initializing ClickhouseReadSkipCache with cutoff date: ${cutoffDate.toISOString()}`,
    );

    try {
      const projects = await this.prisma.project.findMany({
        where: {
          deletedAt: null,
        },
        select: {
          id: true,
          createdAt: true,
        },
      });

      let skipCount = 0;
      let noSkipCount = 0;

      for (const project of projects) {
        const shouldSkip = project.createdAt >= cutoffDate;
        this.projectSkipMap.set(project.id, shouldSkip);

        if (shouldSkip) {
          skipCount++;
        } else {
          noSkipCount++;
        }
      }

      logger.debug(
        `ClickhouseReadSkipCache initialized with ${projects.length} projects (${skipCount} will skip, ${noSkipCount} will not skip)`,
      );
    } catch (error) {
      logger.error("Failed to initialize ClickhouseReadSkipCache", error);
      throw error;
    }
  }

  public async shouldSkipClickHouseRead(
    projectId: string,
    minProjectCreateDate?: string,
  ): Promise<boolean> {
    // Check explicit project ID list first
    if (
      env.LANGFUSE_SKIP_INGESTION_CLICKHOUSE_READ_PROJECT_IDS &&
      env.LANGFUSE_SKIP_INGESTION_CLICKHOUSE_READ_PROJECT_IDS.split(
        ",",
      ).includes(projectId)
    ) {
      return true;
    }

    // If no cutoff date configuration, don't skip
    if (
      !env.LANGFUSE_SKIP_INGESTION_CLICKHOUSE_READ_MIN_PROJECT_CREATE_DATE &&
      !minProjectCreateDate
    ) {
      return false;
    }

    // Ensure the cache is initialized
    if (!this.initialized) {
      await this.initialize();
    }

    // Check if we have the project in our cache
    if (this.projectSkipMap.has(projectId)) {
      return this.projectSkipMap.get(projectId) ?? false;
    }

    // If not in cache, we need to fetch the project
    logger.debug(`Project ${projectId} not in cache, fetching from database`);

    try {
      const project = await this.prisma.project.findFirst({
        where: {
          id: projectId,
          deletedAt: null,
        },
        select: {
          id: true,
          createdAt: true,
        },
      });

      if (!project) {
        throw new LangfuseNotFoundError(`Project ${projectId} not found`);
      }

      const cutoffDate = new Date(
        env.LANGFUSE_SKIP_INGESTION_CLICKHOUSE_READ_MIN_PROJECT_CREATE_DATE ??
          minProjectCreateDate ??
          new Date(), // Fallback to today. Should never apply.
      );

      const shouldSkip = project.createdAt >= cutoffDate;

      // Cache the result for future use
      this.projectSkipMap.set(projectId, shouldSkip);

      return shouldSkip;
    } catch (error) {
      logger.error(
        `Failed to fetch project ${projectId} for ClickHouse skip check`,
        error,
      );
      throw error;
    }
  }
}
