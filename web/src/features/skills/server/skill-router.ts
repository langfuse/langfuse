import { prisma } from "@langfuse/shared/src/db";
import { z } from "zod/v4";
import type { Session } from "next-auth";
import {
  CreateSkillVersionBodySchema,
  ListSkillsQuerySchema,
  PrepareSkillUploadsBodySchema,
  SKILL_LATEST_LABEL,
  SkillSelectorSchema,
  SkillNameSchema,
  UpdateSkillLabelsBodySchema,
  UpdateSkillTagsBodySchema,
} from "@langfuse/shared";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac";
import { checkHasProtectedLabels } from "@/src/features/prompts/server/utils/checkHasProtectedLabels";
import { SkillService } from "./index";

const projectInput = z.object({ projectId: z.string() });

async function requireProtectedLabelAccess(params: {
  labels: string[];
  projectId: string;
  session: Session;
}) {
  const { hasProtectedLabels, protectedLabels } = await checkHasProtectedLabels(
    {
      prisma,
      projectId: params.projectId,
      labelsToCheck: params.labels.filter(
        (label) => label !== SKILL_LATEST_LABEL,
      ),
    },
  );
  if (hasProtectedLabels) {
    throwIfNoProjectAccess({
      session: params.session,
      projectId: params.projectId,
      scope: "promptProtectedLabels:CUD",
      forbiddenErrorMessage: `You do not have permission to mutate protected skill labels: ${protectedLabels.join(", ")}`,
    });
  }
}

export const skillRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(projectInput.and(ListSkillsQuerySchema))
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

  allVersions: protectedProjectProcedure
    .input(projectInput.extend({ name: SkillNameSchema }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:read",
      });
      return ctx.prisma.skill.findMany({
        where: { projectId: input.projectId, name: input.name },
        orderBy: { version: "desc" },
        select: {
          version: true,
          labels: true,
          commitMessage: true,
          createdAt: true,
        },
      });
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
        createdBy: ctx.session.user.id,
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
        auditActor: { session: ctx.session },
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
      const existing = await new SkillService(prisma).get({
        projectId: input.projectId,
        name: input.name,
        selector: { version: input.version },
      });
      const changedLabels = [
        ...existing.labels.filter((label) => !input.labels.includes(label)),
        ...input.labels.filter((label) => !existing.labels.includes(label)),
      ];
      await requireProtectedLabelAccess({
        labels: changedLabels,
        projectId: input.projectId,
        session: ctx.session,
      });
      return new SkillService(prisma).setLabels({
        projectId: input.projectId,
        name: input.name,
        version: input.version,
        labels: input.labels,
        auditActor: { session: ctx.session },
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
        auditActor: { session: ctx.session },
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
      const existing = await new SkillService(prisma).get({
        projectId: input.projectId,
        name: input.name,
        selector: { version: input.version },
      });
      await requireProtectedLabelAccess({
        labels: existing.labels,
        projectId: input.projectId,
        session: ctx.session,
      });
      await new SkillService(prisma).deleteVersion({
        projectId: input.projectId,
        name: input.name,
        version: input.version,
        auditActor: { session: ctx.session },
      });
      return { deleted: true };
    }),
});
