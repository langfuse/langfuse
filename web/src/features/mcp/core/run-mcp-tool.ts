import { instrumentAsync } from "@langfuse/shared/src/server";
import { SpanKind, type Span } from "@opentelemetry/api";

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
      span.setAttributes({
        "langfuse.project.id": context.projectId,
        "langfuse.org.id": context.orgId,
        "mcp.api_key_id": context.apiKeyId,
        ...Object.fromEntries(
          Object.entries(attributes ?? {}).filter(
            (entry): entry is [string, McpToolAttribute] =>
              entry[1] !== undefined,
          ),
        ),
      });

      return await fn(span);
    },
  );
