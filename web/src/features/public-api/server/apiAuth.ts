import { env } from "@/src/env.mjs";
import {
  createShaHash,
  recordIncrement,
  verifySecretKey,
  type AuthHeaderVerificationResult,
  CachedApiKey,
  OrgEnrichedApiKey,
  logger,
  instrumentAsync,
  addUserToSpan,
  invalidateCachedApiKeys as invalidateCachedApiKeysShared,
  invalidateCachedOrgApiKeys as invalidateCachedOrgApiKeysShared,
  invalidateCachedProjectApiKeys as invalidateCachedProjectApiKeysShared,
} from "@langfuse/shared/src/server";
import {
  type PrismaClient,
  type ApiKey,
  type Prisma,
  type ApiKeyScope,
} from "@langfuse/shared/src/db";
import { isPrismaException } from "@/src/utils/exceptions";
import { type Redis, type Cluster } from "ioredis";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server/getPlan";
import { API_KEY_NON_EXISTENT } from "@langfuse/shared/src/server";
import { type z } from "zod/v4";
import { CloudConfigSchema, isPlan } from "@langfuse/shared";

export class ApiAuthService {
  prisma: PrismaClient;
  redis: Redis | Cluster | null;

  constructor(prisma: PrismaClient, redis: Redis | Cluster | null) {
    this.prisma = prisma;
    this.redis = redis;
  }

  // this function needs to be called, when the organisation is updated
  // - when projects move across organisations, the orgId in the API key cache needs to be updated
  // - when the plan of the org changes, the plan in the API key cache needs to be updated as well
  async invalidateCachedApiKeys(apiKeys: ApiKey[], identifier: string) {
    await invalidateCachedApiKeysShared(apiKeys, identifier, this.redis);
  }

  async invalidateCachedOrgApiKeys(orgId: string) {
    await invalidateCachedOrgApiKeysShared(orgId, this.redis);
  }

  async invalidateCachedProjectApiKeys(projectId: string) {
    await invalidateCachedProjectApiKeysShared(projectId, this.redis);
  }

  /**
   * Deletes an API key from the database and invalidates it in Redis if available.
   * @param id - The ID of the API key to delete.
   * @param entityId - The ID of the entity (project or organization) to which the API key belongs.
   * @param scope - The scope of the API key (either "PROJECT" or "ORGANIZATION").
   */
  async deleteApiKey(id: string, entityId: string, scope: ApiKeyScope) {
    const entity =
      scope === "PROJECT" ? { projectId: entityId } : { orgId: entityId };
    // Make sure the API key exists and belongs to the project the user has access to
    const apiKey = await this.prisma.apiKey.findFirstOrThrow({
      where: {
        ...entity,
        id: id,
        scope,
      },
    });
    if (!apiKey) {
      return false;
    }

    // if redis is available, delete the key from there as well
    // delete from redis even if caching is disabled via env for consistency
    await this.invalidateCachedApiKeys([apiKey], `key ${id}`);

    await this.prisma.apiKey.delete({
      where: {
        id: apiKey.id,
      },
    });
    return true;
  }

  async verifyAuthHeaderAndReturnScope(
    authHeader: string | undefined,
  ): Promise<AuthHeaderVerificationResult> {
    const result: AuthHeaderVerificationResult = await instrumentAsync(
      { name: "api-auth-verify" },
      async () => {
        if (!authHeader) {
          logger.debug("No authorization header");
          return {
            validKey: false,
            error: "No authorization header",
          };
        }

        try {
          // Basic auth, full scope, needs secret key and public key
          if (authHeader.startsWith("Basic ")) {
            const { username: publicKey, password: secretKey } =
              this.extractBasicAuthCredentials(authHeader);

            const salt = env.SALT;
            const hashFromProvidedKey = createShaHash(secretKey, salt);

            // fetches by redis if available, fallback to postgres
            // api key from redis does
            const apiKey =
              await this.fetchApiKeyAndAddToRedis(hashFromProvidedKey);

            let finalApiKey = apiKey;

            if (!apiKey || !apiKey.fastHashedSecretKey) {
              const slowKey = await this.prisma.apiKey.findUnique({
                where: { publicKey },
                include: {
                  project: { include: { organization: true } },
                  organization: true,
                },
              });

              if (!slowKey) {
                logger.error("No key found for public key", publicKey);
                if (this.redis) {
                  logger.info(
                    `No key found, storing ${API_KEY_NON_EXISTENT} in redis`,
                  );
                  await this.addApiKeyToRedis(
                    hashFromProvidedKey,
                    API_KEY_NON_EXISTENT,
                  );
                }
                throw new Error("Invalid credentials");
              }

              const isValid = await verifySecretKey(
                secretKey,
                slowKey.hashedSecretKey,
              );

              if (!isValid) {
                logger.debug(`Old key is invalid: ${publicKey}`);
                throw new Error("Invalid credentials");
              }

              const shaKey = createShaHash(secretKey, salt);

              await this.prisma.apiKey.update({
                where: { publicKey },
                data: {
                  fastHashedSecretKey: shaKey,
                },
              });
              finalApiKey = this.convertToRedisRepresentation({
                ...slowKey,
                fastHashedSecretKey: shaKey,
              });
            }

            if (!finalApiKey) {
              logger.info("No project id found for key", publicKey);
              throw new Error("Invalid credentials");
            }

            const plan = finalApiKey.plan;

            if (!isPlan(plan)) {
              logger.error("Invalid plan type for key", finalApiKey.plan);
              throw new Error("Invalid credentials");
            }

            addUserToSpan({
              projectId: finalApiKey.projectId ?? undefined,
              orgId: finalApiKey.orgId,
              plan,
            });

            const accessLevel =
              finalApiKey.scope === "ORGANIZATION" ? "organization" : "project";

            return {
              validKey: true,
              scope: {
                projectId: finalApiKey.projectId,
                accessLevel,
                orgId: finalApiKey.orgId,
                plan: plan,
                rateLimitOverrides: finalApiKey.rateLimitOverrides ?? [],
                apiKeyId: finalApiKey.id,
                scope: finalApiKey.scope,
                publicKey,
                isIngestionSuspended: finalApiKey.isIngestionSuspended,
              },
            };
          }
          // Bearer auth, limited scope, only needs public key
          if (authHeader.startsWith("Bearer ")) {
            const publicKey = authHeader.replace("Bearer ", "");

            const dbKey = await this.findDbKeyOrThrow(publicKey);

            if (dbKey.scope === "ORGANIZATION") {
              throw new Error(
                "Unauthorized: Cannot use organization key with bearer auth",
              );
            }

            const { orgId, cloudConfig, cloudFreeTierUsageThresholdState } =
              this.extractOrgIdAndCloudConfig(dbKey);

            addUserToSpan({
              projectId: dbKey.projectId ?? undefined,
              orgId,
              plan: getOrganizationPlanServerSide(cloudConfig),
            });

            return {
              validKey: true,
              scope: {
                projectId: dbKey.projectId,
                accessLevel: "scores",
                orgId,
                plan: getOrganizationPlanServerSide(cloudConfig),
                rateLimitOverrides: cloudConfig?.rateLimitOverrides ?? [],
                apiKeyId: dbKey.id,
                scope: dbKey.scope,
                publicKey,
                isIngestionSuspended:
                  cloudFreeTierUsageThresholdState === "BLOCKED",
              },
            };
          }
        } catch (error: unknown) {
          logger.info(
            `Error verifying auth header: ${error instanceof Error ? error.message : null}`,
            error,
          );

          if (isPrismaException(error)) {
            throw error;
          }

          return {
            validKey: false,
            error:
              (error instanceof Error ? error.message : "Authorization error") +
              ". Confirm that you've configured the correct host.",
          };
        }
        return {
          validKey: false,
          error: "Invalid authorization header",
        };
      },
    );

    return result;
  }

  private extractBasicAuthCredentials(basicAuthHeader: string): {
    username: string;
    password: string;
  } {
    const authValue = basicAuthHeader.split(" ")[1];
    if (!authValue) throw new Error("Invalid authorization header");

    const [username, password] = atob(authValue).split(":");
    if (!username || !password) throw new Error("Invalid authorization header");
    return { username, password };
  }

  private async findDbKeyOrThrow(publicKey: string) {
    const dbKey = await this.prisma.apiKey.findUnique({
      where: { publicKey },
      include: {
        project: { include: { organization: true } },
        organization: true,
      },
    });
    if (!dbKey) {
      logger.info("No api key found for public key:", publicKey);
      throw new Error("Invalid public key");
    }
    return dbKey;
  }

  private async fetchApiKeyAndAddToRedis(hash: string) {
    // first get the API key from redis, this does not throw
    const redisApiKey = await this.fetchApiKeyFromRedis(hash);

    if (redisApiKey === API_KEY_NON_EXISTENT) {
      recordIncrement("langfuse.api_key.cache_hit", 1);
      throw new Error("Invalid credentials");
    }

    // if we found something, return the object.
    if (redisApiKey) {
      recordIncrement("langfuse.api_key.cache_hit", 1);
      return redisApiKey;
    }

    recordIncrement("langfuse.api_key.cache_miss", 1);

    // if redis not available or object not found, try the database
    const apiKeyAndOrganisation = await this.prisma.apiKey.findUnique({
      where: { fastHashedSecretKey: hash },
      include: {
        project: { include: { organization: true } },
        organization: true,
      },
    });

    // add the key to redis for future use if available, this does not throw
    // only do so if the new hashkey exists already.
    if (apiKeyAndOrganisation && apiKeyAndOrganisation.fastHashedSecretKey) {
      await this.addApiKeyToRedis(
        hash,
        this.convertToRedisRepresentation(apiKeyAndOrganisation),
      );
    }
    return apiKeyAndOrganisation
      ? this.convertToRedisRepresentation(apiKeyAndOrganisation)
      : null;
  }

  private async addApiKeyToRedis(
    hash: string,
    newApiKey: z.infer<typeof OrgEnrichedApiKey> | typeof API_KEY_NON_EXISTENT,
  ) {
    if (!this.redis || env.LANGFUSE_CACHE_API_KEY_ENABLED !== "true") {
      return;
    }

    try {
      await this.redis.set(
        this.createRedisKey(hash),
        JSON.stringify(newApiKey),
        "EX",
        env.LANGFUSE_CACHE_API_KEY_TTL_SECONDS, // redis API is in seconds
      );
    } catch (error: unknown) {
      logger.error("Error adding key to redis", error);
    }
  }

  private async fetchApiKeyFromRedis(hash: string) {
    if (!this.redis || env.LANGFUSE_CACHE_API_KEY_ENABLED !== "true") {
      return null;
    }

    try {
      const redisApiKey = await this.redis.getex(
        this.createRedisKey(hash),
        "EX",
        env.LANGFUSE_CACHE_API_KEY_TTL_SECONDS, // redis API is in seconds
      );

      if (!redisApiKey) {
        return null;
      }

      const parsedApiKey = CachedApiKey.safeParse(JSON.parse(redisApiKey));

      if (parsedApiKey.success) {
        return parsedApiKey.data;
      }

      if (!parsedApiKey.success) {
        logger.error(
          "Failed to parse API key from Redis, deleting existing key from cache",
          parsedApiKey.error,
        );
        await this.redis.del(this.createRedisKey(hash));
      }
      return null;
    } catch (error: unknown) {
      logger.error("Error fetching key from redis", error);
      return null;
    }
  }

  private createRedisKey(hash: string) {
    return `api-key:${hash}`;
  }

  private extractOrgIdAndCloudConfig(
    apiKeyAndOrganisation: ApiKey & {
      project: {
        id: string;
        organization: {
          id: string;
          name: string;
          createdAt: Date;
          updatedAt: Date;
          cloudConfig: Prisma.JsonValue;
          cloudFreeTierUsageThresholdState: string | null;
        };
      } | null;
    } & {
      organization: {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        cloudConfig: Prisma.JsonValue;
        cloudFreeTierUsageThresholdState: string | null;
      } | null;
    },
  ) {
    const orgId =
      apiKeyAndOrganisation.project?.organization.id ??
      apiKeyAndOrganisation.organization?.id;
    const rawCloudConfig =
      apiKeyAndOrganisation.project?.organization.cloudConfig ??
      apiKeyAndOrganisation.organization?.cloudConfig;
    const cloudFreeTierUsageThresholdState =
      apiKeyAndOrganisation.project?.organization
        .cloudFreeTierUsageThresholdState ??
      apiKeyAndOrganisation.organization?.cloudFreeTierUsageThresholdState;

    if (!orgId) {
      logger.error(
        `No organization found for key: ${apiKeyAndOrganisation.publicKey}`,
      );
      throw new Error("Invalid credentials: No organization found for key");
    }

    const cloudConfig = rawCloudConfig
      ? CloudConfigSchema.parse(rawCloudConfig)
      : undefined;

    return {
      orgId,
      cloudConfig,
      cloudFreeTierUsageThresholdState,
    };
  }

  /**
   * Converts the API key and organization to a Redis representation.
   * For project-scoped API keys, it includes the project ID and organization.
   * For organization-scoped API keys, it includes only the organization.
   * @param apiKeyAndOrganisation
   */
  private convertToRedisRepresentation(
    apiKeyAndOrganisation: ApiKey & {
      project: {
        id: string;
        organization: {
          id: string;
          name: string;
          createdAt: Date;
          updatedAt: Date;
          cloudConfig: Prisma.JsonValue;
          cloudFreeTierUsageThresholdState: string | null;
        };
      } | null;
    } & {
      organization: {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        cloudConfig: Prisma.JsonValue;
        cloudFreeTierUsageThresholdState: string | null;
      } | null;
    },
  ) {
    const { orgId, cloudConfig, cloudFreeTierUsageThresholdState } =
      this.extractOrgIdAndCloudConfig(apiKeyAndOrganisation);

    const newApiKey = OrgEnrichedApiKey.parse({
      ...apiKeyAndOrganisation,
      createdAt: apiKeyAndOrganisation.createdAt?.toISOString(),
      orgId,
      plan: getOrganizationPlanServerSide(cloudConfig),
      rateLimitOverrides: cloudConfig?.rateLimitOverrides,
      isIngestionSuspended: cloudFreeTierUsageThresholdState === "BLOCKED",
    });

    if (!orgId) {
      logger.error("No organization found for key");
      throw new Error("Invalid credentials");
    }

    return newApiKey;
  }
}
