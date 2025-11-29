import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod/v4";
import { randomUUID } from "crypto";
import {
  logger,
  traceException,
  instrumentAsync,
  OtelIngestionQueue,
  QueueJobs,
  getS3EventStorageConfig,
  listS3FilesPaginated,
  generateOtelS3Prefixes,
} from "@langfuse/shared/src/server";
import { AdminApiAuthService } from "@/src/ee/features/admin-api/server/adminApiAuth";

/*
This API route is used to replay OTEL ingestion events from S3 for a specific project
within a given time range. It lists S3 objects and queues them for reprocessing.
*/

const RequestSchema = z.object({
  projectId: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  granularity: z.enum(["hour", "minute"]).default("hour"),
});

const MAX_FILES = 1_000_000;
const BATCH_SIZE = 10_000;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    // Only allow POST
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // Auth check - allowed on Langfuse Cloud
    if (
      !AdminApiAuthService.handleAdminAuth(req, res, {
        isAllowedOnLangfuseCloud: true,
      })
    ) {
      return;
    }

    // Validate request body
    const parsed = RequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.format(),
      });
    }

    const { projectId, startDate, endDate, granularity } = parsed.data;
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
      return res
        .status(400)
        .json({ error: "startDate must be before endDate" });
    }

    return await instrumentAsync(
      { name: "otel-ingestion-replay" },
      async (span) => {
        span.setAttribute("projectId", projectId);
        span.setAttribute("startDate", startDate);
        span.setAttribute("endDate", endDate);
        span.setAttribute("granularity", granularity);

        logger.info("Starting OTEL ingestion replay", {
          projectId,
          startDate,
          endDate,
          granularity,
        });

        // Get S3 client and config
        const {
          client: s3Client,
          bucketName,
          prefix,
        } = getS3EventStorageConfig();

        // Generate S3 prefixes for the time range
        const prefixes = generateOtelS3Prefixes(
          prefix,
          projectId,
          start,
          end,
          granularity,
        );

        span.setAttribute("prefixCount", prefixes.length);

        // Collect all files across all prefixes
        const allFiles: string[] = [];

        for (const s3Prefix of prefixes) {
          const result = await listS3FilesPaginated(
            s3Client,
            bucketName,
            s3Prefix,
            MAX_FILES - allFiles.length,
          );

          allFiles.push(...result.files);

          if (allFiles.length > MAX_FILES) {
            span.setAttribute("filesFound", allFiles.length);
            span.setAttribute("error", "too_many_files");
            return res.status(400).json({
              error: "Too many files",
              message: `Time range contains more than ${MAX_FILES.toLocaleString()} files. Please use a shorter time range.`,
              filesFound: allFiles.length,
            });
          }
        }

        span.setAttribute("filesFound", allFiles.length);

        if (allFiles.length === 0) {
          return res.status(200).json({ jobsQueued: 0 });
        }

        // Get OtelIngestionQueue instance
        const queue = OtelIngestionQueue.getInstance({});
        if (!queue) {
          span.setAttribute("error", "queue_unavailable");
          return res
            .status(500)
            .json({ error: "Failed to get OtelIngestionQueue" });
        }

        // Queue jobs in batches of 10,000
        let totalQueued = 0;

        for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
          const batch = allFiles.slice(i, i + BATCH_SIZE);

          const jobs = batch.map((fileKey) => ({
            name: QueueJobs.OtelIngestionJob,
            data: {
              id: randomUUID(),
              timestamp: new Date(),
              name: QueueJobs.OtelIngestionJob as const,
              payload: {
                data: {
                  fileKey,
                },
                authCheck: {
                  validKey: true as const,
                  scope: {
                    projectId,
                    accessLevel: "project" as const,
                  },
                },
              },
            },
          }));

          await queue.addBulk(jobs);
          totalQueued += batch.length;

          logger.info(`Queued batch ${Math.ceil((i + 1) / BATCH_SIZE)}`, {
            batchSize: batch.length,
            totalQueued,
            remaining: allFiles.length - totalQueued,
          });
        }

        span.setAttribute("jobsQueued", totalQueued);

        logger.info("OTEL ingestion replay completed", {
          projectId,
          jobsQueued: totalQueued,
        });

        return res.status(200).json({ jobsQueued: totalQueued });
      },
    );
  } catch (error) {
    traceException(error);
    logger.error("OTEL ingestion replay failed", error);

    return res.status(500).json({ error: "Internal server error" });
  }
}
