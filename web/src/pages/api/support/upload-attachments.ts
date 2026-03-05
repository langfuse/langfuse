import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerAuthSession } from "@/src/server/auth";
import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";
import { uploadPylonAttachment } from "@/src/features/support-chat/pylon/pylonClient";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
  },
};

type FilePayload = {
  fileName: string;
  fileBase64: string;
};

type RequestBody = {
  files: FilePayload[];
};

type ResponseBody = { attachment_urls: string[] } | { error: string };

const MAX_FILES = 5;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerAuthSession({ req, res });
  if (!session?.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const pylonApiKey = env.PYLON_API_KEY;
  if (!pylonApiKey) {
    return res
      .status(503)
      .json({ error: "Pylon integration is not configured" });
  }

  const body = req.body as RequestBody;
  if (!body?.files || !Array.isArray(body.files)) {
    return res.status(400).json({ error: "Missing files array in body" });
  }

  if (body.files.length > MAX_FILES) {
    return res
      .status(400)
      .json({ error: `Maximum ${MAX_FILES} files allowed` });
  }

  try {
    const validatedFiles: { buffer: Buffer; fileName: string }[] = [];

    for (const file of body.files) {
      if (!file.fileName || !file.fileBase64) {
        return res
          .status(400)
          .json({ error: "Each file must have fileName and fileBase64" });
      }

      const buffer = Buffer.from(file.fileBase64, "base64");

      if (buffer.length > MAX_FILE_SIZE_BYTES) {
        return res.status(400).json({
          error: `File "${file.fileName}" exceeds maximum size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
        });
      }

      validatedFiles.push({ buffer, fileName: file.fileName });
    }

    const results = await Promise.all(
      validatedFiles.map((file) =>
        uploadPylonAttachment({
          apiKey: pylonApiKey,
          file: file.buffer,
          fileName: file.fileName,
        }),
      ),
    );

    const attachmentUrls = results.map((result, idx) => {
      if (!result.data?.url) {
        throw new Error(
          `Pylon returned no URL for file "${validatedFiles[idx]?.fileName}"`,
        );
      }
      return result.data.url;
    });

    return res.status(200).json({ attachment_urls: attachmentUrls });
  } catch (err) {
    logger.error("Failed to upload attachments to Pylon", err);
    return res
      .status(500)
      .json({ error: "Failed to upload attachments. Please try again." });
  }
}
