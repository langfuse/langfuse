/**
 * Transports that stand in for the network during batch inference. The AI SDK
 * builds the provider request exactly as for an online call; the capture
 * transport keeps the body instead of sending it, and the replay transport
 * answers the same call with the response from the batch job, so parsing,
 * structured output, usage and tracing run unchanged.
 */

export type CapturedProviderRequest = {
  url: string;
  body: Record<string, unknown>;
};

/** Thrown by the capture transport after it recorded the request. */
export class ProviderRequestCapturedSignal extends Error {
  constructor() {
    super("Provider request captured for batch inference");
    this.name = "ProviderRequestCapturedSignal";
  }
}

const requestUrl = (input: Parameters<typeof fetch>[0]): string => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
};

export function createCaptureTransport(): {
  transport: typeof fetch;
  getCaptured: () => CapturedProviderRequest | null;
} {
  let captured: CapturedProviderRequest | null = null;

  const transport = (async (input, init) => {
    if (captured) {
      throw new Error("Batch capture transport received a second request");
    }
    const rawBody = init?.body;
    if (typeof rawBody !== "string") {
      throw new Error("Batch inference supports JSON request bodies only");
    }
    const body: unknown = JSON.parse(rawBody);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Batch inference supports JSON object bodies only");
    }
    captured = {
      url: requestUrl(input),
      body: body as Record<string, unknown>,
    };
    throw new ProviderRequestCapturedSignal();
  }) as typeof fetch;

  return { transport, getCaptured: () => captured };
}

export function createReplayTransport(response: unknown): typeof fetch {
  let used = false;
  return (async () => {
    if (used) {
      throw new Error("Batch replay transport received a second request");
    }
    used = true;
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}
