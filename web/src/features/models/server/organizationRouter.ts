import { z } from "zod";
import type { Session } from "next-auth";

import {
  deleteModelDefinition,
  getModelDefinition,
  listModelDefinitions,
  testModelDefinitionMatch,
  upsertModelDefinition,
} from "@/src/features/models/server/modelDefinitionService";
import {
  TestModelMatchInputSchema,
  UpsertOrganizationModelSchema,
} from "@/src/features/models/validation";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import { paginationZod } from "@langfuse/shared";

const requireAccess = (params: {
  session: Session;
  orgId: string;
  scope: "organizationModels:read" | "organizationModels:CUD";
}) =>
  throwIfNoOrganizationAccess({
    session: params.session,
    organizationId: params.orgId,
    scope: params.scope,
  });

/** Organization model definitions and the Langfuse definitions they inherit. */
export const organizationModelRouter = createTRPCRouter({
  getById: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string(), modelId: z.string() }))
    .query(({ input, ctx }) => {
      requireAccess({
        session: ctx.session,
        orgId: input.orgId,
        scope: "organizationModels:read",
      });
      return getModelDefinition({
        owner: { type: "organization", organizationId: input.orgId },
        modelId: input.modelId,
      });
    }),

  getAll: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        searchString: z.string(),
        ...paginationZod,
      }),
    )
    .query(({ input, ctx }) => {
      requireAccess({
        session: ctx.session,
        orgId: input.orgId,
        scope: "organizationModels:read",
      });
      return listModelDefinitions({
        owner: { type: "organization", organizationId: input.orgId },
        searchString: input.searchString,
        // The table's page index starts at 0.
        page: input.page + 1,
        limit: input.limit,
      });
    }),

  upsert: protectedOrganizationProcedure
    .input(UpsertOrganizationModelSchema)
    .mutation(({ input, ctx }) => {
      const { orgId, ...modelInput } = input;
      requireAccess({
        session: ctx.session,
        orgId,
        scope: "organizationModels:CUD",
      });
      return upsertModelDefinition({
        owner: { type: "organization", organizationId: orgId },
        actor: { session: ctx.session },
        input: modelInput,
      });
    }),

  delete: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string(), modelId: z.string() }))
    .mutation(({ input, ctx }) => {
      requireAccess({
        session: ctx.session,
        orgId: input.orgId,
        scope: "organizationModels:CUD",
      });
      return deleteModelDefinition({
        owner: { type: "organization", organizationId: input.orgId },
        actor: { session: ctx.session },
        modelId: input.modelId,
      });
    }),

  testMatch: protectedOrganizationProcedure
    .input(TestModelMatchInputSchema.extend({ orgId: z.string() }))
    .query(({ input, ctx }) => {
      const { orgId, ...matchInput } = input;
      requireAccess({
        session: ctx.session,
        orgId,
        scope: "organizationModels:read",
      });
      return testModelDefinitionMatch({
        owner: { type: "organization", organizationId: orgId },
        ...matchInput,
      });
    }),
});
