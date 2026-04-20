import { prisma } from "@langfuse/shared/src/db";
import { encrypt } from "@langfuse/shared/encryption";
import { SsoProviderSchema } from "./types";
import { type NextApiRequest, type NextApiResponse } from "next";
import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";
import { multiTenantSsoAvailable } from "@/src/ee/features/multi-tenant-sso/multiTenantSsoAvailable";
import { AdminApiAuthService } from "@/src/ee/features/admin-api/server/adminApiAuth";

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
    if (!env.ENCRYPTION_KEY) {
      res.status(500).json({ error: "ENCRYPTION_KEY is not set" });
      return;
    }
    // Authenticate via ADMIN_API_KEY with timing-safe comparison.
    // multiTenantSsoAvailable already restricts this endpoint to Langfuse
    // Cloud, so explicitly opt in with isAllowedOnLangfuseCloud.
    if (
      !AdminApiAuthService.handleAdminAuth(req, res, {
        isAllowedOnLangfuseCloud: true,
      })
    ) {
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
