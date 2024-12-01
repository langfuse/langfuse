import { prisma } from "@langfuse/shared/src/db";
import { encrypt } from "@langfuse/shared/encryption";
import { SsoProviderSchema } from "./types";
import { type NextApiRequest, type NextApiResponse } from "next";
import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";
import { multiTenantSsoAvailable } from "@/src/ee/features/multi-tenant-sso/multiTenantSsoAvailable";

export async function createNewSsoConfigHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (!multiTenantSsoAvailable) {
      res
        .status(403)
        .json({ error: "Multi-tenant SSO is not available on your instance" });
      return;
    }
    // allow only POST requests
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }
    // check if ADMIN_API_KEY is set
    if (!env.ADMIN_API_KEY) {
      res.status(500).json({ error: "ADMIN_API_KEY is not set" });
      return;
    }
    if (!env.ENCRYPTION_KEY) {
      res.status(500).json({ error: "ENCRYPTION_KEY is not set" });
      return;
    }
    // check bearer token
    const { authorization } = req.headers;
    if (!authorization) {
      res
        .status(401)
        .json({ error: "Unauthorized: No authorization header provided" });
      return;
    }
    const [scheme, token] = authorization.split(" ");
    if (scheme !== "Bearer" || !token || token !== env.ADMIN_API_KEY) {
      res.status(401).json({ error: "Unauthorized: Invalid token" });
      return;
    }

    const body = SsoProviderSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error });
      return;
    }

    const { domain, authProvider, authConfig } = body.data;

    const encryptedClientSecret = authConfig
      ? {
          ...authConfig,
          clientSecret: encrypt(authConfig.clientSecret),
        }
      : undefined;

    await prisma.ssoConfig.create({
      data: {
        domain,
        authProvider,
        authConfig: encryptedClientSecret,
      },
    });
    res.status(201).json({
      message: "SSO configuration created successfully",
    });
  } catch (e) {
    logger.error("Failed to create SSO configuration", e);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
