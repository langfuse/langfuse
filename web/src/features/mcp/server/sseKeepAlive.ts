/**
 * Keep-alive management for MCP GET SSE streams.
 *
 * In stateless mode the Streamable HTTP transport opens an SSE stream on GET
 * that it never writes to, never pings, and never closes server-side — its
 * lifetime is bounded only by client disconnect or LB idle timeout. That has
 * two operational problems:
 *
 * 1. Idle streams die silently at the load balancer idle timeout instead of
 *    being kept alive intentionally.
 * 2. Open streams ride through graceful shutdown: nothing closes them on
 *    SIGTERM, so draining tasks hold MCP client connections until the
 *    orchestrator SIGKILLs the container and clients see a hard reset.
 *
 * This helper periodically writes an SSE comment (`: keep-alive`) as a ping
 * and proactively ends the stream when the process is draining or the stream
 * exceeds its max age. Per the MCP Streamable HTTP spec, clients tolerate
 * server-closed SSE streams and reconnect — during a drain they reconnect to
 * a healthy task.
 *
 * Writing to the response from outside the transport is safe ONLY because the
 * stateless transport never emits bytes on the GET stream (no session, no
 * eventStore), so there is no event to interleave with. Revisit this if
 * sessions or server-initiated messages are ever enabled.
 */

interface SseResponseLike {
  headersSent: boolean;
  writableEnded: boolean;
  destroyed: boolean;
  write: (chunk: string) => boolean;
  end: () => void;
}

export function startSseKeepAlive(params: {
  res: SseResponseLike;
  pingIntervalMs: number;
  maxConnectionAgeMs: number;
  /** Checked every tick; when true the stream is ended so clients reconnect elsewhere. */
  isDraining: () => boolean;
}): { stop: () => void } {
  const { res, pingIntervalMs, maxConnectionAgeMs, isDraining } = params;
  const startedAt = Date.now();

  const interval = setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      stop();
      return;
    }
    // The SSE response is established asynchronously by the transport; skip
    // ticks until headers are out so we never write ahead of them.
    if (!res.headersSent) {
      return;
    }
    if (isDraining() || Date.now() - startedAt >= maxConnectionAgeMs) {
      // Ending the response triggers the transport's close/cancel path: the
      // piped ReadableStream is cancelled, handleRequest resolves, and the
      // caller's cleanup (server.close()) runs.
      res.end();
      stop();
      return;
    }
    res.write(": keep-alive\n\n");
  }, pingIntervalMs);

  // The ping timer must never be the thing keeping the event loop alive.
  interval.unref?.();

  function stop(): void {
    clearInterval(interval);
  }

  return { stop };
}
