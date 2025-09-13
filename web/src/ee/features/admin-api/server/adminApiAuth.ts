import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";
import { type IncomingHttpHeaders } from "http";
import { type NextApiRequest, type NextApiResponse } from "next";

export interface AdminAuthResult {
  isAuthorized: boolean;
  error?: string;
}

export class AdminApiAuthService {
  static verifyAdminAuthFromAuthString = (
    authString: string,
    enforceLangfuseCloudOnly = true,
  ): AdminAuthResult => {
    if (enforceLangfuseCloudOnly && !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
      return {
        isAuthorized: false,
        error: "Only accessible on Langfuse Cloud",
      };
    }

    // Check if ADMIN_API_KEY is set
    if (!env.ADMIN_API_KEY) {
      logger.error("ADMIN_API_KEY is not set");
      return {
        isAuthorized: false,
        error: "ADMIN_API_KEY is not set",
      };
    }

    const [scheme, token] = authString.split(" ");
    if (scheme !== "Bearer" || !token || token !== env.ADMIN_API_KEY) {
      return {
        isAuthorized: false,
        error: "Unauthorized: Invalid token",
      };
    }

    return {
      isAuthorized: true,
    };
  };

  /**
   * Verifies if the request is authorized to access admin APIs
   * @param req The Next.js API request
   * @param enforceLangfuseCloudOnly Whether to check if the NEXT_PUBLIC_LANGFUSE_CLOUD_REGION is set (default: true)
   * @returns An object with isAuthorized flag and optional error message
   */

  private static verifyAdminAuthFromHeader(
    headers: IncomingHttpHeaders,
    enforceLangfuseCloudOnly = true,
  ): AdminAuthResult {
    // Check bearer token
    const { authorization } = headers;
    if (!authorization) {
      return {
        isAuthorized: false,
        error: "Unauthorized: No authorization header provided",
      };
    }
    return AdminApiAuthService.verifyAdminAuthFromAuthString(
      authorization,
      enforceLangfuseCloudOnly,
    );
  }

  /**
   * Middleware function to handle admin authentication in Next.js API routes
   * @param req The Next.js API request
   * @param res The Next.js API response
   * @param enforceLangfuseCloudOnly Whether to check if the NEXT_PUBLIC_LANGFUSE_CLOUD_REGION is set (default: true)
   * @returns true if authorized, false otherwise (and sets appropriate response)
   */
  public static handleAdminAuth(
    req: NextApiRequest,
    res: NextApiResponse,
    enforceLangfuseCloudOnly = true,
  ): boolean {
    const authResult = AdminApiAuthService.verifyAdminAuthFromHeader(
      req.headers,
      enforceLangfuseCloudOnly,
    );

    if (!authResult.isAuthorized) {
      if (authResult.error?.startsWith("Unauthorized")) {
        res.status(401).json({ error: authResult.error });
      } else {
        res.status(403).json({ error: authResult.error });
      }
      return false;
    }

    return true;
  }
}
