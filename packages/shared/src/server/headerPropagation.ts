import * as opentelemetry from "@opentelemetry/api";
import type { IncomingHttpHeaders } from "http";
import { env } from "../env";

export type LangfuseContextProps = {
  headers?: IncomingHttpHeaders;
  userId?: string;
  projectId?: string;
};

/**
 * Returns a new context containing baggage entries composed from
 * the supplied props (headers, userId, projectId). Existing baggage
 * entries are preserved.
 */
export const contextWithLangfuseProps = (
  props: LangfuseContextProps,
): opentelemetry.Context => {
  const ctx = opentelemetry.context.active();
  let baggage =
    opentelemetry.propagation.getBaggage(ctx) ??
    opentelemetry.propagation.createBaggage();

  if (props.headers) {
    (env.LANGFUSE_LOG_PROPAGATED_HEADERS as string[]).forEach((name) => {
      const value = props.headers![name];
      if (!value) return;
      const strValue = Array.isArray(value) ? JSON.stringify(value) : value;
      baggage = baggage.setEntry(`langfuse.header.${name}`, {
        value: strValue,
      });
    });

    // get x-langfuse-xxx headers and add them to the span
    Object.keys(props.headers).forEach((name) => {
      if (
        name.toLowerCase().startsWith("x-langfuse") ||
        name.toLowerCase().startsWith("x_langfuse")
      ) {
        const value = props.headers![name];
        if (!value) return;
        const strValue = Array.isArray(value) ? JSON.stringify(value) : value;
        baggage = baggage.setEntry(`langfuse.header.${name}`, {
          value: strValue,
        });
      }
    });
  }
  if (props.userId) {
    baggage = baggage.setEntry("langfuse.user.id", { value: props.userId });
  }
  if (props.projectId) {
    baggage = baggage.setEntry("langfuse.project.id", {
      value: props.projectId,
    });
  }

  return opentelemetry.propagation.setBaggage(ctx, baggage);
};
