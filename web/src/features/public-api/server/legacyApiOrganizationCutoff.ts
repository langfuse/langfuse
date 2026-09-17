import { type NextApiRequest } from "next";
import { type ApiDeprecationInfo } from "@langfuse/shared";
import {
  extractPublicApiCallerAttribution,
  logger,
  recordIncrement,
  type ApiAccessScopeWithOptionalApiKeyId,
} from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import { clickHouseRouteForRequest } from "./clickHouseRequestTags";
import { attachDeprecation } from "./deprecations";

const utcDateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

/** applyLegacyApiOrganizationCutoff returns a 410 body when a Cloud organization created at or after the cutoff hits a deprecated GET. Self-hosted requests never carry `deprecation`, so they are unaffected. POST ingestion is not a GET and is never rejected here. */
export function applyLegacyApiOrganizationCutoff(params: {
  req: NextApiRequest;
  deprecation: ApiDeprecationInfo | undefined;
  scope: ApiAccessScopeWithOptionalApiKeyId;
  routeName: string;
}): { body: unknown } | null {
  if (env.LANGFUSE_API_ORGANIZATION_CUTOFF_ENABLED !== "true") {
    return null;
  }
  if (params.req.method !== "GET" || !params.deprecation) {
    return null;
  }
  if (!params.scope.orgId || !params.scope.organizationCreatedAt) {
    return null;
  }

  const cutoff = new Date(env.LANGFUSE_API_ORGANIZATION_CUTOFF_DATE);
  const organizationCreatedAt = new Date(params.scope.organizationCreatedAt);
  if (organizationCreatedAt < cutoff) {
    return null;
  }

  const apiPath = clickHouseRouteForRequest(params.req);
  const callerAttribution = extractPublicApiCallerAttribution(
    params.req.headers,
  );
  // `sdkName` is canonicalized and `sdkVersion` is only set for recognized SDK
  // releases, so both are bounded enough to tag a counter with. `userAgent` is
  // free-form client input that would add one time series per distinct value,
  // so it is only available on the log line below.
  recordIncrement("langfuse.public_api.legacy_get_rejected", 1, {
    ...(callerAttribution.sdkName
      ? { sdkName: callerAttribution.sdkName }
      : {}),
    ...(callerAttribution.sdkVersion
      ? { sdkVersion: callerAttribution.sdkVersion }
      : {}),
  });
  logger.info(
    "Rejected legacy GET API request for organization created at or after cutoff",
    {
      orgId: params.scope.orgId,
      projectId: params.scope.projectId,
      apiRoute: params.routeName,
      apiPath,
      organizationCreatedAt: params.scope.organizationCreatedAt,
      cutoff: cutoff.toISOString(),
      ...callerAttribution,
    },
  );

  return {
    body: attachDeprecation(
      {
        error: "LEGACY_API_UNAVAILABLE_FOR_NEW_ORGANIZATION",
        message: `${apiPath} is a legacy API that is not available to organizations created on or after ${utcDateFormatter.format(cutoff)}. Migrate this request to ${params.deprecation.replacement}. See the migration documentation at ${params.deprecation.docsUrl}.`,
        requestedEndpoint: apiPath,
        replacementEndpoint: params.deprecation.replacement,
        documentationUrl: params.deprecation.docsUrl,
      },
      params.deprecation,
    ),
  };
}
