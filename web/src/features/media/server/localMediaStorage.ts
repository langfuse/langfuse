import crypto from "node:crypto";

import { env } from "@/src/env.mjs";
import { InvalidRequestError } from "@langfuse/shared";

export const LOCAL_MEDIA_BUCKET = "local";

type LocalMediaAction = "upload" | "download";

type LocalMediaTokenPayload = {
  action: LocalMediaAction;
  projectId: string;
  mediaId: string;
  bucketPath: string;
  contentType: string;
  contentLength: number;
  sha256Hash?: string;
  expiresAt: number;
};

const base64UrlEncode = (value: string): string =>
  Buffer.from(value).toString("base64url");

const base64UrlDecode = (value: string): string =>
  Buffer.from(value, "base64url").toString("utf8");

const getSigningSecret = (): string => env.NEXTAUTH_SECRET ?? env.SALT;

const sign = (payload: string): string =>
  crypto
    .createHmac("sha256", getSigningSecret())
    .update(payload)
    .digest("base64url");

const getPublicBaseUrl = (): string =>
  (env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/api\/auth\/?$/, "");

const createLocalMediaToken = (
  payload: Omit<LocalMediaTokenPayload, "expiresAt">,
  ttlSeconds: number,
): string => {
  const encodedPayload = base64UrlEncode(
    JSON.stringify({
      ...payload,
      expiresAt: Date.now() + ttlSeconds * 1000,
    } satisfies LocalMediaTokenPayload),
  );

  return `${encodedPayload}.${sign(encodedPayload)}`;
};

export const verifyLocalMediaToken = (
  token: string | string[] | undefined,
  expected: { action: LocalMediaAction; mediaId: string },
): LocalMediaTokenPayload => {
  if (!token || Array.isArray(token)) {
    throw new InvalidRequestError("Missing local media token");
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    throw new InvalidRequestError("Invalid local media token");
  }

  const expectedSignature = sign(encodedPayload);
  if (signature.length !== expectedSignature.length) {
    throw new InvalidRequestError("Invalid local media token signature");
  }
  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    )
  ) {
    throw new InvalidRequestError("Invalid local media token signature");
  }

  let payload: LocalMediaTokenPayload;
  try {
    payload = JSON.parse(
      base64UrlDecode(encodedPayload),
    ) as LocalMediaTokenPayload;
  } catch {
    throw new InvalidRequestError("Invalid local media token payload");
  }
  if (payload.expiresAt < Date.now()) {
    throw new InvalidRequestError("Local media token expired");
  }
  if (
    payload.action !== expected.action ||
    payload.mediaId !== expected.mediaId
  ) {
    throw new InvalidRequestError("Local media token does not match request");
  }

  return payload;
};

export const getLocalMediaUploadUrl = (params: {
  projectId: string;
  mediaId: string;
  bucketPath: string;
  contentType: string;
  contentLength: number;
  sha256Hash: string;
  ttlSeconds: number;
}): string => {
  const token = createLocalMediaToken(
    {
      action: "upload",
      projectId: params.projectId,
      mediaId: params.mediaId,
      bucketPath: params.bucketPath,
      contentType: params.contentType,
      contentLength: params.contentLength,
      sha256Hash: params.sha256Hash,
    },
    params.ttlSeconds,
  );

  return `${getPublicBaseUrl()}/api/public/media/${encodeURIComponent(params.mediaId)}/upload?token=${encodeURIComponent(token)}`;
};

export const getLocalMediaDownloadUrl = (params: {
  projectId: string;
  mediaId: string;
  bucketPath: string;
  contentType: string;
  contentLength: number;
  ttlSeconds: number;
}): string => {
  const token = createLocalMediaToken(
    {
      action: "download",
      projectId: params.projectId,
      mediaId: params.mediaId,
      bucketPath: params.bucketPath,
      contentType: params.contentType,
      contentLength: params.contentLength,
    },
    params.ttlSeconds,
  );

  return `${getPublicBaseUrl()}/api/public/media/${encodeURIComponent(params.mediaId)}/download?token=${encodeURIComponent(token)}`;
};

export const isLocalMediaStorageEnabled = (): boolean =>
  env.LANGFUSE_MEDIA_STORAGE_BACKEND === "local";
