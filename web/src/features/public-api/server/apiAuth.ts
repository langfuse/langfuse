import { env } from "@/src/env.mjs";
import { createShaHash, verifySecretKey } from "@langfuse/shared/src/server";
import { type ApiAccessScope } from "@/src/features/public-api/server/types";
import {
  type PrismaClient,
  prisma,
  type ApiKey,
} from "@langfuse/shared/src/db";
import { isPrismaException } from "@/src/utils/exceptions";
import * as Sentry from "@sentry/node";
import { type Redis } from "ioredis";
import { z } from "zod";

export type AuthHeaderVerificationResult =
  | AuthHeaderValidVerificationResult
  | {
      validKey: false;
      error: string;
    };

export type AuthHeaderValidVerificationResult = {
  validKey: true;
  scope: ApiAccessScope;
};

const ApiKey = z.object({
  id: z.string(),
  createdAt: z.date(),
  note: z.string().nullable(),
  publicKey: z.string(),
  hashedSecretKey: z.string(),
  fastHashedSecretKey: z.string().nullable(),
  displaySecretKey: z.string(),
  lastUsedAt: z.date().nullable(),
  expiresAt: z.date().nullable(),
  projectId: z.string(),
});

class ApiAuthService {
  prisma: PrismaClient;
  redis: Redis | undefined;

  constructor(prisma: PrismaClient, redis?: Redis) {
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

    await prisma.apiKey.delete({
      where: {
        id: apiKey.id,
      },
    });

    // if redis is available, delete the key from there as well
    // delete from redis even if caching is disabled via env for consistency
    if (this.redis && apiKey.fastHashedSecretKey) {
      await this.redis.del(this.createRedisKey(apiKey.fastHashedSecretKey));
    }
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
        const apiKey = await this.fetchApiKeyByHash(hashFromProvidedKey);

        let projectId = apiKey?.projectId;

        if (!apiKey || !apiKey.fastHashedSecretKey) {
          const dbKey = await this.findDbKeyOrThrow(publicKey);
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

        Sentry.setUser({
          id: projectId,
        });

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
        Sentry.setUser({
          id: dbKey.projectId,
        });

        return {
          validKey: true,
          scope: {
            projectId: dbKey.projectId,
            accessLevel: "scores",
          },
        };
      }
    } catch (error: unknown) {
      console.error("Error verifying auth header: ", error);

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

  async fetchApiKeyByHash(hash: string) {
    // first get the API key from redis, this does not throw
    const redisApiKey = await this.fetchApiKeyFromRedis(hash);

    // if we found something, return the object.
    if (redisApiKey) {
      return redisApiKey;
    }

    // if redis not available or object not found, try the database
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { fastHashedSecretKey: hash },
    });

    // add the key to redis for future use if available, this does not throw
    if (apiKey) {
      await this.addApiKeyToRedis(hash, apiKey);
    }
    return apiKey;
  }

  async addApiKeyToRedis(hash: string, apiKey: ApiKey) {
    if (!this.redis || !env.LANGFUSE_CACHE_APIKEY_ENABLED) {
      return;
    }

    try {
      await this.redis.set(
        this.createRedisKey(hash),
        JSON.stringify(apiKey),
        "EX",
        env.LANGFUSE_CACHE_APIKEY_TTL,
      );
    } catch (error: unknown) {
      console.error("Error adding key to redis", error);
    }
  }

  async fetchApiKeyFromRedis(hash: string) {
    if (!this.redis || !env.LANGFUSE_CACHE_APIKEY_ENABLED) {
      return null;
    }

    try {
      const redisApiKey = await this.redis.get(this.createRedisKey(hash));

      const parsedApiKey = ApiKey.safeParse(redisApiKey);

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
