import type { IncomingHttpHeaders } from "node:http";

import type { NextApiRequest, NextApiResponse } from "next";
import protobuf from "protobufjs";

export const OTLP_PROTOBUF_CONTENT_TYPE = "application/x-protobuf";

// google.rpc.Status is the OTLP/HTTP error body. Only `message` is required;
// `code` is omitted because the spec says servers MAY leave it unset.
const OtlpStatusType = protobuf.Type.fromJSON("Status", {
  fields: {
    message: { id: 2, type: "string" },
  },
});

function isOtlpProtobufContentType(
  contentType: string | string[] | undefined,
): boolean {
  const value = Array.isArray(contentType) ? contentType[0] : contentType;
  return value?.toLowerCase().includes(OTLP_PROTOBUF_CONTENT_TYPE) ?? false;
}

function isOtlpProtobufRequest(headers: IncomingHttpHeaders): boolean {
  return isOtlpProtobufContentType(headers["content-type"]);
}

function encodeOtlpStatusMessage(message: string): Buffer {
  return Buffer.from(
    OtlpStatusType.encode(OtlpStatusType.create({ message })).finish(),
  );
}

export function decodeOtlpStatusMessage(bytes: Uint8Array): {
  message: string;
} {
  return OtlpStatusType.toObject(OtlpStatusType.decode(bytes), {
    defaults: true,
  }) as { message: string };
}

function otlpErrorMessage(body: unknown): string {
  if (body && typeof body === "object") {
    if ("message" in body && typeof body.message === "string") {
      return body.message;
    }
    if ("error" in body && typeof body.error === "string") {
      return body.error;
    }
  }

  return "Request failed";
}

/**
 * OTLP/HTTP writer for the traces and metrics ingestion routes.
 * JSON OTLP requests stay JSON; protobuf requests get an empty
 * Export*ServiceResponse or a google.rpc.Status error.
 */
export function writeOtlpHttpResponse({
  req,
  res,
  body,
  statusCode,
}: {
  req: Pick<NextApiRequest, "headers">;
  res: NextApiResponse;
  body: unknown;
  statusCode: number;
}): void {
  res.status(statusCode);

  if (!isOtlpProtobufRequest(req.headers)) {
    res.json(body ?? { message: "OK" });
    return;
  }

  res.setHeader("Content-Type", OTLP_PROTOBUF_CONTENT_TYPE);

  if (statusCode === 200) {
    // Export*ServiceResponse with unset partial_success is an empty message.
    res.end(Buffer.alloc(0));
    return;
  }

  res.end(encodeOtlpStatusMessage(otlpErrorMessage(body)));
}
