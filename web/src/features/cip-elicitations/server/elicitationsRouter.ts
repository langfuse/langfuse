// CIP fork feature (see FORK.md): Elicitations tRPC router.
//
// Authenticated procedures are project-scoped and RBAC-checked; the `public*`
// procedures back the unauthenticated fill page at /public/forms/[formId] and
// expose only published fields of open elicitations.
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  publicProcedure,
} from "@/src/server/api/trpc";
import {
  optionalPaginationZod,
  paginationZod,
  type Prisma,
} from "@langfuse/shared";
import {
  ChatMessageRole,
  ChatMessageType,
  fetchLLMCompletion,
  LLMApiKeySchema,
  logger,
  type LLMAdapter,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import {
  AnswersSchema,
  deriveStatus,
  FormFieldsSchema,
  FormSettingsSchema,
  validateAnswer,
  type FormField,
} from "../lib/contract";

const DEFAULT_NAME = "Untitled elicitation";

/** Initial draft for a new elicitation: a welcome, one question, a thank-you. */
const starterFields = (): FormField[] => [
  {
    id: "welcome",
    kind: "welcome",
    title: "Welcome",
    description: "Tell your respondents what this session is about.",
  },
  {
    id: "q1",
    kind: "short_text",
    title: "Your question",
    required: false,
  },
  {
    id: "thank_you",
    kind: "thank_you",
    title: "Thank you!",
    description: "Your responses have been recorded.",
  },
];

export const elicitationsRouter = createTRPCRouter({
  hasAny: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "elicitations:read",
      });
      const one = await ctx.prisma.elicitation.findFirst({
        where: { projectId: input.projectId },
        select: { id: true },
      });
      return one !== null;
    }),

  all: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), ...optionalPaginationZod }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "elicitations:read",
      });
      const [elicitations, totalCount] = await Promise.all([
        ctx.prisma.elicitation.findMany({
          where: { projectId: input.projectId },
          orderBy: { createdAt: "desc" },
          ...(input.limit !== undefined ? { take: input.limit } : {}),
          ...(input.page !== undefined && input.limit !== undefined
            ? { skip: input.page * input.limit }
            : {}),
          include: {
            createdByUser: { select: { name: true, email: true } },
            _count: { select: { submissions: true } },
          },
        }),
        ctx.prisma.elicitation.count({
          where: { projectId: input.projectId },
        }),
      ]);
      return {
        totalCount,
        elicitations: elicitations.map((e) => ({
          id: e.id,
          name: e.name,
          status: deriveStatus(e),
          submissionCount: e._count.submissions,
          createdAt: e.createdAt,
          createdBy: e.createdByUser?.name ?? e.createdByUser?.email ?? null,
        })),
      };
    }),

  byId: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), elicitationId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "elicitations:read",
      });
      const elicitation = await ctx.prisma.elicitation.findFirst({
        where: { id: input.elicitationId, projectId: input.projectId },
        include: {
          createdByUser: { select: { name: true, email: true } },
          _count: { select: { submissions: true } },
        },
      });
      if (!elicitation) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const draftFields = FormFieldsSchema.parse(elicitation.draftFields);
      const fields = FormFieldsSchema.parse(elicitation.fields);
      return {
        id: elicitation.id,
        name: elicitation.name,
        description: elicitation.description,
        status: deriveStatus(elicitation),
        draftFields,
        fields,
        settings: FormSettingsSchema.parse(elicitation.settings),
        version: elicitation.version,
        publishedAt: elicitation.publishedAt,
        closedAt: elicitation.closedAt,
        hasUnpublishedChanges:
          elicitation.publishedAt !== null &&
          JSON.stringify(draftFields) !== JSON.stringify(fields),
        submissionCount: elicitation._count.submissions,
        createdBy:
          elicitation.createdByUser?.name ??
          elicitation.createdByUser?.email ??
          null,
        createdAt: elicitation.createdAt,
        updatedAt: elicitation.updatedAt,
      };
    }),

  create: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1).max(200).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "elicitations:CUD",
      });
      const elicitation = await ctx.prisma.elicitation.create({
        data: {
          projectId: input.projectId,
          name: input.name ?? DEFAULT_NAME,
          draftFields: starterFields() as unknown as Prisma.InputJsonValue,
          createdByUserId: ctx.session.user.id,
        },
      });
      await auditLog({
        session: ctx.session,
        resourceType: "elicitation",
        resourceId: elicitation.id,
        action: "create",
        after: elicitation,
      });
      return { id: elicitation.id };
    }),

  updateName: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        elicitationId: z.string(),
        name: z.string().min(1).max(200),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "elicitations:CUD",
      });
      const updated = await ctx.prisma.elicitation.update({
        where: { id: input.elicitationId, projectId: input.projectId },
        data: { name: input.name },
      });
      await auditLog({
        session: ctx.session,
        resourceType: "elicitation",
        resourceId: updated.id,
        action: "update",
        after: updated,
      });
      return { name: updated.name };
    }),

  /**
   * Autosave target. Optimistic concurrency: the write only lands when the
   * caller's `version` matches the row's; a mismatch means another tab (or
   * user) saved first and the client must reload.
   */
  updateDraft: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        elicitationId: z.string(),
        draftFields: FormFieldsSchema,
        settings: FormSettingsSchema.optional(),
        version: z.number().int().nonnegative(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "elicitations:CUD",
      });
      const result = await ctx.prisma.elicitation.updateMany({
        where: {
          id: input.elicitationId,
          projectId: input.projectId,
          version: input.version,
        },
        data: {
          draftFields: input.draftFields as unknown as Prisma.InputJsonValue,
          ...(input.settings !== undefined
            ? { settings: input.settings as Prisma.InputJsonValue }
            : {}),
          version: input.version + 1,
        },
      });
      if (result.count === 0) {
        const exists = await ctx.prisma.elicitation.findFirst({
          where: { id: input.elicitationId, projectId: input.projectId },
          select: { id: true },
        });
        throw new TRPCError({
          code: exists ? "CONFLICT" : "NOT_FOUND",
          message: exists
            ? "This elicitation was changed elsewhere. Reload to continue editing."
            : "Elicitation not found.",
        });
      }
      return { version: input.version + 1 };
    }),

  /** Copies the draft into the published fields and (re)opens the form. */
  publish: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), elicitationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "elicitations:CUD",
      });
      const elicitation = await ctx.prisma.elicitation.findFirst({
        where: { id: input.elicitationId, projectId: input.projectId },
      });
      if (!elicitation) throw new TRPCError({ code: "NOT_FOUND" });
      const updated = await ctx.prisma.elicitation.update({
        where: { id: elicitation.id },
        data: {
          fields: elicitation.draftFields as Prisma.InputJsonValue,
          publishedAt: elicitation.publishedAt ?? new Date(),
          closedAt: null,
        },
      });
      await auditLog({
        session: ctx.session,
        resourceType: "elicitation",
        resourceId: updated.id,
        action: "publish",
        before: elicitation,
        after: updated,
      });
      return { status: deriveStatus(updated) };
    }),

  close: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), elicitationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "elicitations:CUD",
      });
      const updated = await ctx.prisma.elicitation.update({
        where: { id: input.elicitationId, projectId: input.projectId },
        data: { closedAt: new Date() },
      });
      await auditLog({
        session: ctx.session,
        resourceType: "elicitation",
        resourceId: updated.id,
        action: "close",
        after: updated,
      });
      return { status: deriveStatus(updated) };
    }),

  reopen: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), elicitationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "elicitations:CUD",
      });
      const elicitation = await ctx.prisma.elicitation.findFirst({
        where: { id: input.elicitationId, projectId: input.projectId },
        select: { publishedAt: true },
      });
      if (!elicitation) throw new TRPCError({ code: "NOT_FOUND" });
      if (!elicitation.publishedAt) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Publish the elicitation before reopening it.",
        });
      }
      const updated = await ctx.prisma.elicitation.update({
        where: { id: input.elicitationId, projectId: input.projectId },
        data: { closedAt: null },
      });
      await auditLog({
        session: ctx.session,
        resourceType: "elicitation",
        resourceId: updated.id,
        action: "reopen",
        after: updated,
      });
      return { status: deriveStatus(updated) };
    }),

  delete: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), elicitationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "elicitations:CUD",
      });
      const deleted = await ctx.prisma.elicitation.delete({
        where: { id: input.elicitationId, projectId: input.projectId },
      });
      await auditLog({
        session: ctx.session,
        resourceType: "elicitation",
        resourceId: deleted.id,
        action: "delete",
        before: deleted,
      });
      return { id: deleted.id };
    }),

  submissions: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        elicitationId: z.string(),
        ...paginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "elicitations:read",
      });
      const [submissions, totalCount] = await Promise.all([
        ctx.prisma.elicitationSubmission.findMany({
          where: {
            elicitationId: input.elicitationId,
            projectId: input.projectId,
          },
          orderBy: { completedAt: "desc" },
          take: input.limit,
          skip: input.page * input.limit,
        }),
        ctx.prisma.elicitationSubmission.count({
          where: {
            elicitationId: input.elicitationId,
            projectId: input.projectId,
          },
        }),
      ]);
      return {
        totalCount,
        submissions: submissions.map((s) => ({
          id: s.id,
          answers: AnswersSchema.parse(s.answers),
          startedAt: s.startedAt,
          completedAt: s.completedAt,
        })),
      };
    }),

  // -------------------------------------------------------------------------
  // Public procedures — no auth; back the /public/forms/[formId] fill page.
  // -------------------------------------------------------------------------

  publicForm: publicProcedure
    .input(z.object({ formId: z.string() }))
    .query(async ({ input, ctx }) => {
      const elicitation = await ctx.prisma.elicitation.findUnique({
        where: { id: input.formId },
      });
      if (!elicitation || !elicitation.publishedAt) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const settings = FormSettingsSchema.parse(elicitation.settings);
      const status = deriveStatus(elicitation);
      if (status === "closed") {
        return {
          id: elicitation.id,
          name: elicitation.name,
          status: "closed" as const,
          fields: [],
          settings,
        };
      }
      return {
        id: elicitation.id,
        name: elicitation.name,
        status: "open" as const,
        fields: FormFieldsSchema.parse(elicitation.fields),
        settings,
      };
    }),

  publicSubmit: publicProcedure
    .input(
      z.object({
        formId: z.string(),
        answers: AnswersSchema,
        startedAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const elicitation = await ctx.prisma.elicitation.findUnique({
        where: { id: input.formId },
      });
      if (!elicitation || !elicitation.publishedAt) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (deriveStatus(elicitation) !== "open") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "This elicitation is closed and no longer accepts responses.",
        });
      }
      const fields = FormFieldsSchema.parse(elicitation.fields);
      const byId = new Map(fields.map((f) => [f.id, f]));

      for (const answer of input.answers) {
        const field = byId.get(answer.field_id);
        if (!field) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "An answer references a question that no longer exists.",
          });
        }
        const reason = validateAnswer(field, answer.value);
        if (reason) {
          throw new TRPCError({ code: "BAD_REQUEST", message: reason });
        }
      }
      // Required questions must all be present.
      const answered = new Set(input.answers.map((a) => a.field_id));
      for (const field of fields) {
        if (field.required && !answered.has(field.id)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `"${field.title}" is required.`,
          });
        }
      }

      const submission = await ctx.prisma.elicitationSubmission.create({
        data: {
          elicitationId: elicitation.id,
          projectId: elicitation.projectId,
          answers: input.answers as unknown as Prisma.InputJsonValue,
          startedAt: input.startedAt ? new Date(input.startedAt) : null,
        },
      });
      logger.info("cip-elicitations: public submission stored", {
        elicitationId: elicitation.id,
        submissionId: submission.id,
      });
      return { id: submission.id };
    }),

  /**
   * Drives the ai_interview follow-up loop through the project's default LLM
   * connection (the same infrastructure as the playground). Returns
   * `question: null` when the interview should end — no connection configured,
   * the budget is spent, or the model judges the goal reached.
   */
  publicInterviewFollowUp: publicProcedure
    .input(
      z.object({
        formId: z.string(),
        fieldId: z.string(),
        initial: z.string().max(10_000),
        exchanges: z
          .array(
            z.object({
              question: z.string().max(2_000),
              answer: z.string().max(10_000),
            }),
          )
          .max(5),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const elicitation = await ctx.prisma.elicitation.findUnique({
        where: { id: input.formId },
      });
      if (
        !elicitation ||
        !elicitation.publishedAt ||
        deriveStatus(elicitation) !== "open"
      ) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const fields = FormFieldsSchema.parse(elicitation.fields);
      const field = fields.find(
        (f) => f.id === input.fieldId && f.kind === "ai_interview",
      );
      if (!field) throw new TRPCError({ code: "NOT_FOUND" });

      const maxFollowUps = field.properties?.max_follow_ups ?? 2;
      if (input.exchanges.length >= maxFollowUps) return { question: null };

      const defaultModel = await ctx.prisma.defaultLlmModel.findUnique({
        where: { projectId: elicitation.projectId },
        include: { LlmApiKey: true },
      });
      if (!defaultModel) return { question: null };
      const parsedKey = LLMApiKeySchema.safeParse(defaultModel.LlmApiKey);
      if (!parsedKey.success) {
        logger.error("cip-elicitations: could not parse project LLM key", {
          projectId: elicitation.projectId,
        });
        return { question: null };
      }

      const transcript = [
        `Q: ${field.title}`,
        `A: ${input.initial}`,
        ...input.exchanges.flatMap((e) => [
          `Q: ${e.question}`,
          `A: ${e.answer}`,
        ]),
      ].join("\n");

      try {
        const completion = await fetchLLMCompletion({
          streaming: false,
          llmConnection: parsedKey.data,
          modelParams: {
            provider: defaultModel.provider,
            adapter: defaultModel.adapter as LLMAdapter,
            model: defaultModel.model,
            temperature: 0.4,
            max_tokens: 200,
          },
          messages: [
            {
              role: ChatMessageRole.System,
              content: [
                "You are a considerate interviewer in a survey. Read the exchange so far and either ask ONE short, open follow-up question that deepens the respondent's answer, or decide the answer is complete.",
                field.properties?.interview_goal
                  ? `The interviewer's goal: ${field.properties.interview_goal}`
                  : "",
                'Reply with ONLY the follow-up question, or with exactly "DONE" if no follow-up is needed. Never ask about personal or identifying information.',
              ]
                .filter(Boolean)
                .join("\n"),
              type: ChatMessageType.System as const,
            },
            {
              role: ChatMessageRole.User,
              content: transcript,
              type: ChatMessageType.User as const,
            },
          ],
        });
        const text = typeof completion === "string" ? completion.trim() : "";
        if (!text || text.toUpperCase().startsWith("DONE")) {
          return { question: null };
        }
        return { question: text };
      } catch (error) {
        logger.error("cip-elicitations: interviewer completion failed", error);
        return { question: null };
      }
    }),
});
