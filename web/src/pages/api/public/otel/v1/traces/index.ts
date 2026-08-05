import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { isOrgPastOtelDirectWriteCutoff } from "@/src/features/public-api/server/otelDirectWriteCutoff";
import {
  getCurrentSpan,
  logger,
  markProjectIngestFailure,
  OtelIngestionProcessor,
  markProjectAsOtelUser,
  createIngestionAttribution,
  getLangfuseHeaderValue,
  recordIncrement,
  validateOtelSpanIds,
} from "@langfuse/shared/src/server";
import { z } from "zod";
import { $root } from "@/src/pages/api/public/otel/otlp-proto/generated/root";
import { gunzip } from "node:zlib";
import { ForbiddenError } from "@langfuse/shared";
import { env } from "@/src/env.mjs";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "OTel Traces",
    querySchema: z.any(),
    responseSchema: z.any(),
    rateLimitResource: "ingestion",
    fn: async ({ req, res, auth }) => {
      // Check if ingestion is suspended due to usage threshold
      if (auth.scope.isIngestionSuspended) {
        throw new ForbiddenError(
          "Ingestion suspended: Usage threshold exceeded. Please upgrade your plan.",
        );
      }

      // Mark project as using OTEL API
      await markProjectAsOtelUser(auth.scope.projectId);

      let body: Buffer;
      try {
        body = await new Promise((resolve, reject) => {
          let data: any[] = [];
          req.on("data", (chunk) => data.push(chunk));
          req.on("end", () => resolve(Buffer.concat(data)));
          req.on("error", reject);
        });
      } catch (e) {
        logger.error(`Failed to read request body`, e);
        res.status(400);
        return { error: "Failed to read request body" };
      }

      if (req.headers["content-encoding"]?.includes("gzip")) {
        try {
          body = await new Promise((resolve, reject) => {
            gunzip(new Uint8Array(body), (err, result) =>
              err ? reject(err) : resolve(result),
            );
          });
        } catch (e) {
          logger.error(`Failed to decompress request body`, e);
          res.status(400);
          return { error: "Failed to decompress request body" };
        }
      }

      let resourceSpans: any;
      const contentType = req.headers["content-type"]?.toLowerCase();
      // Strict content-type matching does not work if something like `content-type: text/javascript; charset=utf-8` is sent.
      if (
        !contentType ||
        (!contentType.includes("application/json") &&
          !contentType.includes("application/x-protobuf"))
      ) {
        logger.error(`Invalid content type: ${contentType}`);
        res.status(400);
        return { error: "Invalid content type" };
      }
      if (contentType.includes("application/x-protobuf")) {
        try {
          const parsed =
            $root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest.decode(
              body,
            );
          resourceSpans =
            $root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest.toObject(
              parsed,
              // OTLP JSON encodes int64 fields as decimal strings.
              { longs: String },
            ).resourceSpans;
        } catch (e) {
          logger.error(`Failed to parse OTel Protobuf`, e);
          res.status(400);
          return { error: "Failed to parse OTel Protobuf Trace" };
        }
      }
      if (contentType.includes("application/json")) {
        try {
          resourceSpans = JSON.parse(body.toString()).resourceSpans;
        } catch (e) {
          logger.error(`Failed to parse OTel JSON`, e);
          res.status(400);
          return { error: "Failed to parse OTel JSON Trace" };
        }
      }

      if (!resourceSpans || resourceSpans.length === 0) {
        return {};
      }

      // Reject payloads the worker cannot convert: spans whose traceId/spanId is
      // missing or malformed, and scopeSpans/spans/attributes/events fields that
      // are present but not arrays. All fail in the worker — parseId throws
      // ERR_INVALID_ARG_TYPE or yields a truncated id, and a non-array
      // collection throws on for...of, reduce or filter — so the job burns all
      // six attempts before being dropped anyway. Failing here returns a
      // non-retryable status instead.
      //
      // The common source is an OTLP *logs* export pointed at this endpoint.
      // ResourceLogs and ResourceSpans share protobuf field numbers, so log
      // records decode into spans with a valid instrumentation scope but no ids.
      // The other observed source is a hand-rolled OTLP/JSON exporter writing
      // attributes as a {key: value} object rather than a KeyValue list.
      //
      // One invalid span means the whole export is almost certainly malformed,
      // so the batch is rejected as a unit and the response says so explicitly
      // rather than dropping spans silently.
      const idValidation = validateOtelSpanIds(resourceSpans);
      if (
        idValidation.invalidSpanCount > 0 ||
        idValidation.malformedCollectionCount > 0
      ) {
        // One increment per reason, so a batch that mixes reasons splits across
        // them instead of attributing every rejected span to whichever reason
        // happened to come first. The tag set is bounded by construction.
        for (const [reason, count] of Object.entries(
          idValidation.reasonCounts,
        )) {
          recordIncrement(
            "langfuse.ingestion.otel.rejected_invalid_span_ids",
            count,
            { reason },
          );
        }
        const rejectionContext = {
          projectId: auth.scope.projectId,
          invalidSpanCount: idValidation.invalidSpanCount,
          malformedCollectionCount: idValidation.malformedCollectionCount,
          totalSpanCount: idValidation.totalSpanCount,
          reasonCounts: idValidation.reasonCounts,
          instrumentationScopes: idValidation.scopeNames,
          sdkName: req.headers["x-langfuse-sdk-name"],
        };
        logger.warn(
          "Rejecting unprocessable OTEL trace export",
          rejectionContext,
        );

        // Rejecting the batch as a unit rests on the assumption that a bad
        // export is bad throughout: an OTLP logs payload decoded as spans
        // yields uniformly id-less spans, so invalidSpanCount should equal
        // totalSpanCount. Any gap means this rejection just discarded spans
        // that would have ingested fine, which is data loss and invalidates
        // the assumption — escalate so it cannot pass unnoticed among warns.
        //
        // Only meaningful when every defect was span-attributable. A malformed
        // resource- or scope-level collection fails its whole subtree in the
        // worker no matter how sound the individual spans underneath are, so
        // counting those spans as discarded-but-valid would be a false alarm.
        const discardedValidSpans =
          idValidation.totalSpanCount - idValidation.invalidSpanCount;
        if (
          discardedValidSpans > 0 &&
          idValidation.malformedCollectionCount === 0
        ) {
          logger.error(
            "Rejected OTEL trace export contained valid spans — batch rejection discarded them",
            { ...rejectionContext, discardedValidSpans },
          );
        }

        const problems: string[] = [];
        if (idValidation.invalidSpanCount > 0) {
          problems.push(
            `${idValidation.invalidSpanCount} of ${idValidation.totalSpanCount} ` +
              `span(s) cannot be processed`,
          );
        }
        if (idValidation.malformedCollectionCount > 0) {
          problems.push(
            `${idValidation.malformedCollectionCount} resource- or scope-level ` +
              `field(s) are present but not arrays`,
          );
        }

        // Name the contract that was broken, so a hand-rolled exporter can be
        // corrected from the response alone rather than by guessing at the
        // reason keys.
        const hints: string[] = [];
        if (
          idValidation.reasons.some(
            (reason) =>
              reason.endsWith(":absent") || reason.endsWith(":not_an_id"),
          )
        ) {
          hints.push(
            `traceId and spanId are required on every span, and each must be a ` +
              `string or a byte array.`,
          );
        }
        if (
          idValidation.reasons.some((reason) =>
            reason.endsWith(":not_an_array"),
          )
        ) {
          hints.push(
            `scopeSpans, spans, attributes and events must all be arrays — OTLP ` +
              `attributes are a list of {key, value} entries, not a JSON object.`,
          );
        }

        res.status(400);
        return {
          error:
            `Invalid OTLP trace export: ${problems.join("; ")} ` +
            `(${idValidation.reasons.join(", ")}). ${hints.join(" ")} ` +
            `The entire export was rejected and no spans were ingested. ` +
            `Instrumentation scopes: ${idValidation.scopeNames.join(", ") || "unknown"}. ` +
            `This endpoint accepts OpenTelemetry traces only — if you are exporting ` +
            `OpenTelemetry logs, point your log exporter elsewhere.`,
        };
      }

      // Warn on oversized OTEL request bodies (16MB threshold)
      const bodyBytes = body.byteLength;
      if (bodyBytes > 16 * 1024 * 1024) {
        let spanCount = 0;
        for (const rs of resourceSpans) {
          for (const ss of rs?.scopeSpans ?? []) {
            spanCount += ss?.spans?.length ?? 0;
          }
        }
        logger.warn("OTEL request body exceeds 16MB", {
          projectId: auth.scope.projectId,
          bodyBytes,
          spanCount,
        });
      }

      // Extract SDK headers for write path decision (supports both hyphen and underscore formats)
      const attribution = createIngestionAttribution({
        headers: req.headers,
        authCheck: auth,
      });
      const ingestionVersion = getLangfuseHeaderValue(
        req.headers,
        "x-langfuse-ingestion-version",
      );
      if (ingestionVersion) {
        getCurrentSpan()?.setAttribute(
          "langfuse.ingestion.version",
          ingestionVersion,
        );
      }

      // Reject unsupported future ingestion versions (> 4)
      // Lower versions are valid but use dual write (path A)
      const parsedIngestionVersion = ingestionVersion
        ? parseInt(ingestionVersion, 10)
        : undefined;
      if (
        parsedIngestionVersion !== undefined &&
        (isNaN(parsedIngestionVersion) || parsedIngestionVersion > 4)
      ) {
        res.status(400);
        return {
          error: `Unsupported x-langfuse-ingestion-version: "${ingestionVersion}". Maximum supported: "4".`,
        };
      }

      // Extract headers to propagate for ingestion masking
      const propagatedHeaderNames =
        env.LANGFUSE_INGESTION_MASKING_PROPAGATED_HEADERS;
      const propagatedHeaders: Record<string, string> = {};
      for (const headerName of propagatedHeaderNames) {
        const value = req.headers[headerName];
        if (typeof value === "string") {
          propagatedHeaders[headerName] = value;
        }
      }

      // Organizations past the Cloud cutoff are force-enabled on v4 and read
      // the events table only, so their batches take the direct write even
      // without the ingestion-version header (LFE-14536). Resolved here rather
      // than in the worker because the organization signup date already rides
      // along on the authenticated scope.
      const forceDirectWrite = isOrgPastOtelDirectWriteCutoff({
        orgCreatedAt: auth.scope.orgCreatedAt,
        cutoff: env.LANGFUSE_MIGRATION_V4_OTEL_DIRECT_WRITE_ORG_CUTOFF,
        isLangfuseCloud: Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION),
      });
      if (forceDirectWrite) {
        getCurrentSpan()?.setAttribute(
          "langfuse.ingestion.otel.force_direct_write",
          true,
        );
      }

      const processor = new OtelIngestionProcessor({
        projectId: auth.scope.projectId,
        publicKey: auth.scope.publicKey,
        orgId: auth.scope.orgId,
        forceDirectWrite,
        propagatedHeaders:
          Object.keys(propagatedHeaders).length > 0
            ? propagatedHeaders
            : undefined,
        sdkName: attribution.ingestionSdkName,
        sdkVersion: attribution.ingestionSdkVersion,
        ingestionVersion,
      });

      // At this point, we have the raw OpenTelemetry Span body. We upload the full batch to S3
      // and the OtelIngestionProcessor logic will handle processing in the worker container.
      try {
        return await processor.publishToOtelIngestionQueue(resourceSpans);
      } catch (error) {
        markProjectIngestFailure(auth.scope.projectId, {
          source: "public_otel_api",
          reason: "publish_failed",
        });
        throw error;
      }
    },
  }),
});
