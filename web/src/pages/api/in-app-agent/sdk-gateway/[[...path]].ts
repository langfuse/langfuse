import type { NextApiRequest, NextApiResponse } from "next";
import { gunzipSync } from "node:zlib";
import { logger } from "@langfuse/shared/src/server";
import { hasProjectAccessByRole } from "@langfuse/shared";
import { authenticateSdkGatewayRequest } from "@/src/features/in-app-agent/server/sdkGateway/auth";
import {
  authorizeSdkGatewayOperation,
  containsForeignProjectId,
  inspectIngestionBatch,
  normalizeGatewayPath,
  resolveSdkGatewayOperation,
} from "@/src/features/in-app-agent/server/sdkGateway/policy";
import {
  admitModelAttempt,
  admitSdkGatewayRequest,
  releaseModelConcurrency,
  releaseSdkGatewayConcurrency,
  SdkGatewayQuotaError,
} from "@/src/features/in-app-agent/server/sdkGateway/quotas";
import {
  forwardSdkGatewayRequest,
  getSdkGatewayProjectKey,
  getSdkGatewayUpstreamOrigin,
} from "@/src/features/in-app-agent/server/sdkGateway/forward";
import { completeSdkGatewayModelRequest } from "@/src/features/in-app-agent/server/sdkGateway/modelComplete";

export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_ENCODED_BODY_BYTES = 1 * 1024 * 1024;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!getSdkGatewayProjectKey() || !getSdkGatewayUpstreamOrigin()) {
    return res.status(503).json({ message: "SDK gateway is not configured" });
  }

  const path = normalizeGatewayPath(req.url ?? "/");
  const method = req.method ?? "GET";
  const operation = resolveSdkGatewayOperation({ method, path });
  if (!operation) {
    return res.status(404).json({ message: "Unsupported SDK gateway route" });
  }

  const execution = await authenticateSdkGatewayRequest({
    authorization:
      typeof req.headers.authorization === "string"
        ? req.headers.authorization
        : undefined,
  });
  if (!execution) {
    return res.status(401).json({ message: "Invalid execution credentials" });
  }

  if (
    !authorizeSdkGatewayOperation({
      operation,
      projectRole: execution.projectRole,
      isAdmin: execution.isAdmin,
    })
  ) {
    return res
      .status(403)
      .json({ message: "Current user cannot perform this operation" });
  }

  const encodedBody = await readRawBody(req, execution.limits.encodedBodyBytes);
  if (!encodedBody) {
    return res
      .status(413)
      .json({ message: "Request body exceeds the encoded size limit" });
  }

  if (encodedBody.byteLength > MAX_ENCODED_BODY_BYTES) {
    return res
      .status(413)
      .json({ message: "Request body exceeds the encoded size limit" });
  }

  const decodedBody = decodeGatewayBody(
    encodedBody,
    req.headers["content-encoding"],
  );
  if (!decodedBody) {
    return res
      .status(400)
      .json({ message: "Request body could not be decoded" });
  }
  if (decodedBody.byteLength > execution.limits.decodedBodyBytes) {
    return res
      .status(413)
      .json({ message: "Request body exceeds the decoded size limit" });
  }

  const contentType = headerValue(req.headers["content-type"]);
  const parsedJson = tryParseJson(decodedBody, contentType);
  if (
    parsedJson !== undefined &&
    containsForeignProjectId(parsedJson, execution.projectId)
  ) {
    return res
      .status(403)
      .json({ message: "Cross-project identifiers are not allowed" });
  }

  let eventCount = 0;
  if (path === "/api/public/ingestion") {
    if (parsedJson === undefined) {
      return res.status(400).json({ message: "Invalid ingestion payload" });
    }

    const parsed = parsedJson as { batch?: unknown[] };
    const inspection = inspectIngestionBatch(
      Array.isArray(parsed.batch) ? parsed.batch : [],
    );
    if (!inspection.allowed) {
      return res
        .status(403)
        .json({ message: "Ingestion batch contains a forbidden event" });
    }
    if (
      inspection.requiresScores &&
      !hasProjectAccessByRole({
        role: execution.projectRole,
        admin: execution.isAdmin,
        scope: "scores:CUD",
      })
    ) {
      return res
        .status(403)
        .json({ message: "Current user cannot write scores" });
    }
    if (
      inspection.requiresTelemetry &&
      !hasProjectAccessByRole({
        role: execution.projectRole,
        admin: execution.isAdmin,
        scope: "promptExperiments:CUD",
      })
    ) {
      return res
        .status(403)
        .json({ message: "Current user cannot write experiment telemetry" });
    }
    eventCount = inspection.eventCount;
  }

  try {
    if (operation === "models.complete") {
      await admitModelAttempt({
        executionId: execution.executionId,
        projectId: execution.projectId,
        limits: execution.limits,
      });
      try {
        const result = await completeSdkGatewayModelRequest({
          execution,
          body: JSON.parse(encodedBody.toString("utf8")),
        });
        return res.status(200).json(result);
      } finally {
        await releaseModelConcurrency(execution.executionId);
      }
    }

    await admitSdkGatewayRequest({
      executionId: execution.executionId,
      projectId: execution.projectId,
      limits: execution.limits,
      eventCount,
    });

    try {
      const queryIndex = (req.url ?? "").indexOf("?");
      const forwarded = await forwardSdkGatewayRequest({
        method,
        path,
        query: queryIndex >= 0 ? (req.url ?? "").slice(queryIndex) : "",
        headers: req.headers,
        body: encodedBody,
      });

      for (const [name, value] of Object.entries(forwarded.headers)) {
        res.setHeader(name, value);
      }
      res.status(forwarded.status);
      res.end(forwarded.body);
      return;
    } finally {
      await releaseSdkGatewayConcurrency(execution.executionId);
    }
  } catch (error) {
    if (error instanceof SdkGatewayQuotaError) {
      res.setHeader("retry-after", error.retryable ? "1" : "0");
      return res.status(error.statusCode).json({ message: error.message });
    }

    logger.error("sdk-gateway.request_failed", {
      executionId: execution.executionId,
      path,
      error: error instanceof Error ? error.message : "unknown",
    });
    return res.status(500).json({ message: "SDK gateway request failed" });
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function decodeGatewayBody(
  body: Buffer,
  contentEncoding: string | string[] | undefined,
): Buffer | null {
  const encoding = headerValue(contentEncoding)?.toLowerCase();
  if (!encoding || encoding === "identity") {
    return body;
  }

  if (encoding !== "gzip" && encoding !== "x-gzip") {
    return null;
  }

  try {
    return gunzipSync(body);
  } catch {
    return null;
  }
}

function tryParseJson(
  body: Buffer,
  contentType: string | undefined,
): unknown | undefined {
  if (
    contentType &&
    !contentType.includes("json") &&
    !contentType.startsWith("text/")
  ) {
    return undefined;
  }

  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    return undefined;
  }
}

function readRawBody(
  req: NextApiRequest,
  maxBytes: number,
): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > maxBytes) {
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
