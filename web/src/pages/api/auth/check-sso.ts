/**
 * This API endpoint checks if a custom SSO provider is configured for a given domain.
 *
 * If no custom SSO provider is configured or EE is not available, this API will return a 404 response.
 */

import { getSsoAuthProviderIdForDomain } from "@langfuse/ee/sso";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const requestSchema = z.object({
  domain: z.string().min(1),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST")
    return res.status(405).json({ message: "Method not allowed" });

  const validBody = requestSchema.safeParse(req.body);
  if (!validBody.success) {
    return res.status(400).json({ message: "Invalid request body" });
  }

  const providerId = await getSsoAuthProviderIdForDomain(validBody.data.domain);

  if (!providerId) {
    return res.status(404).json({ message: "No SSO provider configured" });
  }

  return res.status(200).json({ providerId });
}
