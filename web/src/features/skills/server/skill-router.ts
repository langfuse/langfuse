import { prisma } from "@langfuse/shared/src/db";
import { z } from "zod/v4";
import {
  CreateSkillVersionBodySchema,
  ListSkillsQuerySchema,
  PrepareSkillUploadsBodySchema,
  SkillSelectorSchema,
  SkillNameSchema,
  UpdateSkillLabelsBodySchema,
  UpdateSkillTagsBodySchema,
  singleFilterList,
} from "@langfuse/shared";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac";
import { SkillService } from "./index";

const projectInput = z.object({ projectId: z.string() });

export const skillRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(
      projectInput
        .extend({
          filter: singleFilterList
            .refine((filters) => filters.length <= 50, "Too many filters")
            .optional(),
        })
        .and(ListSkillsQuerySchema),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:read",
      });
      return new SkillService(prisma).list({
        projectId: input.projectId,
        input,
      });
    }),

  filterOptions: protectedProjectProcedure
    .input(projectInput)
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:read",
      });
      return new SkillService(prisma).filterOptions(input);
    }),

  deleteSkill: protectedProjectProcedure
    .input(projectInput.extend({ name: SkillNameSchema }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:CUD",
      });
      await new SkillService(prisma).deleteSkill({
        ...input,
        actor: { session: ctx.session },
      });
      return { deleted: true };
    }),

  byName: protectedProjectProcedure
    .input(
      projectInput.and(
        z.object({ name: SkillNameSchema }).and(SkillSelectorSchema),
      ),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:read",
      });
      return new SkillService(prisma).get({
        projectId: input.projectId,
        name: input.name,
        selector: input,
      });
    }),

  fileDownload: protectedProjectProcedure
    .input(projectInput.extend({ fileId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:read",
      });
      return new SkillService(prisma).getFileDownload(input);
    }),

  skillVersions: protectedProjectProcedure
    .input(
      projectInput.extend({
        name: SkillNameSchema,
        limit: z.number().int().min(1).max(100).default(20),
        cursor: z.number().int().positive().nullish(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:read",
      });
      return new SkillService(prisma).skillVersions(input);
    }),

  prepareUploads: protectedProjectProcedure
    .input(projectInput.and(PrepareSkillUploadsBodySchema))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:CUD",
      });
      return new SkillService(prisma).prepareUploads({
        projectId: input.projectId,
        input,
      });
    }),

  createVersion: protectedProjectProcedure
    .input(
      projectInput
        .extend({
          target: z.discriminatedUnion("kind", [
            z.object({ kind: z.literal("new") }),
            z.object({ kind: z.literal("version"), name: SkillNameSchema }),
          ]),
        })
        .and(CreateSkillVersionBodySchema),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:CUD",
      });
      return new SkillService(prisma).createVersion({
        projectId: input.projectId,
        createdBy: ctx.session.user.id,
        target: input.target,
        input,
        actor: { session: ctx.session },
      });
    }),

  setLabels: protectedProjectProcedure
    .input(
      projectInput.and(
        z
          .object({
            name: SkillNameSchema,
            version: z.number().int().positive(),
          })
          .and(UpdateSkillLabelsBodySchema),
      ),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:CUD",
      });
      return new SkillService(prisma).setLabels({
        projectId: input.projectId,
        name: input.name,
        version: input.version,
        labels: input.labels,
        actor: { session: ctx.session },
      });
    }),

  setTags: protectedProjectProcedure
    .input(
      projectInput.and(
        z
          .object({
            name: SkillNameSchema,
            version: z.number().int().positive(),
          })
          .and(UpdateSkillTagsBodySchema),
      ),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:CUD",
      });
      return new SkillService(prisma).setTags({
        projectId: input.projectId,
        name: input.name,
        version: input.version,
        tags: input.tags,
        actor: { session: ctx.session },
      });
    }),

  deleteVersion: protectedProjectProcedure
    .input(
      projectInput.and(
        z.object({
          name: SkillNameSchema,
          version: z.number().int().positive(),
        }),
      ),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:CUD",
      });
      await new SkillService(prisma).deleteVersion({
        projectId: input.projectId,
        name: input.name,
        version: input.version,
        actor: { session: ctx.session },
      });
      return { deleted: true };
    }),
});
