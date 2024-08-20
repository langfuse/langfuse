import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import {
  type RateLimitResponse,
  type RateLimitRessource,
  RateLimitService,
} from "@/src/features/public-api/server/RateLimitService";
import { type PrismaClient } from "@langfuse/shared/src/db";
import { type ApiKeyZod, recordIncrement } from "@langfuse/shared/src/server";
import type Redis from "ioredis";
import { type NextApiResponse, type NextApiRequest } from "next";
import { type RateLimiterRes } from "rate-limiter-flexible";
import { type z } from "zod";

export class AuthAndRateLimit {
  apiKey: z.infer<typeof ApiKeyZod> | undefined;
  prisma: PrismaClient;
  redis: Redis | null;
  ressource: RateLimitRessource;

  constructor(
    resource: RateLimitRessource,
    prisma: PrismaClient,
    redis: Redis | null,
  ) {
    this.apiKey = undefined;
    this.prisma = prisma;
    this.redis = redis;
    this.ressource = resource;
  }

  authAndRateLimit = async (req: NextApiRequest, res: NextApiResponse) => {
    const authCheck = await new ApiAuthService(
      this.prisma,
      this.redis,
    ).verifyAuthHeaderAndReturnScope(req.headers.authorization);

    if (!authCheck.validKey) {
      return { authCheck, rateLimitCheck: undefined };
    }

    this.apiKey = authCheck.apiKey;

    // returns http response in case of rate limit exceeded
    const rateLimitCheck = this.redis
      ? await new RateLimitService(this.redis).rateLimitRequest(
          authCheck.apiKey,
          this.ressource,
          res,
        )
      : undefined;

    return { authCheck, rateLimitCheck };
  };

  createAndSendRateLimitedResponse = (
    res: NextApiResponse,
    rateLimitRes: RateLimitResponse,
  ) => {
    if (!this.apiKey) {
      throw new Error("No api key found for rate limit exceeded response");
    }

    recordIncrement("rate-limit-exceeded", 1, {
      orgId: this.apiKey?.orgId,
      plan: this.apiKey.plan,
      ressource: this.ressource,
    });

    return res.writeHead(
      429,
      this.createHttpHeaderFromRateLimit(
        rateLimitRes.res,
        rateLimitRes.opts.points,
      ),
    );
  };

  createHttpHeaderFromRateLimit = (res: RateLimiterRes, points: number) => {
    return {
      "Retry-After": res.msBeforeNext / 1000,
      "X-RateLimit-Limit": points,
      "X-RateLimit-Remaining": res.remainingPoints,
      "X-RateLimit-Reset": new Date(Date.now() + res.msBeforeNext).toString(),
    };
  };
}
