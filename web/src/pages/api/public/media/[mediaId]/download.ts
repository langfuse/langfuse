import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";

import type { NextApiRequest, NextApiResponse } from "next";

import { env } from "@/src/env.mjs";
import { verifyLocalMediaToken } from "@/src/features/media/server/localMediaStorage";
import { prisma } from "@langfuse/shared/src/db";
import { logger, resolveLocalStoragePath } from "@langfuse/shared/src/server";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end();
    return;
  }

  if (env.LANGFUSE_MEDIA_STORAGE_BACKEND !== "local") {
    res.status(404).end();
    return;
  }

  const mediaId = String(req.query.mediaId ?? "");
  try {
    const token = verifyLocalMediaToken(req.query.token, {
      action: "download",
      mediaId,
    });

    const media = await prisma.media.findUnique({
      where: {
        projectId_id: {
          projectId: token.projectId,
          id: token.mediaId,
        },
      },
    });
    if (
      !media ||
      media.bucketPath !== token.bucketPath ||
      !(media.uploadHttpStatus === 200 || media.uploadHttpStatus === 201)
    ) {
      res.status(404).end();
      return;
    }

    const filePath = resolveLocalStoragePath(
      env.LANGFUSE_MEDIA_LOCAL_PATH!,
      token.bucketPath,
    );
    res.setHeader("Content-Type", token.contentType);
    res.setHeader("Content-Length", String(token.contentLength));
    await pipeline(createReadStream(filePath), res);
  } catch (error) {
    logger.warn("Local media download failed", { error, mediaId });
    if (!res.headersSent) {
      res
        .status(400)
        .send(error instanceof Error ? error.message : "Bad request");
    }
  }
}
