import crypto from "node:crypto";
import { createReadStream } from "node:fs";

import type { NextApiRequest, NextApiResponse } from "next";

import { env } from "@/src/env.mjs";
import { getMediaStorageServiceClient } from "@/src/features/media/server/getMediaStorageClient";
import { verifyLocalMediaToken } from "@/src/features/media/server/localMediaStorage";
import { prisma } from "@langfuse/shared/src/db";
import { logger, resolveLocalStoragePath } from "@langfuse/shared/src/server";

export const config = {
  api: {
    bodyParser: false,
  },
};

const sha256File = async (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("base64")));
  });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "PUT") {
    res.setHeader("Allow", "PUT");
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
      action: "upload",
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
    if (!media || media.bucketPath !== token.bucketPath) {
      res.status(404).end();
      return;
    }

    const contentLength = Number(req.headers["content-length"] ?? 0);
    if (contentLength !== token.contentLength) {
      res.status(400).send("Content-Length does not match signed upload");
      return;
    }

    const contentType = String(req.headers["content-type"] ?? "")
      .split(";")[0]
      ?.trim();
    if (contentType !== token.contentType) {
      res.status(400).send("Content-Type does not match signed upload");
      return;
    }

    const storage = getMediaStorageServiceClient(media.bucketName);
    await storage.uploadFile({
      fileName: token.bucketPath,
      fileType: token.contentType,
      data: req,
    });

    const filePath = resolveLocalStoragePath(
      env.LANGFUSE_MEDIA_LOCAL_PATH!,
      token.bucketPath,
    );
    const actualHash = await sha256File(filePath);
    if (actualHash !== token.sha256Hash) {
      await storage.deleteFiles([token.bucketPath]);
      await prisma.media.update({
        where: {
          projectId_id: {
            projectId: token.projectId,
            id: token.mediaId,
          },
        },
        data: {
          uploadHttpStatus: 400,
          uploadHttpError: "SHA-256 hash does not match signed upload",
        },
      });
      res.status(400).send("SHA-256 hash does not match signed upload");
      return;
    }

    await prisma.media.update({
      where: {
        projectId_id: {
          projectId: token.projectId,
          id: token.mediaId,
        },
      },
      data: {
        uploadedAt: new Date(),
        uploadHttpStatus: 200,
        uploadHttpError: null,
      },
    });

    res.status(200).end();
  } catch (error) {
    logger.warn("Local media upload failed", { error, mediaId });
    res
      .status(400)
      .send(error instanceof Error ? error.message : "Bad request");
  }
}
