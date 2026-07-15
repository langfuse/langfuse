import {
  logger,
  processOtelMedia,
  type ResourceSpan,
  uploadMediaForTrace,
} from "@langfuse/shared/src/server";

export async function processOtelMediaIfEnabled(params: {
  enabled: boolean;
  resourceSpans: ResourceSpan[];
  projectId: string;
  fileKey: string;
  mediaBucket?: string;
  mediaPrefix: string;
  processMedia?: typeof processOtelMedia;
}): Promise<void> {
  const {
    enabled,
    resourceSpans,
    projectId,
    fileKey,
    mediaBucket,
    mediaPrefix,
    processMedia = processOtelMedia,
  } = params;

  if (!enabled) return;

  if (!mediaBucket) {
    logger.warn(
      "OTEL media upload is enabled but no media storage bucket is configured",
      { projectId, fileKey },
    );
    return;
  }

  try {
    await processMedia({
      resourceSpans,
      projectId,
      mediaBucket,
      mediaPrefix,
      uploadMedia: uploadMediaForTrace,
    });
  } catch (error) {
    logger.warn(
      "OTEL media processing failed; continuing ingestion with original span values",
      { projectId, fileKey, error },
    );
  }
}
