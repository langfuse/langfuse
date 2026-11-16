import { type IncomingHttpHeaders } from "http";
import { type NextApiRequest } from "next";
import { type ApiDeprecationInfo } from "@langfuse/shared";
import {
  extractPublicApiCallerAttribution,
  logger,
  recordIncrement,
} from "@langfuse/shared/src/server";
import { isV4CutoffActive } from "@langfuse/shared/src/server/v4Cutoff";

import { env } from "@/src/env.mjs";
import { requestPathForRequest } from "@/src/features/public-api/server/clickHouseRequestTags";
import {
  LEGACY_WRITES_DEPRECATION,
  V4_CUTOFF_NOTICE,
} from "@/src/features/public-api/server/deprecations";

type V4CutoffSurface = "ingestion" | "public_api";

/** isWebV4CutoffActive reports whether the Cloud v3 cutoff switch for this surface applies to the project. */
export function isWebV4CutoffActive(
  surface: V4CutoffSurface,
  projectId: string,
): boolean {
  return isV4CutoffActive({
    cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
    enabled:
      surface === "ingestion"
        ? env.LANGFUSE_V4_CUTOFF_INGESTION
        : env.LANGFUSE_V4_CUTOFF_PUBLIC_API,
    exemptProjectIds: env.LANGFUSE_V4_CUTOFF_EXEMPT_PROJECT_IDS,
    projectId,
  });
}

/** recordV4CutoffRejection counts one rejected request and logs its org, project and SDK for migration outreach. */
export function recordV4CutoffRejection(params: {
  surface: V4CutoffSurface;
  route: string;
  orgId: string | undefined;
  projectId: string;
  headers: IncomingHttpHeaders;
}): void {
  recordIncrement("langfuse.v4_cutoff", 1, {
    surface: params.surface,
    route: params.route,
  });
  logger.info("Langfuse v3 cutoff", {
    surface: params.surface,
    route: params.route,
    orgId: params.orgId,
    projectId: params.projectId,
    ...extractPublicApiCallerAttribution(params.headers),
  });
}

/** v4CutoffRejectionBody is the 410 body for a v3 API that the Cloud cutoff switched off. */
export function v4CutoffRejectionBody(
  apiPath: string,
  deprecation: ApiDeprecationInfo,
) {
  return {
    error: "LANGFUSE_V3_API_REMOVED",
    message: `${apiPath} is a Langfuse v3 API. ${V4_CUTOFF_NOTICE} Migrate this request to ${deprecation.replacement}. See the migration documentation at ${deprecation.docsUrl}.`,
    requestedEndpoint: apiPath,
    replacementEndpoint: deprecation.replacement,
    documentationUrl: deprecation.docsUrl,
  };
}

/** applyV4RouteCutoff returns the 410 body when the Cloud cutoff switched off this legacy write or deprecated route for the project. */
export function applyV4RouteCutoff(params: {
  req: NextApiRequest;
  routeName: string;
  isLegacyTraceWrite: boolean;
  deprecation: ApiDeprecationInfo | undefined;
  orgId: string | undefined;
  projectId: string;
}): { body: unknown } | null {
  let surface: V4CutoffSurface | null = null;
  if (params.isLegacyTraceWrite) surface = "ingestion";
  else if (params.deprecation) surface = "public_api";
  if (!surface || !isWebV4CutoffActive(surface, params.projectId)) {
    return null;
  }

  recordV4CutoffRejection({
    surface,
    route: params.routeName,
    orgId: params.orgId,
    projectId: params.projectId,
    headers: params.req.headers,
  });
  const { method, pathname } = requestPathForRequest(params.req);
  return {
    body: v4CutoffRejectionBody(
      `${method} ${pathname}`,
      params.deprecation ?? LEGACY_WRITES_DEPRECATION,
    ),
  };
}
