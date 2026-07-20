import { once } from "events";
import { z } from "zod";
import { InvalidRequestError, UnauthorizedError } from "@langfuse/shared";
import {
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
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    // Tenant data: never cache in shared/proxy caches.
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Range paging is a documented follow-up (see PR); advertise it as
    // unsupported for now rather than silently ignoring a Range header.
    res.setHeader("Accept-Ranges", "none");
    res.status(200);

    try {
      // Pull one chunk at a time (source backpressure) and honor sink
      // backpressure via drain — the field never fully materializes in Node.
      for await (const chunk of stream) {
        // write() returns false only when the sink buffer is full; wait for
        // drain before resuming so a slow client can't balloon memory.
        if (res.write(chunk) === false) {
          await once(res, "drain");
        }
      }
      res.end();
    } catch (error) {
      // A mid-stream ClickHouse/transport failure after headers were sent: the
      // client sees a truncated body. Log, tear down, and do not rethrow (that
      // would collide with withMiddlewares' already-sent headers).
      logger.error("[stream-observation-io] mid-stream failure", {
        error: error instanceof Error ? error.message : String(error),
        projectId,
        traceId,
        observationId,
        field,
      });
      stream.destroy();
      if (!res.writableEnded) res.end();
    }
  },
});
