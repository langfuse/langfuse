import { env } from "@/src/env.mjs";
import { throwIfNoProjectAccess } from "@/src/features/rbac";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  ChatMessageRole,
  ChatMessageType,
  LLMApiKeySchema,
  supportedModels,
  type ChatMessage,
  type Prisma,
} from "@langfuse/shared";
import {
  createLLMOutput,
  generateLangfuseAIObject,
  generateLLMText,
  getClientInitiatedNonStreamingLlmTimeoutMs,
  getLangfuseAIModelInfo,
  getLLMErrorInfo,
  mapLegacyLLMCompletionParams,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  AnnotationAnswersSchema,
  AnnotationViewSpecGenerationSchema,
  AnnotationViewSpecSchema,
  STARTER_ANNOTATION_SPEC,
  validateAnswers,
} from "../types";

const workflowInput = z.object({
  projectId: z.string(),
  queueId: z.string(),
});

export const annotationWorkflowRouter = createTRPCRouter({
  generationModel: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "annotationQueues:CUD",
      });

      return getLangfuseAIModelInfo() ?? null;
    }),

  list: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "annotationQueues:CUD",
      });

      return ctx.prisma.annotationWorkflow.findMany({
        where: { projectId: input.projectId },
        orderBy: { updatedAt: "desc" },
        include: {
          queue: {
            select: { id: true, name: true },
          },
          versions: {
            orderBy: { version: "desc" },
            select: {
              id: true,
              workflowId: true,
              version: true,
              source: true,
              modelProvider: true,
              modelName: true,
              publishedAt: true,
              createdAt: true,
              spec: true,
            },
          },
          _count: { select: { versions: true } },
        },
      });
    }),

  publishedQueues: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "annotationQueues:read",
      });

      return ctx.prisma.annotationWorkflow.findMany({
        where: { projectId: input.projectId, status: "PUBLISHED" },
        select: {
          queueId: true,
          versions: {
            where: { publishedAt: { not: null } },
            orderBy: { publishedAt: "desc" },
            take: 1,
            select: { id: true, version: true, publishedAt: true },
          },
        },
      });
    }),

  publishedForQueue: protectedProjectProcedure
    .input(workflowInput)
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "annotationQueues:read",
      });

      const workflow = await ctx.prisma.annotationWorkflow.findFirst({
        where: {
          projectId: input.projectId,
          queueId: input.queueId,
        },
        select: {
          id: true,
          name: true,
          description: true,
          versions: {
            where: { publishedAt: { not: null } },
            orderBy: { publishedAt: "desc" },
            take: 1,
            select: {
              id: true,
              version: true,
              spec: true,
              publishedAt: true,
            },
          },
        },
      });

      if (!workflow?.versions[0]) return null;
      return {
        ...workflow,
        version: {
          ...workflow.versions[0],
          spec: AnnotationViewSpecSchema.parse(workflow.versions[0].spec),
        },
      };
    }),

  saveStarter: protectedProjectProcedure
    .input(
      workflowInput.extend({
        name: z.string().min(1).max(120).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "annotationQueues:CUD",
      });

      const queue = await ctx.prisma.annotationQueue.findUnique({
        where: { id: input.queueId, projectId: input.projectId },
        select: { id: true, name: true },
      });
      if (!queue) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Queue not found" });
      }

      return ctx.prisma.$transaction(async (tx) => {
        const workflow = await tx.annotationWorkflow.upsert({
          where: { queueId: input.queueId },
          create: {
            projectId: input.projectId,
            queueId: input.queueId,
            name: input.name ?? `${queue.name} workflow`,
            description: STARTER_ANNOTATION_SPEC.summary,
            createdByUserId: ctx.session.user.id,
          },
          update: {
            name: input.name ?? `${queue.name} workflow`,
            description: STARTER_ANNOTATION_SPEC.summary,
          },
        });
        const aggregate = await tx.annotationWorkflowVersion.aggregate({
          where: { workflowId: workflow.id },
          _max: { version: true },
        });
        return tx.annotationWorkflowVersion.create({
          data: {
            workflowId: workflow.id,
            version: (aggregate._max.version ?? 0) + 1,
            spec: STARTER_ANNOTATION_SPEC,
            source: "STARTER",
            createdByUserId: ctx.session.user.id,
          },
        });
      });
    }),

  saveDraft: protectedProjectProcedure
    .input(
      workflowInput.extend({
        spec: AnnotationViewSpecSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "annotationQueues:CUD",
      });

      const queue = await ctx.prisma.annotationQueue.findUnique({
        where: { id: input.queueId, projectId: input.projectId },
        select: { id: true },
      });
      if (!queue) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Queue not found" });
      }

      return ctx.prisma.$transaction(async (tx) => {
        const workflow = await tx.annotationWorkflow.upsert({
          where: { queueId: input.queueId },
          create: {
            projectId: input.projectId,
            queueId: input.queueId,
            name: input.spec.title,
            description: input.spec.summary,
            createdByUserId: ctx.session.user.id,
          },
          update: {
            name: input.spec.title,
            description: input.spec.summary,
          },
        });
        const aggregate = await tx.annotationWorkflowVersion.aggregate({
          where: { workflowId: workflow.id },
          _max: { version: true },
        });
        const version = await tx.annotationWorkflowVersion.create({
          data: {
            workflowId: workflow.id,
            version: (aggregate._max.version ?? 0) + 1,
            spec: input.spec,
            source: "MANUAL",
            createdByUserId: ctx.session.user.id,
          },
        });
        return { ...version, spec: input.spec };
      });
    }),

  generateDraft: protectedProjectProcedure
    .input(
      workflowInput.extend({
        prompt: z.string().min(10).max(4_000),
        source: z.enum(["instance", "project"]).default("project"),
        provider: z.string().min(1).optional(),
        model: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "annotationQueues:CUD",
      });
      if (input.source === "project") {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "llmApiKeys:read",
        });
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "playground:execute",
        });
      }

      if (
        env.LANGFUSE_BLOCKED_USERIDS_CHATCOMPLETION.has(ctx.session.user.id)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "AI generation is disabled for this account.",
        });
      }

      const queue = await ctx.prisma.annotationQueue.findUnique({
        where: { id: input.queueId, projectId: input.projectId },
        select: { id: true, name: true, description: true },
      });
      if (!queue) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Queue not found" });
      }

      let spec: z.infer<typeof AnnotationViewSpecSchema>;
      let generationProvider: string;
      let generationModel: string;
      try {
        const messages = [
          {
            role: ChatMessageRole.System,
            type: ChatMessageType.System,
            content:
              "You design calm, keyboard-friendly human annotation interfaces. Return only a valid AnnotationViewSpec. Use the fixed catalog exactly: layouts conversation or input_output; evidence input/output/metadata; question types single_choice, boolean, scale, text. Preserve every decision the administrator explicitly requests. Use single_choice when named options are given and include those options, boolean for yes/no decisions, scale with min and max for numeric confidence, and text only for free-form answers. Use short labels, at most 6 questions, and no URLs, code, styles, expressions, JSON paths, or custom actions.",
          },
          {
            role: ChatMessageRole.User,
            type: ChatMessageType.User,
            content: `Queue: ${queue.name}\nQueue context: ${queue.description ?? "No description"}\n\nAdministrator request:\n${input.prompt}`,
          },
        ] satisfies ChatMessage[];

        if (input.source === "instance") {
          const modelInfo = getLangfuseAIModelInfo();
          if (!modelInfo) {
            throw new Error("The instance AI model is not configured.");
          }
          generationProvider = modelInfo.provider;
          generationModel = modelInfo.modelId;
          spec = AnnotationViewSpecSchema.parse(
            await generateLangfuseAIObject({
              messages,
              schema: AnnotationViewSpecGenerationSchema,
              model: modelInfo.modelId,
              maxTokens: 4_000,
              timeout: getClientInitiatedNonStreamingLlmTimeoutMs(),
            }),
          );
        } else {
          if (!input.provider || !input.model) {
            throw new Error("Choose a project model connection.");
          }
          const storedConnection = await ctx.prisma.llmApiKeys.findFirst({
            where: { projectId: input.projectId, provider: input.provider },
          });
          if (!storedConnection) {
            throw new Error("The selected model connection no longer exists.");
          }
          const connection = LLMApiKeySchema.parse(storedConnection);
          const configuredModels = [
            ...connection.customModels,
            ...(connection.withDefaultModels
              ? supportedModels[connection.adapter]
              : []),
          ];
          if (!configuredModels.includes(input.model)) {
            throw new Error("Choose a model configured on this connection.");
          }

          generationProvider = input.provider;
          generationModel = input.model;
          const result = await generateLLMText({
            ...mapLegacyLLMCompletionParams({
              connection,
              messages,
              modelParams: {
                provider: input.provider,
                adapter: connection.adapter,
                model: input.model,
                temperature: 0.2,
              },
            }),
            output: createLLMOutput(AnnotationViewSpecSchema),
            timeout: getClientInitiatedNonStreamingLlmTimeoutMs(),
          });
          spec = AnnotationViewSpecSchema.parse(result.output);
        }
      } catch (error) {
        const llmError = getLLMErrorInfo(error);
        let message = "The model could not generate a valid workflow.";
        if (llmError) {
          message = `${input.provider ?? "Instance AI"} / ${input.model ?? getLangfuseAIModelInfo()?.modelId ?? "configured model"}: ${llmError.message}`;
        } else if (error instanceof Error) {
          message = error.message;
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message,
          cause: error,
        });
      }

      return ctx.prisma.$transaction(async (tx) => {
        const workflow = await tx.annotationWorkflow.upsert({
          where: { queueId: input.queueId },
          create: {
            projectId: input.projectId,
            queueId: input.queueId,
            name: spec.title,
            description: spec.summary,
            createdByUserId: ctx.session.user.id,
          },
          update: { name: spec.title, description: spec.summary },
        });
        const aggregate = await tx.annotationWorkflowVersion.aggregate({
          where: { workflowId: workflow.id },
          _max: { version: true },
        });
        const version = await tx.annotationWorkflowVersion.create({
          data: {
            workflowId: workflow.id,
            version: (aggregate._max.version ?? 0) + 1,
            spec,
            source: "AI",
            prompt: input.prompt,
            modelProvider: generationProvider,
            modelName: generationModel,
            createdByUserId: ctx.session.user.id,
          },
        });
        return { ...version, spec };
      });
    }),

  publish: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        workflowId: z.string(),
        versionId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "annotationQueues:CUD",
      });

      const version = await ctx.prisma.annotationWorkflowVersion.findFirst({
        where: {
          id: input.versionId,
          workflowId: input.workflowId,
          workflow: { projectId: input.projectId },
        },
        select: { id: true, spec: true },
      });
      if (!version) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Version not found",
        });
      }
      AnnotationViewSpecSchema.parse(version.spec);

      return ctx.prisma.$transaction([
        ctx.prisma.annotationWorkflowVersion.update({
          where: { id: version.id },
          data: { publishedAt: new Date() },
        }),
        ctx.prisma.annotationWorkflow.update({
          where: { id: input.workflowId, projectId: input.projectId },
          data: { status: "PUBLISHED" },
        }),
      ]);
    }),

  submit: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        queueId: z.string(),
        itemId: z.string(),
        workflowVersionId: z.string(),
        answers: AnnotationAnswersSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "annotationQueues:CUD",
      });

      const [item, version] = await Promise.all([
        ctx.prisma.annotationQueueItem.findFirst({
          where: {
            id: input.itemId,
            projectId: input.projectId,
            queueId: input.queueId,
          },
          select: { id: true },
        }),
        ctx.prisma.annotationWorkflowVersion.findFirst({
          where: {
            id: input.workflowVersionId,
            publishedAt: { not: null },
            workflow: {
              projectId: input.projectId,
              queueId: input.queueId,
            },
          },
          select: { id: true, spec: true },
        }),
      ]);
      if (!item || !version) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This task or workflow version is no longer available.",
        });
      }

      const spec = AnnotationViewSpecSchema.parse(version.spec);
      const validationErrors = validateAnswers(spec, input.answers);
      if (validationErrors.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: validationErrors[0],
        });
      }

      return ctx.prisma.$transaction(async (tx) => {
        const response = await tx.annotationResponse.upsert({
          where: {
            itemId_userId: {
              itemId: input.itemId,
              userId: ctx.session.user.id,
            },
          },
          create: {
            projectId: input.projectId,
            itemId: input.itemId,
            workflowVersionId: input.workflowVersionId,
            userId: ctx.session.user.id,
            payload: input.answers as Prisma.InputJsonValue,
          },
          update: {
            workflowVersionId: input.workflowVersionId,
            payload: input.answers as Prisma.InputJsonValue,
            submittedAt: new Date(),
          },
        });
        await tx.annotationQueueItem.update({
          where: { id: input.itemId, projectId: input.projectId },
          data: {
            status: "COMPLETED",
            annotatorUserId: ctx.session.user.id,
            completedAt: new Date(),
          },
        });
        return response;
      });
    }),

  activity: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "annotationQueues:CUD",
      });

      return ctx.prisma.annotationResponse.findMany({
        where: { projectId: input.projectId },
        orderBy: { submittedAt: "desc" },
        take: 50,
        select: {
          id: true,
          submittedAt: true,
          status: true,
          user: { select: { id: true, name: true, image: true } },
          item: {
            select: {
              id: true,
              objectType: true,
              queue: { select: { id: true, name: true } },
            },
          },
          workflowVersion: {
            select: { id: true, version: true, source: true },
          },
        },
      });
    }),
});
