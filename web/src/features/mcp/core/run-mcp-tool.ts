import { BaseError } from "@langfuse/shared";
import { addUserToSpan, instrumentAsync } from "@langfuse/shared/src/server";
import { SpanKind, type Span } from "@opentelemetry/api";

import { UnstablePublicApiError } from "@/src/features/public-api/server/unstable-public-api-error-contract";

import type { ServerContext } from "../types";

type McpToolAttribute = string | number | boolean;

export const runMcpTool = async <TResult>({
  spanName,
  context,
  attributes,
  fn,
}: {
  spanName: string;
  context: ServerContext;
  attributes?: Record<string, McpToolAttribute | undefined>;
  fn: (span: Span) => Promise<TResult>;
}): Promise<TResult> =>
  instrumentAsync(
    { name: spanName, spanKind: SpanKind.INTERNAL },
    async (span) => {
      addUserToSpan(
        {
          projectId: context.projectId,
          orgId: context.orgId,
          apiKeyId: context.apiKeyId,
        },
        span,
      );

      span.setAttributes({
        ...(context.userAgent ? { user_agent: context.userAgent } : {}),
        ...Object.fromEntries(
          Object.entries(attributes ?? {}).filter(
            (entry): entry is [string, McpToolAttribute] =>
              entry[1] !== undefined,
          ),
        ),
      });

      try {
        return await fn(span);
      } catch (error) {
        // Expose the error cause on the span so trace analyses can group by
        // cause instead of a single error class name.
        if (error instanceof BaseError) {
          span.setAttribute("mcp.error.http_code", error.httpCode);
        }
        if (error instanceof UnstablePublicApiError) {
          span.setAttribute("mcp.error.code", error.code);
        }
        throw error;
      }
    },
  );
