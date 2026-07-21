import { once } from "node:events";
import { z } from "zod";
import {
  InvalidRequestError,
  LangfuseNotFoundError,
  UnauthorizedError,
} from "@langfuse/shared";
import {
  getObservationIOFieldByteLengthFromEventsTable,
  logger,
  OBSERVATION_IO_STREAM_FIELDS,
  streamObservationIOFieldFromEventsTable,
} from "@langfuse/shared/src/server";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  getAuthorizedTrace,
  type TraceExportAccessSession,
} from "@/src/features/traces/server/buildTraceExport";
import { getServerAuthSession } from "@/src/server/auth";

/**
 * GET /api/traces/:traceId/observations/:observationId/io/:field
 *   ?projectId=...&startTime=<ISO-8601>
 *
 * Streams ONE observation's raw IO field (input | output | metadata) as bytes,
 * piping the ClickHouse response body straight to the client without buffering
 * the whole value in the Node process. This is the transport enabler for the
 * lazy/streaming large-JSON viewer (LFE-11081, seeded by LFE-10847 / LFE-10152:
 * huge single-field payloads crash the browser when fetched+parsed in one shot).
 *
 * SECURITY: session-authed and strictly project-scoped. Authorization reuses the
 * canonical `getAuthorizedTrace` (project membership, public trace/session, or
 * admin) — identical to the trace download route — and the underlying query is
 * pinned to (projectId, traceId, observationId), so a caller can never read
 * another project's or trace's observation IO.
 *
 * v4/events-only: reads `events_full`, matching the events.batchIO read path.
 */

// traceId / observationId / field are path segments; projectId / startTime are
// query-string params. All are validated before any data access.
const querySchema = z.object({
  traceId: z.string().min(1),
  observationId: z.string().min(1),
  field: z.enum(OBSERVATION_IO_STREAM_FIELDS),
  projectId: z.string().min(1),
  // The observation's startTime (ISO-8601). Prunes the ClickHouse primary key;
  // not a security control — the tenant scoping above is.
  startTime: z.coerce.date(),
});

/**
 * Shape the NextAuth session into the access-session `getAuthorizedTrace`
 * expects. Mirrors the trace download route (`/api/traces/[traceId]/download`):
 * a missing session stays `null` (only public traces are then readable); a
 * malformed session is rejected.
 */
function toTraceAccessSession(
  session: Awaited<ReturnType<typeof getServerAuthSession>>,
): TraceExportAccessSession {
  if (!session) {
    return null;
  }

  const { user } = session;
  if (
    !user ||
    typeof user.email !== "string" ||
    !Array.isArray(user.organizations)
  ) {
    throw new UnauthorizedError("Unauthorized");
  }

  return {
    user: {
      email: user.email,
      admin: user.admin,
      organizations: user.organizations,
    },
  };
}

export default withMiddlewares({
  GET: async (req, res) => {
    // --- Everything that can fail cleanly happens BEFORE any bytes are sent,
    // so withMiddlewares can still translate errors into a JSON response. ---

    const parsed = querySchema.safeParse({
      traceId: req.query.traceId,
      observationId: req.query.observationId,
      field: req.query.field,
      projectId: req.query.projectId,
      startTime: req.query.startTime,
    });
    if (!parsed.success) {
      throw new InvalidRequestError(parsed.error.message);
    }
    const { traceId, observationId, field, projectId, startTime } = parsed.data;

    // Authorize the (projectId, traceId) pair. Throws 401/404 before we stream.
    const session = toTraceAccessSession(
      await getServerAuthSession({ req, res }),
    );
    await getAuthorizedTrace({ traceId, projectId, session });

    // Cheap pre-query BEFORE any bytes: the exact field byte length. Two jobs —
    // (1) a null (no matching row, e.g. a stale/skewed startTime) becomes a clean
    // 404 instead of a misleading empty 200; (2) the length drives a
    // Content-Length header so a truncated body is detectable at the HTTP layer.
    const byteLength = await getObservationIOFieldByteLengthFromEventsTable({
      projectId,
      traceId,
      observationId,
      field,
      startTime,
    });
    if (byteLength === null) {
      throw new LangfuseNotFoundError(
        "Observation IO field not found for the given trace/observation/startTime",
      );
    }

    // Resolves once ClickHouse has returned response headers; an immediate query
    // failure rejects here (pre-headers) and is handled by withMiddlewares.
    const { stream } = await streamObservationIOFieldFromEventsTable({
      projectId,
      traceId,
      observationId,
      field,
      startTime,
    });

    // --- Headers committed below; from here we must not throw into
    // withMiddlewares (headers are already sent). ---
    // Opaque field bytes: input/output may be a bare (unquoted) string rather
    // than JSON, so we do NOT claim application/json. The consumer knows it is an
    // IO field and parses accordingly.
    res.setHeader("Content-Type", "application/octet-stream");
    // Exact byte count: lets the client detect a truncated body (mid-stream
    // ClickHouse failure) at the HTTP layer, on any ClickHouse version.
    res.setHeader("Content-Length", String(byteLength));
    // Tenant data: never cache in shared/proxy caches.
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Range paging is a documented follow-up (see PR); advertise it as
    // unsupported for now rather than silently ignoring a Range header.
    res.setHeader("Accept-Ranges", "none");
    res.status(200);

    // Tear down the ClickHouse read if the client disconnects (mirrors
    // execute-query-stream.ts). Without this, a disconnect under backpressure
    // would hang the handler forever and leak the CH connection.
    let clientClosed = false;
    const closed = once(res, "close");
    req.on("close", () => {
      clientClosed = true;
      stream.destroy();
    });

    try {
      // One chunk at a time (source backpressure); honor sink backpressure via
      // drain — but race drain against `close`, or a disconnect mid-drain would
      // never settle (`once(res,"drain")` alone hangs on socket close).
      for await (const chunk of stream) {
        if (clientClosed) break;
        if (res.write(chunk) === false) {
          await Promise.race([once(res, "drain"), closed]);
          if (clientClosed) break;
        }
      }
      if (!clientClosed) res.end();
    } catch (error) {
      // Mid-stream ClickHouse/transport failure after headers were sent. Abort
      // the socket (not a clean end) so the body ends SHORT of the declared
      // Content-Length → the client's fetch errors, instead of a clean truncated
      // 200 that looks like success. Do not rethrow (headers already sent).
      logger.error("[stream-observation-io] mid-stream failure", {
        error: error instanceof Error ? error.message : String(error),
        projectId,
        traceId,
        observationId,
        field,
      });
      stream.destroy();
      if (!res.writableEnded && !clientClosed) {
        res.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    }
  },
});
