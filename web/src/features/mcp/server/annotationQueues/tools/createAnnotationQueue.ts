import { createAnnotationQueueForApi } from "@/src/features/annotation-queues/server/publicAnnotationQueueService";
import {
  CreateAnnotationQueueBody,
  CreateAnnotationQueueResponse,
} from "@/src/features/public-api/types/annotation-queues";
import { defineTool } from "../../../core/define-tool";
import { buildAnnotationQueueUrl } from "@langfuse/shared/src/server";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { getMcpPublicApiAuth } from "../../publicApi";
import { z } from "zod";

const CreateAnnotationQueueBaseSchema = z
  .object({
    name: z.string(),
    description: z
      .string()
      .optional()
      .describe("Note for reviewers on what to look for."),
    scoreConfigIds: z
      .array(z.string())
      .min(1)
      .describe(
        "Score configs (from listScoreConfigs or createScoreConfig) reviewers fill in per item; unique and from this project.",
      ),
  })
  .strict();

export const [createAnnotationQueueTool, handleCreateAnnotationQueue] =
  defineTool({
    name: "createAnnotationQueue",
    description:
      "Create an annotation queue (a worklist of traces, observations, or sessions for human review and scoring) and return it with id and UI url. Then add items with createAnnotationQueueItem or batchCreateAnnotationQueueItems and reviewers with createAnnotationQueueAssignment. Fails on the Hobby plan if the project already has a queue.",
    action: "annotationQueues:CUD",
    baseSchema: CreateAnnotationQueueBaseSchema,
    inputSchema: CreateAnnotationQueueBody,
    annotations: { readOnlyHint: false, destructiveHint: false },
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.annotation_queues.create",
        context,
        attributes: { "mcp.annotation_queue_name": input.name },
        fn: async () => {
          const auth = await getMcpPublicApiAuth(context);

          const result = await createAnnotationQueueForApi({
            projectId: context.projectId,
            plan: auth.scope.plan,
            input,
            auditScope: context,
          });

          const queue = CreateAnnotationQueueResponse.parse(result);

          return {
            ...queue,
            url: buildAnnotationQueueUrl({
              projectId: context.projectId,
              queueId: queue.id,
            }),
          };
        },
      }),
  });
