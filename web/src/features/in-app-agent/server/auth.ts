import crypto from "crypto";
import { z } from "zod";

import { env } from "@/src/env.mjs";

const IN_APP_AGENT_SESSION_TOKEN_PREFIX = "lfcas_";
const IN_APP_AGENT_SESSION_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export class InvalidInAppAgentSessionTokenError extends Error {
  constructor() {
    super("Invalid in-app agent session token");
    this.name = "InvalidInAppAgentSessionTokenError";
  }
}

const InAppAgentSessionTokenPayloadSchema = z.object({
  v: z.literal(1),
  userId: z.string(),
  projectId: z.string(),
  threadId: z.string(),
  claudeSessionId: z.string(),
  langfuseTraceId: z.string(),
  exp: z.number().int(),
});

const EncodedInAppAgentSessionTokenPayloadSchema = z
  .string()
  .transform((payload, ctx) => {
    try {
      return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Invalid token payload",
      });
      return z.NEVER;
    }
  })
  .pipe(InAppAgentSessionTokenPayloadSchema);

const InAppAgentSessionTokenSchema = z
  .string()
  .startsWith(IN_APP_AGENT_SESSION_TOKEN_PREFIX)
  .transform((token, ctx) => {
    const [encodedPayload, signature, ...extraParts] = token
      .slice(IN_APP_AGENT_SESSION_TOKEN_PREFIX.length)
      .split(".");

    if (!encodedPayload || !signature || extraParts.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid token format",
      });
      return z.NEVER;
    }

    const payload =
      EncodedInAppAgentSessionTokenPayloadSchema.safeParse(encodedPayload);

    if (!payload.success) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid token payload",
      });
      return z.NEVER;
    }

    return {
      encodedPayload,
      payload: payload.data,
      signature,
    };
  });

export function signInAppAgentSessionToken(params: {
  userId: string;
  projectId: string;
  threadId: string;
  claudeSessionId: string;
  langfuseTraceId: string;
}): string {
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      ...params,
      exp:
        Math.floor(Date.now() / 1000) + IN_APP_AGENT_SESSION_TOKEN_TTL_SECONDS,
    }),
    "utf8",
  ).toString("base64url");

  return `${IN_APP_AGENT_SESSION_TOKEN_PREFIX}${payload}.${sign(payload)}`;
}

export function verifyInAppAgentSessionToken(
  token: string,
  params: {
    userId: string;
    threadId: string;
  },
): {
  projectId: string;
  claudeSessionId: string;
  langfuseTraceId: string;
} {
  const parsedToken = InAppAgentSessionTokenSchema.safeParse(token);

  if (!parsedToken.success) {
    throw new InvalidInAppAgentSessionTokenError();
  }

  const { encodedPayload, payload, signature } = parsedToken.data;

  if (!safeEqual(signature, sign(encodedPayload))) {
    throw new InvalidInAppAgentSessionTokenError();
  }

  if (
    payload.userId !== params.userId ||
    payload.threadId !== params.threadId ||
    payload.exp < Math.floor(Date.now() / 1000)
  ) {
    throw new InvalidInAppAgentSessionTokenError();
  }

  return {
    projectId: payload.projectId,
    claudeSessionId: payload.claudeSessionId,
    langfuseTraceId: payload.langfuseTraceId,
  };
}

function sign(payload: string): string {
  return crypto
    .createHmac("sha256", env.NEXTAUTH_SECRET ?? env.SALT)
    .update(payload, "utf8")
    .digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}
