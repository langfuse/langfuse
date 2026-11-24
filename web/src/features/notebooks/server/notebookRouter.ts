import { env } from "@/src/env.mjs";
import { clampToDataAccessDays } from "@/src/features/entitlements/server/hasEntitlementLimit";
import {
  hasProjectAccess,
  throwIfNoProjectAccess,
} from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProcedureWithoutTracing,
  protectedProjectProcedureWithoutTracing,
} from "@/src/server/api/trpc";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import { validateQuery } from "@langfuse/shared/query";
import { executeQuery } from "@langfuse/shared/query/server";
import { z } from "zod";
import { notebookDocumentId, notebookVersion } from "../schema";
import { findNotebookBlock } from "./fns/findNotebookBlock";
import { listNotebooks, readDocument } from "./notebookService";

const documentInput = z.object({
  projectId: z.string().min(1),
  notebookId: notebookDocumentId,
  documentId: notebookDocumentId.optional(),
  version: notebookVersion.optional(),
});

const notebookDocument = protectedProcedureWithoutTracing
  .input(documentInput)
  .use(async ({ ctx, input, next }) => {
    if (
      !hasProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "notebooks:read",
      })
    ) {
      throw new LangfuseNotFoundError("Notebook not found.");
    }
    return next();
  });

export const notebookRouter = createTRPCRouter({
  list: protectedProjectProcedureWithoutTracing
    .input(
      z.object({
        projectId: z.string(),
        search: z
          .string()
          .trim()
          .max(250)
          .refine((value) => !value.includes("\0"))
          .optional(),
        cursor: notebookDocumentId.optional(),
      }),
    )
    .query(({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "notebooks:read",
      });
      return listNotebooks(input);
    }),

  view: notebookDocument
    .input(z.object({ draftDocumentId: notebookDocumentId.optional() }))
    .query(async ({ input }) => {
      const { notebookId, documentId, version, draftDocumentId } = input;
      if (draftDocumentId && (documentId || version)) {
        throw new InvalidRequestError(
          "Choose either a draft document or a published view.",
        );
      }
      const document = await readDocument({
        notebookId,
        documentId: draftDocumentId ?? documentId,
        version,
        projectId: input.projectId,
        staged: draftDocumentId !== undefined,
        preferStaged: !documentId && !version,
        respectLayout: true,
      });
      const { jsonl: _jsonl, ...view } = document;
      return view;
    }),

  chart: notebookDocument
    .input(
      z.object({ blockId: notebookDocumentId, staged: z.boolean().optional() }),
    )
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "metrics:read",
      });
      if (env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "legacy") {
        throw new InvalidRequestError(
          "Metrics V2 is not available on this deployment.",
        );
      }
      const document = await readDocument({
        ...input,
        respectLayout: true,
        preferStaged: !input.documentId && !input.version,
      });
      const block = findNotebookBlock(document.blocks, input.blockId)?.block;
      if (block?.schema !== "chart@1")
        throw new LangfuseNotFoundError("Chart block not found.");
      const org = ctx.session.user.organizations.find((org) =>
        org.projects.some(({ id }) => id === input.projectId),
      );
      const { config, schema: _schema, ...query } = block.props.query;
      const { effectiveFromTimestamp } = clampToDataAccessDays({
        plan: org?.plan ?? null,
        fromTimestamp: query.fromTimestamp,
      });
      if (
        effectiveFromTimestamp &&
        effectiveFromTimestamp >= new Date(query.toTimestamp)
      )
        return { data: [] };
      const effectiveQuery = {
        ...query,
        fromTimestamp:
          effectiveFromTimestamp?.toISOString() ?? query.fromTimestamp,
        config,
      };
      const validation = validateQuery(effectiveQuery, "v2");
      if (!validation.valid) throw new InvalidRequestError(validation.reason);
      const chartQuery = {
        ...effectiveQuery,
        config: { ...config, row_limit: config?.row_limit ?? 100 },
      };
      const data = await executeQuery(input.projectId, chartQuery, "v2", true, {
        clickhouseSettings: { max_execution_time: 25 },
      });
      return { data };
    }),
});
