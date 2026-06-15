import {
  ChatMessageRole,
  ChatMessageType,
  parseUnknownToString,
  MediaReferenceStringSchema,
  type ChatMessage,
} from "@langfuse/shared";
import { type ExtractedVariable, logger } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { getMediaStorageClient } from "./mediaStorageClient";
import { compileTemplateString } from "../utils";

export interface CompileEvalPromptParams {
  templatePrompt: string;
  variables: ExtractedVariable[];
}

export function compileEvalPrompt(params: CompileEvalPromptParams): string {
  // Stringify extracted values here (LLM-judge's consumption boundary) so
  // the upstream extractor can preserve original shapes for code-eval and
  // template substitution still gets a flat string per variable.
  const variableMap = Object.fromEntries(
    params.variables.map(({ var: key, value }) => [
      key,
      parseUnknownToString(value),
    ]),
  );

  return compileTemplateString(params.templatePrompt, variableMap);
}

export function buildEvalExecutionMetadata(params: {
  jobExecutionId: string;
  jobConfigurationId: string;
  targetTraceId?: string | null;
  targetObservationId?: string | null;
  targetDatasetItemId?: string | null;
}): Record<string, string> {
  return Object.fromEntries(
    Object.entries({
      job_execution_id: params.jobExecutionId,
      job_configuration_id: params.jobConfigurationId,
      target_trace_id: params.targetTraceId,
      target_observation_id: params.targetObservationId,
      target_dataset_item_id: params.targetDatasetItemId,
    }).filter(([, value]) => value != null),
  ) as Record<string, string>;
}

const MEDIA_REFERENCE_PATTERN = /@@@langfuseMedia:[\s\S]*?@@@/g;
const MEDIA_URL_TTL_SECONDS = 3600;

type EvalContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/**
 * Resolves a Langfuse media reference to a presigned download URL the LLM
 * provider can fetch. Returns null when the media record is missing, was not
 * uploaded successfully, or the lookup/presign fails, so callers can fall back
 * to plain text rather than failing the whole eval job on a transient storage
 * error.
 */
async function resolveMediaUrl(
  projectId: string,
  mediaId: string,
): Promise<string | null> {
  try {
    const media = await prisma.media.findUnique({
      where: { projectId_id: { projectId, id: mediaId } },
    });

    if (
      !media ||
      !(media.uploadHttpStatus === 200 || media.uploadHttpStatus === 201)
    ) {
      return null;
    }

    return await getMediaStorageClient(media.bucketName).getSignedUrl(
      media.bucketPath,
      MEDIA_URL_TTL_SECONDS,
      false, // inline disposition so providers can fetch the image directly
    );
  } catch (error) {
    logger.warn(
      `Failed to resolve media ${mediaId} for eval in project ${projectId}; falling back to text`,
      error,
    );
    return null;
  }
}

/**
 * Builds the chat messages sent to the LLM-as-a-judge model.
 *
 * When the compiled prompt contains `@@@langfuseMedia:...@@@` image references,
 * they are resolved to presigned URLs and emitted as multimodal `image_url`
 * content parts so the judge can actually see the image. Prompts without
 * resolvable image media keep their plain-string content.
 */
export async function buildEvalMessages(
  prompt: string,
  projectId: string,
): Promise<ChatMessage[]> {
  const matches = [...prompt.matchAll(MEDIA_REFERENCE_PATTERN)];

  if (matches.length === 0) {
    return [
      { type: ChatMessageType.User, role: ChatMessageRole.User, content: prompt },
    ];
  }

  // First pass: split the prompt into ordered segments. Image media records the
  // id to resolve; non-image media and invalid references stay as text so the
  // judge still sees that media was referenced.
  type Segment =
    | { kind: "text"; text: string }
    | { kind: "image"; mediaId: string; referenceString: string; url?: string | null };

  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const match of matches) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      segments.push({ kind: "text", text: prompt.substring(lastIndex, matchIndex) });
    }

    const referenceString = match[0];
    const parsed = MediaReferenceStringSchema.safeParse(referenceString);

    if (parsed.success && parsed.data.type?.startsWith("image/")) {
      segments.push({ kind: "image", mediaId: parsed.data.id, referenceString });
    } else {
      segments.push({ kind: "text", text: referenceString });
    }

    lastIndex = matchIndex + referenceString.length;
  }

  if (lastIndex < prompt.length) {
    segments.push({ kind: "text", text: prompt.substring(lastIndex) });
  }

  // Resolve all image references concurrently, then assemble parts in order.
  const imageSegments = segments.filter(
    (segment): segment is Extract<Segment, { kind: "image" }> =>
      segment.kind === "image",
  );
  await Promise.all(
    imageSegments.map(async (segment) => {
      segment.url = await resolveMediaUrl(projectId, segment.mediaId);
    }),
  );

  const contentParts: EvalContentPart[] = segments.map((segment) =>
    segment.kind === "text"
      ? { type: "text", text: segment.text }
      : segment.url
        ? { type: "image_url", image_url: { url: segment.url } }
        : { type: "text", text: segment.referenceString },
  );

  // If nothing resolved to an actual image, send a plain-string message to keep
  // behavior identical to the non-multimodal path.
  const hasImage = contentParts.some((part) => part.type === "image_url");
  if (!hasImage) {
    return [
      { type: ChatMessageType.User, role: ChatMessageRole.User, content: prompt },
    ];
  }

  return [
    {
      // PublicAPICreated is the ChatMessage variant that carries array content;
      // role drives the downstream langchain message construction.
      type: ChatMessageType.PublicAPICreated,
      role: ChatMessageRole.User,
      content: contentParts,
    },
  ];
}

export function getEnvironmentFromVariables(
  variables: ExtractedVariable[],
): string | undefined {
  return variables.find((variable) => variable.environment)?.environment;
}
