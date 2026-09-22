import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "cookie",
  "authorization",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-langfuse-project-id",
  "host",
]);

export function getSdkGatewayUpstreamOrigin(): string | undefined {
  if (env.LANGFUSE_IN_APP_AGENT_SDK_GATEWAY_UPSTREAM_ORIGIN) {
    return env.LANGFUSE_IN_APP_AGENT_SDK_GATEWAY_UPSTREAM_ORIGIN.replace(
      /\/$/,
      "",
    );
  }

  if (env.NEXTAUTH_URL) {
    return env.NEXTAUTH_URL.replace(/\/$/, "");
  }

  return undefined;
}

export function getSdkGatewayProjectKey():
  | { publicKey: string; secretKey: string }
  | undefined {
  const publicKey = env.LANGFUSE_IN_APP_AGENT_SDK_GATEWAY_PROJECT_PUBLIC_KEY;
  const secretKey = env.LANGFUSE_IN_APP_AGENT_SDK_GATEWAY_PROJECT_SECRET_KEY;
  if (!publicKey || !secretKey) {
    return undefined;
  }

  return { publicKey, secretKey };
}

export async function forwardSdkGatewayRequest(params: {
  method: string;
  path: string;
  query: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}): Promise<{
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}> {
  const origin = getSdkGatewayUpstreamOrigin();
  const projectKey = getSdkGatewayProjectKey();
  if (!origin || !projectKey) {
    throw new Error("SDK gateway is not configured");
  }

  if (params.path.startsWith("http://") || params.path.startsWith("https://")) {
    throw new Error("Absolute upstream URLs are not allowed");
  }

  const target = new URL(`${origin}${params.path}${params.query}`);
  if (target.origin !== new URL(origin).origin) {
    throw new Error("Upstream origin override is not allowed");
  }

  const headers = new Headers();
  for (const [name, value] of Object.entries(params.headers)) {
    if (!value || HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      continue;
    }
    if (Array.isArray(value)) {
      headers.set(name, value.join(","));
    } else {
      headers.set(name, value);
    }
  }

  headers.set(
    "authorization",
    `Basic ${Buffer.from(`${projectKey.publicKey}:${projectKey.secretKey}`).toString("base64")}`,
  );
  headers.set("host", target.host);

  const response = await fetch(target, {
    method: params.method,
    headers,
    body:
      params.method === "GET" || params.method === "HEAD"
        ? undefined
        : new Uint8Array(params.body),
    redirect: "error",
  });

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    if (
      HOP_BY_HOP_HEADERS.has(key.toLowerCase()) ||
      key.toLowerCase() === "set-cookie" ||
      key.toLowerCase() === "www-authenticate"
    ) {
      return;
    }
    responseHeaders[key] = value;
  });

  const body = Buffer.from(await response.arrayBuffer());
  logger.info("sdk-gateway.forward", {
    path: params.path,
    status: response.status,
  });

  return {
    status: response.status,
    headers: responseHeaders,
    body,
  };
}
