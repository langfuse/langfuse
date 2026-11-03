import type { GatewayApiFormat } from "@/src/features/ai-gateway/server/provider/registry";
import {
  readBoundedText,
  requestJson,
  withCustomOriginConnectionValidation,
} from "@/src/features/ai-gateway/server/provider/models/adapters/shared";

/** A router-level not-found body is a few bytes; anything longer is not one. */
const MAX_NOT_FOUND_BODY_BYTES = 16 * 1024;

export type SupportedRoutes = Array<
  "openai.responses" | "openai.chat-completions" | "anthropic.messages"
>;

export type RouteProbeResult =
  | { success: true; routes: SupportedRoutes }
  | { success: false; error: string };

/** Minimal bodies: a 400/422 still proves the route exists. */
const ROUTE_PROBES: ReadonlyArray<{
  apiFormat: GatewayApiFormat;
  path: string;
  body: Record<string, unknown>;
}> = [
  {
    apiFormat: "openai.chat-completions",
    path: "/chat/completions",
    body: { model: "probe", messages: [], max_tokens: 1 },
  },
  {
    apiFormat: "openai.responses",
    path: "/responses",
    body: { model: "probe", input: "", max_output_tokens: 1 },
  },
  {
    apiFormat: "anthropic.messages",
    path: "/messages",
    body: { model: "probe", max_tokens: 1, messages: [] },
  },
];

/** Which routes a custom origin serves: 404/405 means absent, anything else
 * present. A key that works on /models is assumed to work on the routes. */
export async function probeCustomRoutes(params: {
  baseUrl: string;
  credential: string | null;
  fetcher: typeof fetch;
}): Promise<RouteProbeResult> {
  const origin = parseOrigin(params.baseUrl);
  if (!origin) {
    return { success: false, error: "invalid_base_url" };
  }

  const headers: Record<string, string> = {};
  if (params.credential) {
    headers.Authorization = `Bearer ${params.credential}`;
  }

  const catalog = await requestJson({
    fetcher: params.fetcher,
    url: new URL(`${origin}/models`),
    headers,
    customOrigin: true,
  });
  if (!catalog.success) {
    return { success: false, error: "unreachable" };
  }
  if (!catalog.response.ok) {
    return {
      success: false,
      error:
        catalog.response.status === 401 || catalog.response.status === 403
          ? "unauthorized"
          : "unreachable",
    };
  }

  const routes: SupportedRoutes = [];
  await Promise.all(
    ROUTE_PROBES.map(async (probe) => {
      const reachable = await routeReachable({
        fetcher: params.fetcher,
        url: new URL(`${origin}${probe.path}`),
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(probe.body),
      });
      if (reachable) routes.push(probe.apiFormat);
    }),
  );
  return { success: true, routes };
}

async function routeReachable(params: {
  fetcher: typeof fetch;
  url: URL;
  headers: Record<string, string>;
  body: string;
}): Promise<boolean> {
  let response: Response;
  try {
    response = await params.fetcher(
      params.url,
      withCustomOriginConnectionValidation({
        method: "POST",
        headers: params.headers,
        body: params.body,
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      }),
    );
  } catch {
    return false;
  }
  if (response.status !== 404 && response.status !== 405) {
    // Only the status matters; release the connection without reading.
    await response.body?.cancel().catch(() => {});
    return true;
  }
  // A served route can still answer 404 from the application (vLLM: unknown
  // model). A router-level miss is the framework's plain-text not-found body
  // (FastAPI: {"detail":"Not Found"}), which no LLM API error uses.
  let body: string;
  try {
    body = await readBoundedText(response, MAX_NOT_FOUND_BODY_BYTES);
  } catch {
    return false;
  }
  try {
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === "object" && parsed !== null && "error" in parsed;
  } catch {
    return false;
  }
}

/** The scheme+host+port+path prefix of a base URL, without a trailing slash. */
export function parseOrigin(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (!url.hostname) return null;
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
}
