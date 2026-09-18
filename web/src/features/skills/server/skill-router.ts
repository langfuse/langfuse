import { z } from "zod/v4";
import type { Session } from "next-auth";
import {
  CreateSkillVersionBodySchema,
  ListSkillsQuerySchema,
  PrepareSkillUploadsBodySchema,
  PromptLabelSchema,
  SKILL_LATEST_LABEL,
  SkillSelectorSchema,
  SkillNameSchema,
  SkillVersionWithDownloadsSchema,
  UpdateSkillLabelsBodySchema,
  UpdateSkillTagsBodySchema,
} from "@langfuse/shared";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac";
import { getSkillService } from "./index";

const projectInput = z.object({ projectId: z.string() });
const protectedLabelInput = projectInput.and(
  z.object({
    label: PromptLabelSchema.refine((label) => label !== SKILL_LATEST_LABEL, {
      message: `The '${SKILL_LATEST_LABEL}' label is managed by Langfuse`,
    }),
  }),
);

async function requireProtectedLabelAccess(params: {
  labels: string[];
  projectId: string;
  session: Session;
}) {
  const protectedLabels = await getSkillService().protectedLabels({
    projectId: params.projectId,
    labels: params.labels.filter((label) => label !== SKILL_LATEST_LABEL),
  });
  if (protectedLabels.length > 0) {
    throwIfNoProjectAccess({
      session: params.session,
      projectId: params.projectId,
      scope: "skillProtectedLabels:CUD",
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
      return getSkillService().list({ projectId: input.projectId, input });
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
      return SkillVersionWithDownloadsSchema.parse(
        await getSkillService().get({
          projectId: input.projectId,
          name: input.name,
          selector: input,
          includeDownloadUrls: true,
        }),
      );
    }),

  editorByName: protectedProjectProcedure
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
      return getSkillService().getEditor({
        projectId: input.projectId,
        name: input.name,
        selector: input,
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
      return getSkillService().prepareUploads({
        projectId: input.projectId,
        createdBy: ctx.session.user.id,
        input,
      });
    }),

  protectedLabels: protectedProjectProcedure
    .input(projectInput)
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:read",
      });
      return getSkillService().protectedLabels({
        projectId: input.projectId,
      });
    }),

  createProtectedLabel: protectedProjectProcedure
    .input(protectedLabelInput)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skillProtectedLabels:CUD",
      });
      return getSkillService().createProtectedLabel({
        projectId: input.projectId,
        label: input.label,
        auditActor: { session: ctx.session },
      });
    }),

  deleteProtectedLabel: protectedProjectProcedure
    .input(protectedLabelInput)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skillProtectedLabels:CUD",
      });
      await getSkillService().deleteProtectedLabel({
        projectId: input.projectId,
        label: input.label,
        auditActor: { session: ctx.session },
      });
      return { deleted: true };
    }),

  createVersion: protectedProjectProcedure
    .input(projectInput.and(CreateSkillVersionBodySchema))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:CUD",
      });
      await requireProtectedLabelAccess({
        labels: input.labels,
        projectId: input.projectId,
        session: ctx.session,
      });
      return getSkillService().createVersion({
        projectId: input.projectId,
        createdBy: ctx.session.user.id,
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
      const existing = await getSkillService().get({
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
      return getSkillService().setLabels({
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
      return getSkillService().setTags({
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
      const existing = await getSkillService().get({
        projectId: input.projectId,
        name: input.name,
        selector: { version: input.version },
      });
      await requireProtectedLabelAccess({
        labels: existing.labels,
        projectId: input.projectId,
        session: ctx.session,
      });
      await getSkillService().deleteVersion({
        projectId: input.projectId,
        name: input.name,
        version: input.version,
        auditActor: { session: ctx.session },
      });
      return { deleted: true };
    }),
});
