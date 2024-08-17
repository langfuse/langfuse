import { env } from "@/src/env.mjs";
import {
  addUserToSpan,
  createShaHash,
  recordIncrement,
  verifySecretKey,
  type AuthHeaderVerificationResult,
} from "@langfuse/shared/src/server";
import { type PrismaClient, type ApiKey } from "@langfuse/shared/src/db";
import { isPrismaException } from "@/src/utils/exceptions";
import { type Redis } from "ioredis";
import { z } from "zod";

export const ApiKeyZod = z.object({
  id: z.string(),
  note: z.string().nullable(),
  publicKey: z.string(),
  hashedSecretKey: z.string(),
  fastHashedSecretKey: z.string().nullable(),
  displaySecretKey: z.string(),
  createdAt: z.string().datetime().nullable(),
  lastUsedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  projectId: z.string(),
});

const API_KEY_NON_EXISTENT = "api-key-non-existent";

export const CachedApiKey = z.union([
  ApiKeyZod,
  z.literal(API_KEY_NON_EXISTENT),
]);

export class ApiAuthService {
  prisma: PrismaClient;
  redis: Redis | null;

  constructor(prisma: PrismaClient, redis: Redis | null) {
    this.prisma = prisma;
    this.redis = redis;
  }

  async deleteApiKey(id: string, projectId: string) {
    // Make sure the API key exists and belongs to the project the user has access to
    const apiKey = await this.prisma.apiKey.findFirstOrThrow({
      where: {
        id: id,
        projectId: projectId,
      },
    });
    if (!apiKey) {
      return false;
    }

    // if redis is available, delete the key from there as well
    // delete from redis even if caching is disabled via env for consistency
    if (this.redis && apiKey.fastHashedSecretKey) {
      await this.redis.del(this.createRedisKey(apiKey.fastHashedSecretKey));
    }

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
    if (!authHeader) {
      console.error("No authorization header");
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
        const apiKey = await this.fetchApiKeyAndAddToRedis(hashFromProvidedKey);

        let projectId = apiKey?.projectId;

        if (!apiKey || !apiKey.fastHashedSecretKey) {
          const dbKey = await this.prisma.apiKey.findUnique({
            where: { publicKey },
          });

          if (!dbKey) {
            console.error("No key found for public key", publicKey);
            if (this.redis) {
              console.log(
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
            dbKey.hashedSecretKey,
          );

          if (!isValid) {
            console.log("Old key is invalid", publicKey);
            throw new Error("Invalid credentials");
          }

          const shaKey = createShaHash(secretKey, salt);

          await this.prisma.apiKey.update({
            where: { publicKey },
            data: {
              fastHashedSecretKey: shaKey,
            },
          });
          projectId = dbKey.projectId;
        }

        if (!projectId) {
          console.log("No project id found for key", publicKey);
          throw new Error("Invalid credentials");
        }

        addUserToSpan({ projectId });

        return {
          validKey: true,
          scope: {
            projectId: projectId,
            accessLevel: "all",
          },
        };
      }
      // Bearer auth, limited scope, only needs public key
      if (authHeader.startsWith("Bearer ")) {
        const publicKey = authHeader.replace("Bearer ", "");

        const dbKey = await this.findDbKeyOrThrow(publicKey);

        addUserToSpan({ projectId: dbKey.projectId });

        return {
          validKey: true,
          scope: {
            projectId: dbKey.projectId,
            accessLevel: "scores",
          },
        };
      }
    } catch (error: unknown) {
      console.error(
        `Error verifying auth header: ${error instanceof Error ? error.message : null}`,
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
  }

  extractBasicAuthCredentials(basicAuthHeader: string): {
    username: string;
    password: string;
  } {
    const authValue = basicAuthHeader.split(" ")[1];
    if (!authValue) throw new Error("Invalid authorization header");

    const [username, password] = atob(authValue).split(":");
    if (!username || !password) throw new Error("Invalid authorization header");
    return { username, password };
  }

  async findDbKeyOrThrow(publicKey: string) {
    const dbKey = await this.prisma.apiKey.findUnique({
      where: { publicKey },
    });
    if (!dbKey) {
      console.log("No api key found for public key:", publicKey);
      throw new Error("Invalid public key");
    }
    return dbKey;
  }

  async fetchApiKeyAndAddToRedis(hash: string) {
    // first get the API key from redis, this does not throw
    const redisApiKey = await this.fetchApiKeyFromRedis(hash);

    if (redisApiKey === API_KEY_NON_EXISTENT) {
      recordIncrement("api_key_cache_hit", 1);
      throw new Error("Invalid credentials");
    }

    // if we found something, return the object.
    if (redisApiKey) {
      recordIncrement("api_key_cache_hit", 1);
      return redisApiKey;
    }

    recordIncrement("api_key_cache_miss", 1);

    // if redis not available or object not found, try the database
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { fastHashedSecretKey: hash },
    });

    // add the key to redis for future use if available, this does not throw
    // only do so if the new hashkey exists already.
    if (apiKey && apiKey.fastHashedSecretKey) {
      await this.addApiKeyToRedis(hash, apiKey);
    }
    return apiKey;
  }

  async addApiKeyToRedis(
    hash: string,
    apiKey: ApiKey | typeof API_KEY_NON_EXISTENT,
  ) {
    if (!this.redis || env.LANGFUSE_CACHE_API_KEY_ENABLED !== "true") {
      return;
    }

    try {
      await this.redis.set(
        this.createRedisKey(hash),
        JSON.stringify(apiKey),
        "EX",
        env.LANGFUSE_CACHE_API_KEY_TTL_SECONDS, // redis API is in seconds
      );
    } catch (error: unknown) {
      console.error("Error adding key to redis", error);
    }
  }

  async fetchApiKeyFromRedis(hash: string) {
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
        console.error(
          "Failed to parse API key from Redis:",
          parsedApiKey.error,
        );
      }
      return null;
    } catch (error: unknown) {
      console.error("Error fetching key from redis", error);
      return null;
    }
  }

  createRedisKey(hash: string) {
    return `api-key:${hash}`;
  }
}
