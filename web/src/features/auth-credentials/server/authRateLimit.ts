import { createHash } from "crypto";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { type Cluster, type Redis } from "ioredis";
import type { NextApiRequest, NextApiResponse } from "next";

import { env } from "@/src/env.mjs";
import {
  createNewRedisInstance,
  logger,
  recordIncrement,
  redisQueueRetryOptions,
} from "@langfuse/shared/src/server";

export const AUTH_RATE_LIMIT_REDIS_KEY_PREFIX = "rate-limit:auth";

export type AuthRateLimitResource = "auth-login" | "auth-signup";

const REDIS_RETRY_COOLDOWN_MS = 5_000;

const AUTH_RATE_LIMITS: Record<
  AuthRateLimitResource,
  {
    ip: { points: number; durationInSec: number };
    email?: { points: number; durationInSec: number };
  }
> = {
  // Login is high-volume in shared NAT offices; keep IP generous and email tighter.
  "auth-login": {
    ip: { points: 30, durationInSec: 15 * 60 },
    email: { points: 10, durationInSec: 15 * 60 },
  },
  // Signup is unauthenticated: never key by email. An attacker can put a
  // victim's address in the body and exhaust that bucket (429 for up to an hour).
  "auth-signup": {
    ip: { points: 10, durationInSec: 60 * 60 },
  },
};

const redisStatus = (redis: Redis | Cluster) =>
  "status" in redis ? redis.status : undefined;

const getRetryAfterSeconds = (msBeforeNext: number | undefined) =>
  Math.max(1, Math.ceil((msBeforeNext ?? 1000) / 1000));

export const getRequestIp = (req: NextApiRequest): string => {
  const forwarded = req.headers["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const forwardedIp = forwardedValue?.split(",")[0]?.trim();
  if (forwardedIp) {
    return forwardedIp;
  }

  const realIpHeader = req.headers["x-real-ip"];
  const realIp = Array.isArray(realIpHeader) ? realIpHeader[0] : realIpHeader;
  if (realIp?.trim()) {
    return realIp.trim();
  }

  const cfIpHeader = req.headers["cf-connecting-ip"];
  const cfIp = Array.isArray(cfIpHeader) ? cfIpHeader[0] : cfIpHeader;
  if (cfIp?.trim()) {
    return cfIp.trim();
  }

  return req.socket?.remoteAddress ?? "unknown";
};

export const getEmailFromRequestBody = (body: unknown): string | undefined => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return undefined;
  }

  const email = (body as Record<string, unknown>).email;
  if (typeof email !== "string") {
    return undefined;
  }

  const normalized = email.trim().toLowerCase();
  return normalized.includes("@") ? normalized : undefined;
};

const hashEmail = (email: string) =>
  createHash("sha256").update(email).digest("hex");

type AuthRateLimitHit = {
  resource: AuthRateLimitResource;
  keyKind: "ip" | "email";
  points: number;
  remainingPoints: number;
  msBeforeNext: number;
};

export class AuthRateLimitService {
  private static instance: AuthRateLimitService | null = null;
  private static redis: Redis | Cluster | null = null;

  private redisUnavailableUntilMs = 0;
  private redisConnectPromise: Promise<void> | null = null;

  public static getInstance(redis?: Redis | Cluster | null) {
    if (!AuthRateLimitService.instance || redis !== undefined) {
      AuthRateLimitService.redis =
        redis !== undefined
          ? redis
          : createNewRedisInstance({
              keyPrefix: process.env.REDIS_KEY_PREFIX ?? undefined,
              enableAutoPipelining: false,
              enableOfflineQueue: false,
              lazyConnect: true,
              ...redisQueueRetryOptions,
            });
      AuthRateLimitService.instance = new AuthRateLimitService();
    }

    return AuthRateLimitService.instance;
  }

  public static shutdown() {
    const redis = AuthRateLimitService.redis;
    if (redis && redisStatus(redis) !== "end") {
      redis.disconnect();
    }
    AuthRateLimitService.redis = null;
    AuthRateLimitService.instance = null;
  }

  public async consume(params: {
    resource: AuthRateLimitResource;
    ip: string;
    email?: string;
  }): Promise<AuthRateLimitHit | undefined> {
    if (env.LANGFUSE_RATE_LIMITS_ENABLED === "false") {
      return undefined;
    }

    const redis = AuthRateLimitService.redis;
    if (!redis) {
      this.allowBecauseRateLimitUnavailable(
        params.resource,
        "Redis is not configured for auth rate limiting",
      );
      return undefined;
    }

    if (Date.now() < this.redisUnavailableUntilMs) {
      this.allowBecauseRateLimitUnavailable(
        params.resource,
        "Redis is temporarily unavailable",
      );
      return undefined;
    }

    try {
      await this.ensureRedisReady(redis);
    } catch (error) {
      this.markRedisUnavailable(params.resource, error);
      return undefined;
    }

    const limits = AUTH_RATE_LIMITS[params.resource];
    const ipHit = await this.consumeLimiter({
      redis,
      resource: params.resource,
      keyKind: "ip",
      key: params.ip,
      points: limits.ip.points,
      durationInSec: limits.ip.durationInSec,
    });
    if (ipHit) {
      return ipHit;
    }

    if (!params.email || !limits.email) {
      return undefined;
    }

    return await this.consumeLimiter({
      redis,
      resource: params.resource,
      keyKind: "email",
      key: hashEmail(params.email),
      points: limits.email.points,
      durationInSec: limits.email.durationInSec,
    });
  }

  private async ensureRedisReady(redis: Redis | Cluster) {
    if (redisStatus(redis) === "ready") {
      return;
    }

    this.redisConnectPromise ??= redis.connect().finally(() => {
      this.redisConnectPromise = null;
    });

    await this.redisConnectPromise;
  }

  private async consumeLimiter(params: {
    redis: Redis | Cluster;
    resource: AuthRateLimitResource;
    keyKind: "ip" | "email";
    key: string;
    points: number;
    durationInSec: number;
  }): Promise<AuthRateLimitHit | undefined> {
    const limiter = new RateLimiterRedis({
      storeClient: params.redis,
      keyPrefix: `${AUTH_RATE_LIMIT_REDIS_KEY_PREFIX}:${params.resource}:${params.keyKind}`,
      points: params.points,
      duration: params.durationInSec,
      rejectIfRedisNotReady: true,
    });

    try {
      await limiter.consume(params.key);
      return undefined;
    } catch (error) {
      if (error instanceof RateLimiterRes) {
        recordIncrement("langfuse.rate_limit.exceeded", 1, {
          resource: params.resource,
          keyKind: params.keyKind,
        });
        return {
          resource: params.resource,
          keyKind: params.keyKind,
          points: params.points,
          remainingPoints: error.remainingPoints,
          msBeforeNext: error.msBeforeNext,
        };
      }

      this.markRedisUnavailable(params.resource, error);
      return undefined;
    }
  }

  private markRedisUnavailable(
    resource: AuthRateLimitResource,
    error: unknown,
  ) {
    this.redisUnavailableUntilMs = Date.now() + REDIS_RETRY_COOLDOWN_MS;
    logger.warn("Auth rate limiter unavailable", {
      resource,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    this.allowBecauseRateLimitUnavailable(
      resource,
      "Redis is temporarily unavailable",
    );
  }

  private allowBecauseRateLimitUnavailable(
    resource: AuthRateLimitResource,
    reason: string,
  ) {
    logger.warn("Auth request allowed because rate limiting failed", {
      resource,
      reason,
    });
  }
}

const sendAuthRateLimitResponse = (
  res: NextApiResponse,
  hit: AuthRateLimitHit,
) => {
  const retryAfterSeconds = getRetryAfterSeconds(hit.msBeforeNext);
  res.setHeader("Retry-After", retryAfterSeconds);
  res.setHeader("X-RateLimit-Limit", hit.points);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, hit.remainingPoints));
  res.status(429).json({
    message: `Too many requests. Please retry in ${retryAfterSeconds} seconds.`,
  });
};

/**
 * Returns true when the request was rejected with 429.
 * Fails open if Redis is unavailable so login/signup keep working.
 */
export async function applyAuthRateLimit(
  req: NextApiRequest,
  res: NextApiResponse,
  resource: AuthRateLimitResource,
): Promise<boolean> {
  try {
    const hit = await AuthRateLimitService.getInstance().consume({
      resource,
      ip: getRequestIp(req),
      email: getEmailFromRequestBody(req.body),
    });

    if (!hit) {
      return false;
    }

    sendAuthRateLimitResponse(res, hit);
    return true;
  } catch (error) {
    logger.warn("Auth rate limiting failed open", {
      resource,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}
