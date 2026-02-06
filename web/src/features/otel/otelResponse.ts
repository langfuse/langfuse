import { type NextApiResponse } from "next";
import { $root } from "@/src/pages/api/public/otel/otlp-proto/generated/root";

/**
 * OTEL Content Types supported by the OTLP/HTTP specification.
 * Per https://opentelemetry.io/docs/specs/otlp/#otlphttp-response:
 * - Response encoding should match request encoding
 * - Protobuf requests → application/x-protobuf response
 * - JSON requests → application/json response
 */
export type OtelContentType = "application/json" | "application/x-protobuf";

/**
 * Determines the appropriate response Content-Type based on request Content-Type.
 * Per OTLP spec, responses should use the same encoding as the request.
 */
export function getOtelContentType(
  requestContentType: string | undefined,
): OtelContentType {
  if (requestContentType?.includes("application/x-protobuf")) {
    return "application/x-protobuf";
  }
  return "application/json";
}

/**
 * Sends a successful ExportTraceServiceResponse with the correct Content-Type.
 * Per OTLP spec, success responses return ExportTraceServiceResponse with optional partialSuccess.
 */
export function sendOtelTraceResponse(params: {
  res: NextApiResponse;
  contentType: OtelContentType;
  partialSuccess?: {
    rejectedSpans?: number;
    errorMessage?: string;
  };
}): void {
  const { res, contentType, partialSuccess } = params;

  const ExportTraceServiceResponse =
    $root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceResponse;

  const responseMessage = ExportTraceServiceResponse.create(
    partialSuccess
      ? {
          partialSuccess: {
            rejectedSpans: partialSuccess.rejectedSpans ?? 0,
            errorMessage: partialSuccess.errorMessage ?? "",
          },
        }
      : {},
  );

  if (contentType === "application/x-protobuf") {
    const buffer = ExportTraceServiceResponse.encode(responseMessage).finish();
    res.setHeader("Content-Type", "application/x-protobuf");
    res.status(200).send(Buffer.from(buffer));
  } else {
    res.setHeader("Content-Type", "application/json");
    res.status(200).json(
      partialSuccess
        ? {
            partialSuccess: {
              rejectedSpans: partialSuccess.rejectedSpans ?? 0,
              errorMessage: partialSuccess.errorMessage ?? "",
            },
          }
        : {},
    );
  }
}

/**
 * Sends a successful ExportMetricsServiceResponse with the correct Content-Type.
 * Per OTLP spec, success responses return ExportMetricsServiceResponse with optional partialSuccess.
 */
export function sendOtelMetricsResponse(params: {
  res: NextApiResponse;
  contentType: OtelContentType;
  partialSuccess?: {
    rejectedDataPoints?: number;
    errorMessage?: string;
  };
}): void {
  const { res, contentType, partialSuccess } = params;

  const ExportMetricsServiceResponse =
    $root.opentelemetry.proto.collector.metrics.v1.ExportMetricsServiceResponse;

  const responseMessage = ExportMetricsServiceResponse.create(
    partialSuccess
      ? {
          partialSuccess: {
            rejectedDataPoints: partialSuccess.rejectedDataPoints ?? 0,
            errorMessage: partialSuccess.errorMessage ?? "",
          },
        }
      : {},
  );

  if (contentType === "application/x-protobuf") {
    const buffer =
      ExportMetricsServiceResponse.encode(responseMessage).finish();
    res.setHeader("Content-Type", "application/x-protobuf");
    res.status(200).send(Buffer.from(buffer));
  } else {
    res.setHeader("Content-Type", "application/json");
    res.status(200).json(
      partialSuccess
        ? {
            partialSuccess: {
              rejectedDataPoints: partialSuccess.rejectedDataPoints ?? 0,
              errorMessage: partialSuccess.errorMessage ?? "",
            },
          }
        : {},
    );
  }
}

/**
 * Sends an error response with the correct Content-Type for traces.
 * Error responses should also respect the request's Content-Type per OTLP spec.
 */
export function sendOtelTraceErrorResponse(params: {
  res: NextApiResponse;
  contentType: OtelContentType;
  statusCode: number;
  message: string;
}): void {
  const { res, contentType, statusCode, message } = params;

  if (contentType === "application/x-protobuf") {
    const ExportTraceServiceResponse =
      $root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceResponse;
    const errorResponse = ExportTraceServiceResponse.create({
      partialSuccess: {
        rejectedSpans: -1, // Indicates full rejection
        errorMessage: message,
      },
    });
    const buffer = ExportTraceServiceResponse.encode(errorResponse).finish();
    res.setHeader("Content-Type", "application/x-protobuf");
    res.status(statusCode).send(Buffer.from(buffer));
  } else {
    res.setHeader("Content-Type", "application/json");
    res.status(statusCode).json({ error: message });
  }
}

/**
 * Sends an error response with the correct Content-Type for metrics.
 * Error responses should also respect the request's Content-Type per OTLP spec.
 */
export function sendOtelMetricsErrorResponse(params: {
  res: NextApiResponse;
  contentType: OtelContentType;
  statusCode: number;
  message: string;
}): void {
  const { res, contentType, statusCode, message } = params;

  if (contentType === "application/x-protobuf") {
    const ExportMetricsServiceResponse =
      $root.opentelemetry.proto.collector.metrics.v1
        .ExportMetricsServiceResponse;
    const errorResponse = ExportMetricsServiceResponse.create({
      partialSuccess: {
        rejectedDataPoints: -1, // Indicates full rejection
        errorMessage: message,
      },
    });
    const buffer = ExportMetricsServiceResponse.encode(errorResponse).finish();
    res.setHeader("Content-Type", "application/x-protobuf");
    res.status(statusCode).send(Buffer.from(buffer));
  } else {
    res.setHeader("Content-Type", "application/json");
    res.status(statusCode).json({ error: message });
  }
}

/**
 * Sends an error response with the correct Content-Type.
 * Error responses should also respect the request's Content-Type per OTLP spec.
 * @deprecated Use sendOtelTraceErrorResponse or sendOtelMetricsErrorResponse instead
 */
export function sendOtelErrorResponse(params: {
  res: NextApiResponse;
  contentType: OtelContentType;
  statusCode: number;
  message: string;
}): void {
  // Default to trace error response for backward compatibility
  return sendOtelTraceErrorResponse(params);
}
