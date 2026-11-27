import { createHash } from "node:crypto";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { ScoreDataTypeEnum, ScoreSourceEnum } from "@langfuse/shared";
import {
  convertDateToClickhouseDateTime,
  getTraceById,
  shouldSkipScoresDedup,
  upsertScore,
} from "@langfuse/shared/src/server";
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
import {
  notebookActionSchema,
  notebookDocumentId,
  notebookVariableValue,
  notebookVersion,
} from "../schema";
import { matchesNotebookVariable, resolveNotebookPort } from "../ports";
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
        includeSelectionDomains: true,
      });
      const { jsonl: _jsonl, ...view } = document;
      return view;
    }),

  executeAction: notebookDocument
    .input(
      z.object({
        blockId: notebookDocumentId,
        staged: z.boolean(),
        action: notebookActionSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { projectId } = input;
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId,
        scope: "scores:save",
      });
      const document = await readDocument({ ...input, respectLayout: true });
      const block = findNotebookBlock(document.blocks, input.blockId)?.block;
      if (block?.schema !== "button@1")
        throw new LangfuseNotFoundError("Notebook button not found.");
      const configuredAction = block.props.action;
      const requestedAction = input.action;
      const requestedInputs = requestedAction.inputs;
      if (
        requestedAction.type !== configuredAction.type ||
        requestedInputs.name !== configuredAction.inputs.name ||
        requestedInputs.value !== configuredAction.inputs.value
      ) {
        throw new InvalidRequestError(
          "Button action changed. Reload the notebook and try again.",
        );
      }
      const binding = document.layout.bindings?.find(
        (binding) =>
          binding.kind === "read" &&
          binding.to.documentId === document.documentId &&
          binding.to.elementId === block.id &&
          binding.to.portId === "traceId",
      );
      if (binding) {
        const variable = document.layout.variables?.find(
          ({ id }) => id === binding.variableId,
        );
        if (
          !variable ||
          variable.type !== "string" ||
          !matchesNotebookVariable(variable, requestedInputs.traceId)
        ) {
          throw new InvalidRequestError(
            "Button requires a valid trace variable.",
          );
        }
        const source = document.layout.bindings?.find(
          (candidate) =>
            candidate.kind === "write" && candidate.variableId === variable.id,
        );
        if (source?.kind === "write") {
          const sourceDocument =
            source.from.documentId === document.documentId
              ? document
              : await readDocument({
                  ...input,
                  documentId: source.from.documentId,
                  version: document.version ?? undefined,
                  staged: document.isDraft,
                  respectLayout: true,
                });
          const output = resolveNotebookPort(
            sourceDocument.blocks,
            source.from,
          );
          if (
            output?.direction !== "output" ||
            !output.choices.some(
              ({ value }) => value === requestedInputs.traceId,
            )
          ) {
            throw new InvalidRequestError("Selected trace is unavailable.");
          }
        }
      }
      const action = notebookActionSchema.safeParse({
        ...configuredAction,
        inputs: {
          ...configuredAction.inputs,
          traceId: binding
            ? requestedInputs.traceId
            : configuredAction.inputs.traceId,
        },
      });
      if (
        !action.success ||
        action.data.inputs.traceId !== requestedInputs.traceId
      ) {
        throw new InvalidRequestError(
          "Button action inputs changed or are invalid.",
        );
      }
      switch (action.data.type) {
        case "score.upsert@1": {
          if (shouldSkipScoresDedup(projectId))
            throw new InvalidRequestError(
              "Score upserts are not available in this project.",
            );
          const { traceId, name, value } = action.data.inputs;
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          const trace = await getTraceById({ projectId, traceId });
          if (!trace) throw new LangfuseNotFoundError("Trace not found.");
          const org = ctx.session.user.organizations.find(({ projects }) =>
            projects.some(({ id }) => id === projectId),
          );
          if (!org) throw new LangfuseNotFoundError("Project not found.");
          const author = ctx.session.user.id;
          const id = createHash("sha256")
            .update(
              JSON.stringify([
                "notebook-score",
                projectId,
                traceId,
                name,
                author,
              ]),
            )
            .digest("hex");
          // ClickHouse deduplicates by timestamp as well as ID. Use the trace's
          // timestamp so concurrent clicks and retries share the same key.
          const timestamp = convertDateToClickhouseDateTime(trace.timestamp);
          const updatedAt = convertDateToClickhouseDateTime(new Date());
          await upsertScore({
            id,
            project_id: projectId,
            trace_id: traceId,
            name,
            value,
            timestamp,
            created_at: updatedAt,
            updated_at: updatedAt,
            environment: trace.environment,
            source: ScoreSourceEnum.ANNOTATION,
            data_type: ScoreDataTypeEnum.NUMERIC,
            author_user_id: author,
          });
          await auditLog({
            session: { ...ctx.session, orgId: org.id, projectId },
            resourceType: "score",
            resourceId: id,
            action: "update",
            after: { traceId, name, value },
          });
          return { id };
        }
      }
    }),

  chart: notebookDocument
    .input(
      z.object({
        blockId: notebookDocumentId,
        staged: z.boolean().optional(),
        values: z
          .strictObject({
            filter: notebookVariableValue.optional(),
            timeRange: notebookVariableValue.optional(),
          })
          .optional(),
      }),
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
      for (const binding of document.layout.bindings ?? []) {
        if (
          binding.kind !== "read" ||
          binding.to.documentId !== document.documentId ||
          binding.to.elementId !== block.id
        )
          continue;
        const port = resolveNotebookPort(document.blocks, binding.to);
        const variable = document.layout.variables?.find(
          ({ id }) => id === binding.variableId,
        );
        const portId = binding.to.portId;
        const value =
          portId === "filter" || portId === "timeRange"
            ? input.values?.[portId]
            : undefined;
        if (
          !variable ||
          port?.direction !== "input" ||
          port.type !== variable.type ||
          !matchesNotebookVariable(variable, value)
        ) {
          throw new InvalidRequestError(
            "Chart requires a valid bound variable value.",
          );
        }
        const source = document.layout.bindings?.find(
          (candidate) =>
            candidate.kind === "write" && candidate.variableId === variable.id,
        );
        if (source?.kind === "write") {
          const sourceDocument =
            source.from.documentId === document.documentId
              ? document
              : await readDocument({
                  ...input,
                  documentId: source.from.documentId,
                  version: document.version ?? undefined,
                  staged: document.isDraft,
                  respectLayout: true,
                });
          const output = resolveNotebookPort(
            sourceDocument.blocks,
            source.from,
          );
          if (
            output?.direction !== "output" ||
            !output.choices.some((choice) => choice.value === value)
          ) {
            throw new InvalidRequestError("Selected value is unavailable.");
          }
        }
        if (portId === "timeRange" && value && typeof value === "object") {
          query.fromTimestamp = value.start;
          query.toTimestamp = value.end;
        }
        if (portId === "filter" && typeof value === "string") {
          query.filters = query.filters.map((filter, index) =>
            index === block.props.bindFilter && filter.type === "string"
              ? { ...filter, value }
              : filter,
          );
        }
      }
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
