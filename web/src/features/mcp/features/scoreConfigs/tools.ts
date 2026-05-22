import { v4 } from "uuid";
import { type z } from "zod";
import {
  filterAndValidateDbScoreConfigList,
  InternalServerError,
  InvalidRequestError,
  LangfuseNotFoundError,
  validateDbScoreConfig,
  validateDbScoreConfigSafe,
} from "@langfuse/shared";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import { traceException } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { isBooleanDataType } from "@/src/features/scores/lib/helpers";
import {
  GetScoreConfigQuery,
  GetScoreConfigResponse,
  GetScoreConfigsQuery,
  GetScoreConfigsResponse,
  PostScoreConfigBody,
  PostScoreConfigResponse,
  PutScoreConfigBody,
  PutScoreConfigQuery,
  PutScoreConfigResponse,
} from "@/src/features/public-api/types/score-configs";
import { defineTool } from "../../core/define-tool";
import { paginationMeta, runPublicApiTool } from "../publicApi";

const inflateConfigBody = (body: z.infer<typeof PostScoreConfigBody>) => {
  if (isBooleanDataType(body.dataType)) {
    return {
      ...body,
      categories: [
        { label: "True", value: 1 },
        { label: "False", value: 0 },
      ],
    };
  }
  return body;
};

export const [listScoreConfigsTool, handleListScoreConfigs] = defineTool({
  name: "listScoreConfigs",
  description: "List score configs in the current Langfuse project.",
  baseSchema: GetScoreConfigsQuery,
  inputSchema: GetScoreConfigsQuery,
  handler: async (input, context) =>
    runPublicApiTool({
      spanName: "mcp.score_configs.list",
      context,
      attributes: {
        "mcp.pagination_page": input.page,
        "mcp.pagination_limit": input.limit,
      },
      fn: async () => {
        const rawConfigs = await prisma.scoreConfig.findMany({
          where: { projectId: context.projectId },
          orderBy: { createdAt: "desc" },
          take: input.limit,
          skip: (input.page - 1) * input.limit,
        });

        const configs = filterAndValidateDbScoreConfigList(
          rawConfigs,
          traceException,
        );

        const totalItemsRes = await prisma.$queryRaw<{ count: bigint }[]>(
          Prisma.sql`
            SELECT COUNT(*) as count
            FROM "score_configs" AS sc
            WHERE sc.project_id = ${context.projectId}
          `,
        );
        const totalItems =
          totalItemsRes[0] !== undefined ? Number(totalItemsRes[0].count) : 0;

        return GetScoreConfigsResponse.parse({
          data: configs,
          meta: paginationMeta({
            page: input.page,
            limit: input.limit,
            totalItems,
          }),
        });
      },
    }),
  readOnlyHint: true,
});

export const [createScoreConfigTool, handleCreateScoreConfig] = defineTool({
  name: "createScoreConfig",
  description:
    "Create a score config in the current Langfuse project via the public API contract.",
  baseSchema: PostScoreConfigBody,
  inputSchema: PostScoreConfigBody,
  handler: async (input, context) =>
    runPublicApiTool({
      spanName: "mcp.score_configs.create",
      context,
      attributes: { "mcp.score_config_name": input.name },
      fn: async () => {
        const inflatedConfigInput = inflateConfigBody(input);

        const config = await prisma.scoreConfig.create({
          data: {
            ...inflatedConfigInput,
            categories: inflatedConfigInput.categories ?? undefined,
            id: v4(),
            projectId: context.projectId,
          },
        });

        await auditLog({
          action: "create",
          resourceType: "scoreConfig",
          resourceId: config.id,
          projectId: context.projectId,
          orgId: context.orgId,
          apiKeyId: context.apiKeyId,
          after: config,
        });

        return PostScoreConfigResponse.parse(validateDbScoreConfig(config));
      },
    }),
});

export const [getScoreConfigTool, handleGetScoreConfig] = defineTool({
  name: "getScoreConfig",
  description: "Get a score config by ID from the current Langfuse project.",
  baseSchema: GetScoreConfigQuery,
  inputSchema: GetScoreConfigQuery,
  handler: async (input, context) =>
    runPublicApiTool({
      spanName: "mcp.score_configs.get",
      context,
      attributes: { "mcp.score_config_id": input.configId },
      fn: async () => {
        const config = await prisma.scoreConfig.findUnique({
          where: {
            id: input.configId,
            projectId: context.projectId,
          },
        });

        if (!config) {
          throw new LangfuseNotFoundError(
            "Score config not found within authorized project",
          );
        }

        const parsedConfig = validateDbScoreConfigSafe(config);
        if (!parsedConfig.success) {
          traceException(parsedConfig.error);
          throw new InternalServerError("Requested score config is corrupted");
        }

        return GetScoreConfigResponse.parse(parsedConfig.data);
      },
    }),
  readOnlyHint: true,
});

const EMPTY_SCORE_CONFIG_UPDATE_MESSAGE =
  "Request body cannot be empty. At least one field must be provided for update.";

const scoreConfigUpdateFields = [
  "isArchived",
  "name",
  "minValue",
  "maxValue",
  "categories",
  "description",
] satisfies Array<keyof z.infer<typeof PutScoreConfigBody>>;

const UpdateScoreConfigToolBaseSchema = PutScoreConfigQuery.extend(
  PutScoreConfigBody.shape,
);

const UpdateScoreConfigToolSchema = UpdateScoreConfigToolBaseSchema.refine(
  (input) =>
    scoreConfigUpdateFields.some((field) => input[field] !== undefined),
  {
    message: EMPTY_SCORE_CONFIG_UPDATE_MESSAGE,
  },
);

export const [updateScoreConfigTool, handleUpdateScoreConfig] = defineTool({
  name: "updateScoreConfig",
  description: "Update a score config in the current Langfuse project.",
  baseSchema: UpdateScoreConfigToolBaseSchema,
  inputSchema: UpdateScoreConfigToolSchema,
  handler: async (input, context) =>
    runPublicApiTool({
      spanName: "mcp.score_configs.update",
      context,
      attributes: { "mcp.score_config_id": input.configId },
      fn: async () => {
        const { configId, ...body } = input;
        const existingConfig = await prisma.scoreConfig.findUnique({
          where: {
            id: configId,
            projectId: context.projectId,
          },
        });

        if (!existingConfig) {
          throw new LangfuseNotFoundError(
            "Score config not found within authorized project",
          );
        }

        const result = validateDbScoreConfigSafe({
          ...existingConfig,
          ...body,
        });

        if (!result.success) {
          throw new InvalidRequestError(
            result.error.issues.map((issue) => issue.message).join(", "),
          );
        }

        const updatedConfig = await prisma.scoreConfig.update({
          where: {
            id: configId,
            projectId: context.projectId,
          },
          data: body,
        });

        await auditLog({
          action: "update",
          resourceType: "scoreConfig",
          resourceId: configId,
          projectId: context.projectId,
          orgId: context.orgId,
          apiKeyId: context.apiKeyId,
          before: existingConfig,
          after: updatedConfig,
        });

        return PutScoreConfigResponse.parse(result.data);
      },
    }),
});

export const scoreConfigTools = [
  {
    definition: listScoreConfigsTool,
    handler: handleListScoreConfigs,
    allowInAppAgentKey: true,
  },
  { definition: createScoreConfigTool, handler: handleCreateScoreConfig },
  {
    definition: getScoreConfigTool,
    handler: handleGetScoreConfig,
    allowInAppAgentKey: true,
  },
  { definition: updateScoreConfigTool, handler: handleUpdateScoreConfig },
];
