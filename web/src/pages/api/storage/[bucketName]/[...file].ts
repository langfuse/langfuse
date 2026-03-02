import { type NextApiRequest, type NextApiResponse } from "next";
import { StorageServiceFactory, logger } from "@langfuse/shared/src/server";

/**
 * Download route for files stored in object storage
 * In OceanBase environment, files are stored in opendal_storage table
 * In other environments, files are stored in S3/Azure/GCS
 *
 * Example URL: /api/storage/langfuse/exports/1768550989280-lf-traces-export-cmk3fy9770009o30j230fwitq.csv
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    // Only allow GET requests
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { bucketName, file } = req.query;

    // Parse bucketName and file path from query params
    const bucketNameStr = Array.isArray(bucketName)
      ? bucketName[0]
      : bucketName;
    const fileArray = Array.isArray(file) ? file : [file];
    const fileName = fileArray.join("/");

    logger.info(
      `Download request for bucket: ${bucketNameStr}, file: ${fileName}`,
    );

    // Validate bucket name
    if (!bucketNameStr || bucketNameStr.trim() === "") {
      return res.status(400).json({ error: "Invalid bucket name" });
    }

    // Validate file name
    if (!fileName || fileName.trim() === "") {
      return res.status(400).json({ error: "Invalid file name" });
    }

    // Initialize storage service with batch export configuration
    // This will automatically select OceanBaseStorageService in OB environment
    // Read directly from process.env as these variables are from worker config
    const storage = StorageServiceFactory.getInstance({
      bucketName: bucketNameStr,
      accessKeyId: process.env.LANGFUSE_S3_BATCH_EXPORT_ACCESS_KEY_ID,
      secretAccessKey: process.env.LANGFUSE_S3_BATCH_EXPORT_SECRET_ACCESS_KEY,
      endpoint: process.env.LANGFUSE_S3_BATCH_EXPORT_ENDPOINT,
      externalEndpoint: process.env.LANGFUSE_S3_BATCH_EXPORT_EXTERNAL_ENDPOINT,
      region: process.env.LANGFUSE_S3_BATCH_EXPORT_REGION,
      forcePathStyle:
        process.env.LANGFUSE_S3_BATCH_EXPORT_FORCE_PATH_STYLE === "true",
      awsSse: process.env.LANGFUSE_S3_BATCH_EXPORT_SSE as
        | "AES256"
        | "aws:kms"
        | undefined,
      awsSseKmsKeyId: process.env.LANGFUSE_S3_BATCH_EXPORT_SSE_KMS_KEY_ID,
    });

    // Download file from storage
    // In OB: reads from opendal_storage table
    // In other environments: reads from S3/Azure/GCS
    let content: string;
    try {
      content = await storage.download(fileName);
    } catch (error: any) {
      // Check if it's a known browser request (like Chrome DevTools)
      const isKnownBrowserRequest =
        fileName.includes(".well-known/") ||
        fileName.includes("favicon.ico") ||
        fileName.includes("robots.txt");

      if (isKnownBrowserRequest) {
        // Log at debug level for expected browser requests
        logger.debug(`Browser request for non-existent file: ${fileName}`);
      } else {
        // Log at error level for unexpected file not found
        logger.error(`File not found: ${fileName}`, error);
      }
      return res.status(404).json({ error: "File not found" });
    }

    // Determine content type based on file extension
    const fileNameLower = fileName.toLowerCase();
    let contentType = "application/octet-stream";

    if (fileNameLower.endsWith(".csv")) {
      contentType = "text/csv; charset=utf-8";
    } else if (fileNameLower.endsWith(".jsonl")) {
      contentType = "application/x-ndjson; charset=utf-8";
    } else if (fileNameLower.endsWith(".json")) {
      contentType = "application/json; charset=utf-8";
    }

    // Extract filename for Content-Disposition header
    const filenameOnly = fileName.split("/").pop() ?? "export";

    logger.info(
      `Successfully downloaded file: ${fileName}, size: ${content.length} bytes`,
    );

    // Return file with appropriate headers
    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filenameOnly}"`,
    );
    res.setHeader("Cache-Control", "private, max-age=3600"); // Cache for 1 hour
    return res.status(200).send(content);
  } catch (error) {
    logger.error("Error in download route:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
