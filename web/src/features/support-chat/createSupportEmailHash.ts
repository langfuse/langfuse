import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";
import * as crypto from "node:crypto";

export const createSupportEmailHash = (email: string): string | undefined => {
  if (!env.PLAIN_AUTHENTICATION_SECRET) {
    if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
      logger.error("PLAIN_AUTHENTICATION_SECRET is not set");
    }
    return undefined;
  }
  const hmac = crypto.createHmac("sha256", env.PLAIN_AUTHENTICATION_SECRET);
  hmac.update(email);
  const hash = hmac.digest("hex");
  return hash;
};
