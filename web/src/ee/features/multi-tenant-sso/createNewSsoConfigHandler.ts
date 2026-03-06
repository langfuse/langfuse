import { prisma } from "@langfuse/shared/src/db";
import { encrypt } from "@langfuse/shared/encryption";
import { SsoProviderSchema } from "./types";
import { type NextApiRequest, type NextApiResponse } from "next";
import { env } from "@/src/env.mjs";
import { generateSsoCallbackUrlId, logger } from "@langfuse/shared/src/server";
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

    // Preemptive check: Verify that SSO config doesn't already exist for this domain
    const existingConfig = await prisma.ssoConfig.findUnique({
      where: { domain },
    });
    if (existingConfig) {
      logger.info(
        `Attempt to create duplicate SSO configuration for domain: ${domain}`,
      );
      res.status(409).json({
        error: `An SSO configuration already exists for domain '${domain}'`,
      });
      return;
    }

    const encryptedClientSecret = authConfig
      ? {
          ...authConfig,
          clientSecret: encrypt(authConfig.clientSecret),
        }
      : undefined;

    // Generate hashed callbackUrlId for configs with authConfig (custom credentials)
    const callbackUrlId = authConfig
      ? generateSsoCallbackUrlId({ domain, authProvider })
      : null;

    await prisma.ssoConfig.create({
      data: {
        domain,
        authProvider,
        authConfig: encryptedClientSecret,
        callbackUrlId,
      },
    });

    res.status(201).json({
      message: "SSO configuration created successfully",
      // Return callbackUrlId so customers know which callback URL to configure in their IdP
      ...(callbackUrlId && { callbackUrlId }),
    });
  } catch (e) {
    logger.error("Failed to create SSO configuration", e);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
