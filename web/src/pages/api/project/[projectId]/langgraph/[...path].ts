import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/src/server/auth";
import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { decrypt } from "@langfuse/shared/encryption";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

export const config = {
  api: { bodyParser: false },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const {
    projectId,
    path: pathSegments,
    serverId,
  } = req.query as {
    projectId: string;
    path: string[];
    serverId?: string;
  };

  if (!serverId) {
    return res.status(400).json({ error: "serverId query param required" });
  }

  const authOptions = await getAuthOptions();
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Verify the authenticated user is a member of this project
  if (!hasProjectAccess({ session, projectId, scope: "project:read" })) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const server = await prisma.agentStudioServer.findFirst({
    where: { id: serverId, projectId },
  });
  if (!server) {
    return res.status(404).json({ error: "Server not found" });
  }

  const targetPath = Array.isArray(pathSegments)
    ? pathSegments.join("/")
    : pathSegments;

  const queryParams = new URLSearchParams(
    Object.entries(req.query)
      .filter(([k]) => k !== "projectId" && k !== "path" && k !== "serverId")
      .flatMap(([k, v]) =>
        Array.isArray(v) ? v.map((val) => [k, val]) : [[k, v ?? ""]],
      ),
  );
  const queryString = queryParams.toString();
  const targetUrl = `${server.serverUrl}/${targetPath}${queryString ? `?${queryString}` : ""}`;

  try {
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", resolve);
      req.on("error", reject);
    });
    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

    const forwardHeaders: Record<string, string> = {
      "Content-Type": req.headers["content-type"] ?? "application/json",
    };

    // Decrypt and inject custom headers stored server-side (never exposed to the browser)
    if (server.headersEncrypted) {
      try {
        const stored = JSON.parse(decrypt(server.headersEncrypted)) as {
          name: string;
          value: string;
        }[];
        for (const h of stored) {
          if (h.name.trim()) forwardHeaders[h.name.trim()] = h.value;
        }
      } catch (err) {
        logger.warn("AgentStudio: failed to decrypt custom headers", { err });
      }
    }

    const upstreamRes = await fetch(targetUrl, {
      method: req.method ?? "GET",
      headers: forwardHeaders,
      body: body?.length ? body : undefined,
    });

    const contentType = upstreamRes.headers.get("content-type") ?? "";

    if (contentType.includes("text/event-stream")) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      if (!upstreamRes.body) {
        return res.end();
      }

      const reader = upstreamRes.body.getReader();
      const decoder = new TextDecoder();

      const pump = async (): Promise<void> => {
        try {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            return;
          }
          res.write(decoder.decode(value, { stream: true }));
          if (
            "flush" in res &&
            typeof (res as unknown as { flush: () => void }).flush ===
              "function"
          ) {
            (res as unknown as { flush: () => void }).flush();
          }
          return pump();
        } catch (err) {
          logger.warn("SSE proxy stream error", { err });
          res.end();
        }
      };

      req.on("close", () => reader.cancel());
      return pump();
    }

    res.status(upstreamRes.status);
    const responseBody = await upstreamRes.text();
    return res.send(responseBody);
  } catch (err) {
    logger.error("AgentStudio proxy error", { err, targetUrl });
    return res.status(502).json({
      error: "Bad gateway",
      message: err instanceof Error ? err.message : "Upstream request failed",
    });
  }
}
