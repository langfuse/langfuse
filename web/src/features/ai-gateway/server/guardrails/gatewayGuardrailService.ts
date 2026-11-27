import {
  preview as previewRegexRule,
  validate as validateRegexRules,
  type ValidationError,
} from "@langfuse/ai-gateway-guardrail-rules";
import {
  InvalidRequestError,
  LangfuseConflictError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import { Prisma, Role, type PrismaClient } from "@langfuse/shared/src/db";
import { MAX_TIME_SERIES_BREAKDOWN_VALUES } from "@langfuse/shared/query";
import { organizationRoleAccessRights } from "@langfuse/shared/rbac";
import {
  getGatewayGuardrailFlaggedCountsFromEvents,
  getGatewayGuardrailFlaggedTimeSeriesFromEvents,
  logger,
  type GatewayGuardrailTimeBucket,
} from "@langfuse/shared/src/server";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  GATEWAY_GUARDRAIL_DEFAULT_REDACTION_LABEL,
  GATEWAY_GUARDRAIL_FLAGGED_WINDOW_DAYS,
  GATEWAY_GUARDRAIL_LIMIT_ERROR_MESSAGE,
  GATEWAY_GUARDRAIL_MAX_BULK_DELETE,
  GATEWAY_GUARDRAIL_MAX_ORG_BYTES,
  GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION,
  GATEWAY_GUARDRAIL_MAX_RULE_BYTES,
  GATEWAY_GUARDRAIL_ORG_SIZE_LIMIT_ERROR_MESSAGE,
  GATEWAY_GUARDRAIL_PREVIEW_TEXT_MAX_LENGTH,
  GATEWAY_GUARDRAIL_RULE_SIZE_LIMIT_ERROR_MESSAGE,
  GATEWAY_GUARDRAIL_UNICODE_NOT_ALLOWED_ERROR_MESSAGE,
  GATEWAY_GUARDRAIL_UNSUPPORTED_BACKREFERENCE_ERROR_MESSAGE,
  GATEWAY_GUARDRAIL_UNSUPPORTED_LOOKAROUND_ERROR_MESSAGE,
} from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import { GatewayConfigService } from "@/src/features/ai-gateway/server/config/gatewayConfigService";
import {
  GatewayGuardrailRepository,
  type GatewayGuardrailRecord,
} from "@/src/features/ai-gateway/server/guardrails/gatewayGuardrailRepository";
import {
  bedrockRuntimeOrigin,
  decodeBedrockApiKey,
  encodeBedrockCredential,
} from "@/src/features/ai-gateway/server/provider/bedrock";
import { postExternalGuardrailTest } from "@/src/features/ai-gateway/server/guardrails/postExternalGuardrailTest";
import { validateOpenAiModerationGuardrail } from "@/src/features/ai-gateway/server/guardrails/validateOpenAiModerationGuardrail";
import type {
  GatewayCachedGuardrailScope,
  GatewayCachedGuardrails,
  GatewayResolveGuardrailAction,
} from "@/src/features/ai-gateway/server/provider/registry";
import { invalidateGatewayResolveCacheForOrganization } from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import { GATEWAY_USER_SCOPE } from "@/src/features/ai-gateway/server/team/gatewayTeamService";
import {
  compileGuardrailConfigPatterns,
  deduplicateContainsWords,
  GATEWAY_GUARDRAIL_TYPE_CAPABILITIES,
  GatewayBedrockGuardrailConfigSchema,
  GatewayGuardrailCustomRegexSchema,
  GatewayGuardrailRedactionLabelSchema,
  GatewayOpenAiModerationGuardrailConfigSchema,
  GatewayRegexGuardrailConfigSchema,
  isKnownGuardrailPreset,
  resolveSupportedGuardrailAction,
  resolveSupportedGuardrailScope,
  type GatewayBedrockGuardrailConfig,
  type GatewayGuardrailActionForType,
  type GatewayGuardrailAssignmentInput,
  type GatewayGuardrailPreset,
  type GatewayOpenAiModerationGuardrailConfig,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";
import { assertUnreachable } from "@/src/utils/types";
import type { OrgAuthedContext } from "@/src/server/api/trpc";

const RESOLVE_GUARDRAIL_ACTION = {
  BLOCK: "block",
  LOG: "log",
  REDACT: "redact",
  ENFORCE: "enforce",
} as const satisfies Record<
  GatewayGuardrailRecord["action"],
  GatewayResolveGuardrailAction
>;

const RESOLVE_GUARDRAIL_SCOPE = {
  LAST_TURN: "last_turn",
  ENTIRE_INPUT: "entire_input",
  OUTPUT: "output",
  LAST_TURN_AND_OUTPUT: "last_turn_and_output",
  ENTIRE_INPUT_AND_OUTPUT: "entire_input_and_output",
} as const satisfies Record<
  GatewayGuardrailRecord["scope"],
  GatewayCachedGuardrailScope
>;

const GATEWAY_MEMBER_ROLES = Object.values(Role).filter((role) =>
  organizationRoleAccessRights[role].includes(GATEWAY_USER_SCOPE),
);

const DAY_MS = 24 * 60 * 60 * 1000;
const DUPLICATE_NAME_MESSAGE = "A guardrail with this name already exists";

type ExternalGuardrailType = Exclude<GatewayGuardrailRecord["type"], "REGEX">;

export type GatewayGuardrailDeleteTarget =
  | { type: "ids"; ids: string[] }
  | { type: "matching"; searchQuery?: string };

export type GatewayGuardrailTimeSeriesSelection =
  | { type: "ids"; ids: string[] }
  | { type: "matching"; searchQuery?: string };

export class GatewayGuardrailService {
  private readonly repository: GatewayGuardrailRepository;
  private readonly configService: GatewayConfigService;

  constructor(private readonly prisma: PrismaClient) {
    this.repository = new GatewayGuardrailRepository(prisma);
    this.configService = new GatewayConfigService(prisma);
  }

  /** The guardrails the gateway checks for a key, in the resolve cache's shape. */
  async resolveForKey(params: {
    organizationId: string;
    apiKeyId: string;
    userId: string | null;
  }): Promise<GatewayCachedGuardrails> {
    const guardrails = await this.repository.findAssigned(params);
    return guardrails.flatMap<GatewayCachedGuardrails[number]>((guardrail) => {
      const supportedAction = resolveSupportedGuardrailAction(
        guardrail.type,
        guardrail.action,
      );
      const action = RESOLVE_GUARDRAIL_ACTION[supportedAction];
      const scope =
        RESOLVE_GUARDRAIL_SCOPE[
          resolveSupportedGuardrailScope(
            supportedAction,
            guardrail.scope ?? "LAST_TURN",
          )
        ];
      const failClosed = () => {
        logger.error(
          "External gateway guardrail has invalid config or missing credential; failing closed",
          {
            guardrailId: guardrail.id,
            guardrailType: guardrail.type,
            organizationId: params.organizationId,
          },
        );
        return [
          {
            id: guardrail.id,
            name: guardrail.name,
            type: "fail_closed" as const,
            action,
            scope,
            patterns: [] as [],
          },
        ];
      };
      switch (guardrail.type) {
        case "REGEX": {
          const config = GatewayRegexGuardrailConfigSchema.safeParse(
            guardrail.config,
          );
          const patterns = config.success
            ? compileGuardrailConfigPatterns(config.data)
            : [];
          // A guardrail with nothing to match is skipped rather than failing every request of the key.
          if (patterns.length === 0) {
            logger.error("Skipping gateway guardrail without known rules", {
              guardrailId: guardrail.id,
              organizationId: params.organizationId,
            });
            return [];
          }
          return [
            {
              id: guardrail.id,
              name: guardrail.name,
              type: "regex" as const,
              action,
              scope,
              patterns,
              ...(action === "redact"
                ? {
                    redaction_label:
                      guardrail.redactionLabel ||
                      GATEWAY_GUARDRAIL_DEFAULT_REDACTION_LABEL,
                  }
                : {}),
            },
          ];
        }
        case "BEDROCK": {
          const config = GatewayBedrockGuardrailConfigSchema.safeParse(
            guardrail.config,
          );
          if (!config.success || !guardrail.encryptedCredential) {
            return failClosed();
          }
          return [
            {
              id: guardrail.id,
              name: guardrail.name,
              type: "bedrock" as const,
              action,
              scope,
              guardrail_id: config.data.guardrailId,
              guardrail_version: config.data.guardrailVersion,
              region: config.data.region,
              encrypted_credential: guardrail.encryptedCredential,
            },
          ];
        }
        case "OPENAI_MODERATION": {
          const config = GatewayOpenAiModerationGuardrailConfigSchema.safeParse(
            guardrail.config,
          );
          if (!config.success || !guardrail.encryptedCredential) {
            return failClosed();
          }
          return [
            {
              id: guardrail.id,
              name: guardrail.name,
              type: "openai_moderation" as const,
              action,
              scope,
              region: config.data.region,
              encrypted_credential: guardrail.encryptedCredential,
            },
          ];
        }
        default:
          return assertUnreachable(guardrail.type);
      }
    });
  }

  async list(params: {
    organizationId: string;
    searchQuery?: string;
    page: number;
    limit: number;
    /** Only gateway managers see other members' names/emails and other users' key names. */
    viewer: { canManageGateway: boolean; userId: string };
  }) {
    const { rows, totalCount, organizationCount } =
      await this.repository.listPage(params);
    const recordingProjectId =
      rows.length > 0
        ? await this.configService.getRecordingProjectId(params.organizationId)
        : null;
    const flaggedCounts = recordingProjectId
      ? await this.readFlaggedCounts7d(
          recordingProjectId,
          params.organizationId,
          rows.map(({ id }) => id),
        )
      : null;

    return {
      totalCount,
      organizationCount,
      rows: rows.map((row) =>
        toGuardrailDto(row, flaggedCounts, params.viewer),
      ),
    };
  }

  listMatching(params: { organizationId: string; searchQuery?: string }) {
    return this.repository.listMatching(params);
  }

  /**
   * Time-series counts of flagged gateway requests. Breaks down one series per
   * guardrail when 1..MAX_TIME_SERIES_BREAKDOWN_VALUES guardrails are selected,
   * and aggregates to a single combined series otherwise.
   */
  async getFlaggedTimeSeries(params: {
    organizationId: string;
    fromTimestamp: Date;
    toTimestamp: Date;
    granularity: GatewayGuardrailTimeBucket;
    selection?: GatewayGuardrailTimeSeriesSelection;
  }) {
    const recordingProjectId = await this.configService.getRecordingProjectId(
      params.organizationId,
    );
    if (!recordingProjectId) {
      throw new InvalidRequestError("Gateway requests are not recorded");
    }

    const guardrailIds = await this.resolveTimeSeriesGuardrailIds(
      params.organizationId,
      params.selection,
    );
    const groupByGuardrail =
      guardrailIds !== undefined &&
      guardrailIds.length > 0 &&
      guardrailIds.length <= MAX_TIME_SERIES_BREAKDOWN_VALUES;

    const points = await getGatewayGuardrailFlaggedTimeSeriesFromEvents({
      projectId: recordingProjectId,
      fromTimestamp: params.fromTimestamp,
      toTimestamp: params.toTimestamp,
      granularity: params.granularity,
      guardrailIds,
      groupByGuardrail,
    });

    return { groupByGuardrail, points };
  }

  private async resolveTimeSeriesGuardrailIds(
    organizationId: string,
    selection: GatewayGuardrailTimeSeriesSelection | undefined,
  ): Promise<string[] | undefined> {
    if (!selection) return undefined;
    if (selection.type === "ids") return [...new Set(selection.ids)];
    const matching = await this.repository.listMatching({
      organizationId,
      searchQuery: selection.searchQuery,
    });
    return matching.map(({ id }) => id);
  }

  searchTargets(params: {
    organizationId: string;
    searchQuery?: string;
    limit: number;
  }) {
    return this.repository.searchTargets({
      organizationId: params.organizationId,
      memberRoles: GATEWAY_MEMBER_ROLES,
      searchQuery: params.searchQuery,
      limit: params.limit,
    });
  }

  async test(
    params: {
      organizationId: string;
      id?: string;
    } & (
      | {
          type: "BEDROCK";
          bedrock: GatewayBedrockGuardrailConfig & { apiKey?: string };
        }
      | {
          type: "OPENAI_MODERATION";
          openAiModeration: GatewayOpenAiModerationGuardrailConfig & {
            apiKey?: string;
          };
        }
    ),
  ) {
    if (params.type === "OPENAI_MODERATION") {
      const config = GatewayOpenAiModerationGuardrailConfigSchema.parse({
        region: params.openAiModeration.region,
      });
      const apiKey =
        params.openAiModeration.apiKey || (await this.readStoredApiKey(params));
      await validateOpenAiModerationGuardrail({ ...config, apiKey });
      return { success: true as const };
    }
    const config = GatewayBedrockGuardrailConfigSchema.parse({
      guardrailId: params.bedrock.guardrailId,
      guardrailVersion: params.bedrock.guardrailVersion,
      region: params.bedrock.region,
    });
    const apiKey =
      params.bedrock.apiKey || (await this.readStoredApiKey(params));
    await validateBedrockGuardrail({ ...config, apiKey });
    return { success: true as const };
  }

  previewRegex(params: { pattern: string; text: string }) {
    const parsed = GatewayGuardrailCustomRegexSchema.safeParse(params.pattern);
    if (!parsed.success) {
      return {
        valid: false,
        error:
          parsed.error.issues[0]?.message ?? "Enter a valid regular expression",
        errorCode: undefined,
        matches: [],
        truncated: false,
      };
    }
    const result = previewRegexRule(
      parsed.data,
      params.text.slice(0, GATEWAY_GUARDRAIL_PREVIEW_TEXT_MAX_LENGTH),
      GATEWAY_GUARDRAIL_MAX_RULE_BYTES,
    );
    if (!result.valid) {
      return {
        valid: false,
        error: result.error
          ? formatRegexValidationError(result.error)
          : "Enter a valid regular expression.",
        errorCode: result.error?.code,
        matches: [],
        truncated: false,
      };
    }
    return {
      valid: true,
      errorCode: undefined,
      matches: result.matches,
      truncated: result.truncated,
    };
  }

  async create(
    params: {
      organizationId: string;
      name: string;
      scope?: GatewayGuardrailRecord["scope"];
      assignments: GatewayGuardrailAssignmentInput[];
      session: OrgAuthedContext["session"];
    } & (
      | {
          type: "REGEX";
          action: GatewayGuardrailActionForType<"REGEX">;
          redactionLabel?: string;
          presets: GatewayGuardrailPreset[];
          secretPrefixes?: string[];
          containsWords?: string[];
          customRegex?: string;
        }
      | {
          type: "BEDROCK";
          action: GatewayGuardrailActionForType<"BEDROCK">;
          bedrock: GatewayBedrockGuardrailConfig & { apiKey: string };
        }
      | {
          type: "OPENAI_MODERATION";
          action: GatewayGuardrailActionForType<"OPENAI_MODERATION">;
          openAiModeration: GatewayOpenAiModerationGuardrailConfig & {
            apiKey: string;
          };
        }
    ),
  ) {
    const redactionLabel = normalizeRedactionLabel(
      params.type,
      params.action,
      params.type === "REGEX" ? params.redactionLabel : undefined,
    );
    let config: Prisma.InputJsonValue;
    let encryptedCredential: string | null = null;
    let compiledPatterns: string[] | null = null;
    if (params.type === "BEDROCK") {
      const bedrockConfig = GatewayBedrockGuardrailConfigSchema.parse({
        guardrailId: params.bedrock.guardrailId,
        guardrailVersion: params.bedrock.guardrailVersion,
        region: params.bedrock.region,
      });
      await validateBedrockGuardrail({
        ...bedrockConfig,
        apiKey: params.bedrock.apiKey,
      });
      config = bedrockConfig;
      encryptedCredential = encrypt(
        encodeBedrockCredential(params.bedrock.apiKey),
      );
    } else if (params.type === "OPENAI_MODERATION") {
      const moderationConfig =
        GatewayOpenAiModerationGuardrailConfigSchema.parse({
          region: params.openAiModeration.region,
        });
      await validateOpenAiModerationGuardrail({
        ...moderationConfig,
        apiKey: params.openAiModeration.apiKey,
      });
      config = moderationConfig;
      encryptedCredential = encrypt(params.openAiModeration.apiKey);
    } else {
      const regexConfig = normalizeGuardrailConfig({
        presets: params.presets,
        secretPrefixes: params.secretPrefixes ?? [],
        containsWords: params.containsWords ?? [],
        customRegex: params.customRegex,
      });
      compiledPatterns = validateGuardrailPatterns(regexConfig);
      config = regexConfig;
    }

    const assignments = await this.normalizeAndValidateAssignments(
      params.organizationId,
      params.assignments,
    );

    const created = await this.writeGuardrail(async (tx) => {
      const repo = new GatewayGuardrailRepository(tx);
      const existingCount = await repo.countByOrganization(
        params.organizationId,
      );
      if (existingCount >= GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION) {
        throw new InvalidRequestError(GATEWAY_GUARDRAIL_LIMIT_ERROR_MESSAGE);
      }
      if (compiledPatterns !== null) {
        await assertOrgSizeLimit(repo, params.organizationId, compiledPatterns);
      }
      const record = await repo.create({
        organizationId: params.organizationId,
        name: params.name,
        type: params.type,
        action: params.action,
        scope: resolveSupportedGuardrailScope(
          params.action,
          params.scope ?? "LAST_TURN",
        ),
        redactionLabel,
        config,
        encryptedCredential,
        assignments,
        createdBy: params.session.user.id,
      });
      await audit(tx, {
        session: params.session,
        action: "create",
        after: record,
      });
      return record;
    });

    await invalidateGatewayResolveCacheForOrganization(params.organizationId);
    return toGuardrailDto(created, null, {
      canManageGateway: true,
      userId: params.session.user.id,
    });
  }

  async update(
    params: {
      organizationId: string;
      id: string;
      name: string;
      scope?: GatewayGuardrailRecord["scope"];
      assignments: GatewayGuardrailAssignmentInput[];
      session: OrgAuthedContext["session"];
    } & (
      | {
          type: "REGEX";
          action: GatewayGuardrailActionForType<"REGEX">;
          redactionLabel?: string;
          presets: GatewayGuardrailPreset[];
          secretPrefixes?: string[];
          containsWords?: string[];
          customRegex?: string;
        }
      | {
          type: "BEDROCK";
          action: GatewayGuardrailActionForType<"BEDROCK">;
          bedrock: GatewayBedrockGuardrailConfig & { apiKey?: string };
        }
      | {
          type: "OPENAI_MODERATION";
          action: GatewayGuardrailActionForType<"OPENAI_MODERATION">;
          openAiModeration: GatewayOpenAiModerationGuardrailConfig & {
            apiKey?: string;
          };
        }
    ),
  ) {
    const redactionLabel = normalizeRedactionLabel(
      params.type,
      params.action,
      params.type === "REGEX" ? params.redactionLabel : undefined,
    );
    if (params.type === "BEDROCK") {
      const existingCredential = await this.findExternalCredential(params);
      const nextConfig = GatewayBedrockGuardrailConfigSchema.parse({
        guardrailId: params.bedrock.guardrailId,
        guardrailVersion: params.bedrock.guardrailVersion,
        region: params.bedrock.region,
      });
      const existingConfig = GatewayBedrockGuardrailConfigSchema.safeParse(
        existingCredential.config,
      );
      const isBedrockConfigChanged =
        params.bedrock.apiKey !== undefined ||
        !existingConfig.success ||
        existingConfig.data.guardrailId !== nextConfig.guardrailId ||
        existingConfig.data.guardrailVersion !== nextConfig.guardrailVersion ||
        existingConfig.data.region !== nextConfig.region;
      if (isBedrockConfigChanged) {
        const apiKey =
          params.bedrock.apiKey ??
          decryptStoredApiKey(
            "BEDROCK",
            existingCredential.encryptedCredential,
          );
        await validateBedrockGuardrail({ ...nextConfig, apiKey });
      }
    }
    if (params.type === "OPENAI_MODERATION") {
      const nextConfig = GatewayOpenAiModerationGuardrailConfigSchema.parse({
        region: params.openAiModeration.region,
      });
      const existing = await this.findExternalCredential(params);
      const existingConfig =
        GatewayOpenAiModerationGuardrailConfigSchema.safeParse(existing.config);
      if (
        params.openAiModeration.apiKey !== undefined ||
        !existingConfig.success ||
        existingConfig.data.region !== nextConfig.region
      ) {
        await validateOpenAiModerationGuardrail({
          ...nextConfig,
          apiKey:
            params.openAiModeration.apiKey ??
            decryptStoredApiKey(
              "OPENAI_MODERATION",
              existing.encryptedCredential,
            ),
        });
      }
    }

    const updated = await this.writeGuardrail(async (tx) => {
      const repo = new GatewayGuardrailRepository(tx);
      const existing = await repo.findById({
        organizationId: params.organizationId,
        id: params.id,
      });
      if (!existing) throw new LangfuseNotFoundError("Guardrail not found");
      if (existing.type !== params.type) {
        throw new InvalidRequestError("Guardrail type cannot be changed");
      }

      const existingApiKeyIds = new Set(
        existing.assignments.flatMap((assignment) =>
          assignment.apiKeyId ? [assignment.apiKeyId] : [],
        ),
      );
      const existingUserIds = new Set(
        existing.assignments.flatMap((assignment) =>
          assignment.userId ? [assignment.userId] : [],
        ),
      );
      const assignments = await this.normalizeAndValidateAssignments(
        params.organizationId,
        params.assignments,
        { existingApiKeyIds, existingUserIds, repository: repo },
      );

      let config: Prisma.InputJsonValue;
      let encryptedCredential: string | undefined;
      if (params.type === "BEDROCK") {
        config = GatewayBedrockGuardrailConfigSchema.parse({
          guardrailId: params.bedrock.guardrailId,
          guardrailVersion: params.bedrock.guardrailVersion,
          region: params.bedrock.region,
        });
        if (params.bedrock.apiKey !== undefined) {
          encryptedCredential = encrypt(
            encodeBedrockCredential(params.bedrock.apiKey),
          );
        }
      } else if (params.type === "OPENAI_MODERATION") {
        config = GatewayOpenAiModerationGuardrailConfigSchema.parse({
          region: params.openAiModeration.region,
        });
        if (params.openAiModeration.apiKey !== undefined) {
          encryptedCredential = encrypt(params.openAiModeration.apiKey);
        }
      } else {
        // Preserve stored preset IDs unknown to this build (e.g. from a newer pod during rollout).
        const existingConfig = GatewayRegexGuardrailConfigSchema.safeParse(
          existing.config,
        );
        const preservedUnknownPresets = existingConfig.success
          ? existingConfig.data.presets.filter(
              (preset) => !isKnownGuardrailPreset(preset),
            )
          : [];
        const regexConfig = normalizeGuardrailConfig({
          presets: [...params.presets, ...preservedUnknownPresets],
          secretPrefixes: params.secretPrefixes ?? [],
          containsWords: params.containsWords ?? [],
          customRegex: params.customRegex,
        });
        const ruleConfigChanged =
          !existingConfig.success ||
          !isSameRegexRuleConfig(existingConfig.data, regexConfig);
        if (ruleConfigChanged) {
          const compiledPatterns = validateGuardrailPatterns(regexConfig);
          await assertOrgSizeLimit(
            repo,
            params.organizationId,
            compiledPatterns,
            existing.id,
          );
        }
        config = regexConfig;
      }

      const record = await repo.update({
        organizationId: params.organizationId,
        id: existing.id,
        name: params.name,
        action: params.action,
        scope: resolveSupportedGuardrailScope(
          params.action,
          params.scope ?? existing.scope,
        ),
        redactionLabel,
        config,
        encryptedCredential,
        assignments,
      });
      await audit(tx, {
        session: params.session,
        action: "update",
        before: existing,
        after: record,
      });
      return record;
    });

    await invalidateGatewayResolveCacheForOrganization(params.organizationId);
    return toGuardrailDto(updated, null, {
      canManageGateway: true,
      userId: params.session.user.id,
    });
  }

  async deleteMany(params: {
    organizationId: string;
    target: GatewayGuardrailDeleteTarget;
    session: OrgAuthedContext["session"];
  }) {
    const ids = await this.resolveBulkTargetIds(
      params.organizationId,
      params.target,
      "deleted",
    );
    if (ids.length === 0) return { deletedCount: 0 };

    const existing = await this.repository.findByIds({
      organizationId: params.organizationId,
      ids,
    });
    if (existing.length === 0) return { deletedCount: 0 };

    await this.prisma.$transaction(async (tx) => {
      await new GatewayGuardrailRepository(tx).deleteMany({
        organizationId: params.organizationId,
        ids: existing.map(({ id }) => id),
      });
      for (const record of existing) {
        await audit(tx, {
          session: params.session,
          action: "delete",
          before: record,
        });
      }
    });

    await invalidateGatewayResolveCacheForOrganization(params.organizationId);
    return { deletedCount: existing.length };
  }

  async setAssignmentsForMany(params: {
    organizationId: string;
    target: GatewayGuardrailDeleteTarget;
    assignments: GatewayGuardrailAssignmentInput[];
    session: OrgAuthedContext["session"];
  }) {
    const ids = await this.resolveBulkTargetIds(
      params.organizationId,
      params.target,
      "updated",
    );
    if (ids.length === 0) return { updatedCount: 0 };

    const assignments = await this.normalizeAndValidateAssignments(
      params.organizationId,
      params.assignments,
    );

    const updatedCount = await this.prisma.$transaction(async (tx) => {
      const repo = new GatewayGuardrailRepository(tx);
      const beforeRows = await repo.findByIds({
        organizationId: params.organizationId,
        ids,
      });
      if (beforeRows.length === 0) return 0;

      const existingIds = beforeRows.map(({ id }) => id);
      const beforeById = new Map(beforeRows.map((row) => [row.id, row]));
      const afterRows = await repo.replaceAssignmentsForIds({
        organizationId: params.organizationId,
        ids: existingIds,
        assignments,
      });

      for (const after of afterRows) {
        await audit(tx, {
          session: params.session,
          action: "update",
          before: beforeById.get(after.id),
          after,
        });
      }
      return afterRows.length;
    });

    if (updatedCount > 0) {
      await invalidateGatewayResolveCacheForOrganization(params.organizationId);
    }
    return { updatedCount };
  }

  private async findExternalCredential(params: {
    organizationId: string;
    id: string;
    type: ExternalGuardrailType;
  }) {
    const existing = await this.repository.findCredentialById({
      organizationId: params.organizationId,
      id: params.id,
    });
    if (!existing) throw new LangfuseNotFoundError("Guardrail not found");
    if (existing.type !== params.type) {
      throw new InvalidRequestError("Guardrail type cannot be changed");
    }
    return existing;
  }

  private async readStoredApiKey(params: {
    organizationId: string;
    id?: string;
    type: ExternalGuardrailType;
  }): Promise<string> {
    if (!params.id) throw new InvalidRequestError("Enter an API key");
    const existing = await this.findExternalCredential({
      ...params,
      id: params.id,
    });
    return decryptStoredApiKey(params.type, existing.encryptedCredential);
  }

  private async resolveBulkTargetIds(
    organizationId: string,
    target: GatewayGuardrailDeleteTarget,
    actionVerb: "deleted" | "updated",
  ) {
    const ids =
      target.type === "ids"
        ? [...new Set(target.ids)]
        : (
            await this.repository.listMatching({
              organizationId,
              searchQuery: target.searchQuery,
            })
          ).map(({ id }) => id);

    if (ids.length > GATEWAY_GUARDRAIL_MAX_BULK_DELETE) {
      throw new InvalidRequestError(
        `At most ${GATEWAY_GUARDRAIL_MAX_BULK_DELETE} guardrails can be ${actionVerb} at once. Narrow the search filter.`,
      );
    }
    return ids;
  }

  private async normalizeAndValidateAssignments(
    organizationId: string,
    assignments: GatewayGuardrailAssignmentInput[],
    existing?: {
      existingApiKeyIds: ReadonlySet<string>;
      existingUserIds: ReadonlySet<string>;
      repository?: GatewayGuardrailRepository;
    },
  ): Promise<GatewayGuardrailAssignmentInput[]> {
    const deduped = deduplicateAssignments(assignments);
    if (deduped.length === 0) {
      throw new InvalidRequestError("Select who this guardrail applies to");
    }
    const hasOrgScope = deduped.some(
      (assignment) => assignment.scope === "ORGANIZATION",
    );
    if (hasOrgScope && deduped.length > 1) {
      throw new InvalidRequestError(
        "Everyone cannot be combined with specific users or API keys",
      );
    }
    if (hasOrgScope) return [{ scope: "ORGANIZATION" }];

    // Only validate targets being newly added; existing assignments stay editable even if a member was removed.
    const apiKeyIds = deduped.flatMap((assignment) =>
      assignment.scope === "API_KEY" &&
      !existing?.existingApiKeyIds.has(assignment.apiKeyId)
        ? [assignment.apiKeyId]
        : [],
    );
    const userIds = deduped.flatMap((assignment) =>
      assignment.scope === "USER" &&
      !existing?.existingUserIds.has(assignment.userId)
        ? [assignment.userId]
        : [],
    );
    if (apiKeyIds.length === 0 && userIds.length === 0) {
      return deduped;
    }
    const repo = existing?.repository ?? this.repository;
    const valid = await repo.findValidTargetIds({
      organizationId,
      apiKeyIds,
      userIds,
    });
    if (apiKeyIds.some((id) => !valid.apiKeyIds.has(id))) {
      throw new LangfuseNotFoundError("Selected gateway key not found");
    }
    if (userIds.some((id) => !valid.userIds.has(id))) {
      throw new LangfuseNotFoundError("Selected organization member not found");
    }
    return deduped;
  }

  private async writeGuardrail<T>(
    run: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(run);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new LangfuseConflictError(DUPLICATE_NAME_MESSAGE);
      }
      throw error;
    }
  }

  private async readFlaggedCounts7d(
    projectId: string,
    organizationId: string,
    guardrailIds: string[],
  ): Promise<Map<string, number> | null> {
    const since = new Date(
      Date.now() - GATEWAY_GUARDRAIL_FLAGGED_WINDOW_DAYS * DAY_MS,
    );
    try {
      const counts = await getGatewayGuardrailFlaggedCountsFromEvents({
        projectId,
        guardrailIds,
        since,
      });
      return new Map(
        counts.map(({ guardrailId, count }) => [guardrailId, count]),
      );
    } catch (error) {
      logger.warn("Failed to read 7-day gateway guardrail flagged counts", {
        organizationId,
        error,
      });
      return null;
    }
  }
}

function decryptStoredApiKey(
  type: ExternalGuardrailType,
  encryptedCredential: string | null,
): string {
  if (!encryptedCredential) {
    throw new InvalidRequestError("Enter an API key");
  }
  const credential = decrypt(encryptedCredential);
  return type === "BEDROCK" ? decodeBedrockApiKey(credential) : credential;
}

async function validateBedrockGuardrail(
  params: GatewayBedrockGuardrailConfig & { apiKey: string },
) {
  const origin = bedrockRuntimeOrigin({ region: params.region });
  await postExternalGuardrailTest({
    url: `${origin}/guardrail/${encodeURIComponent(params.guardrailId)}/version/${encodeURIComponent(params.guardrailVersion)}/apply`,
    apiKey: params.apiKey,
    body: { source: "INPUT", content: [{ text: { text: "Hello" } }] },
    providerName: "Amazon Bedrock",
    unreachableMessage:
      "Could not reach Amazon Bedrock in the selected region.",
    isExpectedResponse: (json) => {
      const action = (json as { action?: unknown } | null)?.action;
      return action === "NONE" || action === "GUARDRAIL_INTERVENED";
    },
  });
}

function deduplicateAssignments(
  assignments: GatewayGuardrailAssignmentInput[],
): GatewayGuardrailAssignmentInput[] {
  const seen = new Set<string>();
  const result: GatewayGuardrailAssignmentInput[] = [];
  for (const assignment of assignments) {
    const key = assignmentKey(assignment);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(assignment);
  }
  return result;
}

function assignmentKey(assignment: GatewayGuardrailAssignmentInput): string {
  switch (assignment.scope) {
    case "ORGANIZATION":
      return "ORGANIZATION";
    case "API_KEY":
      return `API_KEY:${assignment.apiKeyId}`;
    case "USER":
      return `USER:${assignment.userId}`;
  }
}

function normalizeGuardrailConfig(input: {
  presets: string[];
  secretPrefixes: string[];
  containsWords: string[];
  customRegex?: string;
}) {
  const presets = [...new Set(input.presets)];
  const secretPrefixes = [...new Set(input.secretPrefixes)];
  const containsWords = deduplicateContainsWords(input.containsWords);
  let customRegex: string | undefined;
  if (input.customRegex !== undefined && input.customRegex.length > 0) {
    const parsed = GatewayGuardrailCustomRegexSchema.safeParse(
      input.customRegex,
    );
    if (!parsed.success) {
      throw new InvalidRequestError(
        parsed.error.issues[0]?.message ?? "Enter a valid regular expression",
      );
    }
    customRegex = parsed.data;
  }
  if (
    presets.length === 0 &&
    secretPrefixes.length === 0 &&
    containsWords.length === 0 &&
    customRegex === undefined
  ) {
    throw new InvalidRequestError(
      "Configure at least one pattern, prefix, keyword, or custom regex to detect",
    );
  }
  return {
    presets,
    ...(secretPrefixes.length > 0 ? { secretPrefixes } : {}),
    ...(containsWords.length > 0 ? { containsWords } : {}),
    ...(customRegex !== undefined ? { customRegex } : {}),
  };
}

function isSameStringSet(a: readonly string[], b: readonly string[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false;
  for (const value of setA) {
    if (!setB.has(value)) return false;
  }
  return true;
}

function isSameRegexRuleConfig(
  existing: {
    presets: readonly string[];
    secretPrefixes: readonly string[];
    containsWords: readonly string[];
    customRegex?: string;
  },
  next: {
    presets: readonly string[];
    secretPrefixes?: readonly string[];
    containsWords?: readonly string[];
    customRegex?: string;
  },
): boolean {
  return (
    isSameStringSet(existing.presets, next.presets) &&
    isSameStringSet(existing.secretPrefixes, next.secretPrefixes ?? []) &&
    isSameStringSet(
      existing.containsWords.map((word) => word.toLowerCase()),
      (next.containsWords ?? []).map((word) => word.toLowerCase()),
    ) &&
    (existing.customRegex ?? undefined) === (next.customRegex ?? undefined)
  );
}

function formatRegexValidationError(error: ValidationError): string {
  switch (error.code) {
    case "empty_pattern":
      return "Enter a regular expression.";
    case "matches_empty_string":
      return "Pattern cannot match empty text (for example `x?` or `\\d*`). Require at least one character.";
    case "unicode_not_allowed":
      return GATEWAY_GUARDRAIL_UNICODE_NOT_ALLOWED_ERROR_MESSAGE;
    case "unsupported_lookaround":
      return GATEWAY_GUARDRAIL_UNSUPPORTED_LOOKAROUND_ERROR_MESSAGE;
    case "unsupported_backreference":
      return GATEWAY_GUARDRAIL_UNSUPPORTED_BACKREFERENCE_ERROR_MESSAGE;
    case "size_limit_exceeded":
      return GATEWAY_GUARDRAIL_RULE_SIZE_LIMIT_ERROR_MESSAGE;
    case "syntax_error":
      return `Invalid regular expression: ${error.message}`;
    default:
      return assertUnreachable(error.code);
  }
}

function validateGuardrailPatterns(config: {
  presets: string[];
  secretPrefixes?: string[];
  containsWords?: string[];
  customRegex?: string;
}): string[] {
  const patterns = compileGuardrailConfigPatterns(config);
  const report = validateRegexRules(patterns, GATEWAY_GUARDRAIL_MAX_RULE_BYTES);
  if (!report.ok) {
    const error =
      report.rules.find((rule) => rule.error)?.error ?? report.set_error;
    throw new InvalidRequestError(
      error
        ? formatRegexValidationError(error)
        : GATEWAY_GUARDRAIL_RULE_SIZE_LIMIT_ERROR_MESSAGE,
    );
  }
  return patterns;
}

async function assertOrgSizeLimit(
  repo: GatewayGuardrailRepository,
  organizationId: string,
  newPatterns: string[],
  excludeId?: string,
) {
  const existing = await repo.listConfigsByOrganization({
    organizationId,
    excludeId,
  });
  const existingPatterns: string[] = [];
  for (const row of existing) {
    const parsed = GatewayRegexGuardrailConfigSchema.safeParse(row.config);
    if (!parsed.success) continue;
    existingPatterns.push(...compileGuardrailConfigPatterns(parsed.data));
  }

  // Drop uncompilable legacy stored patterns (which the gateway also skips) so
  // a stale row cannot block unrelated saves.
  let report = validateRegexRules(
    [...existingPatterns, ...newPatterns],
    GATEWAY_GUARDRAIL_MAX_ORG_BYTES,
  );
  if (!report.ok && !report.set_error && existingPatterns.length > 0) {
    const validExisting = existingPatterns.filter(
      (_, index) => !report.rules[index]?.error,
    );
    report = validateRegexRules(
      [...validExisting, ...newPatterns],
      GATEWAY_GUARDRAIL_MAX_ORG_BYTES,
    );
  }
  if (!report.ok) {
    throw new InvalidRequestError(
      GATEWAY_GUARDRAIL_ORG_SIZE_LIMIT_ERROR_MESSAGE,
    );
  }
}

function normalizeRedactionLabel(
  type: GatewayGuardrailRecord["type"],
  action: GatewayGuardrailRecord["action"],
  rawLabel: string | undefined,
): string | null {
  if (
    !GATEWAY_GUARDRAIL_TYPE_CAPABILITIES[type].supportsRedactionLabel ||
    action !== "REDACT"
  ) {
    return null;
  }
  if (rawLabel === undefined) return GATEWAY_GUARDRAIL_DEFAULT_REDACTION_LABEL;
  const parsed = GatewayGuardrailRedactionLabelSchema.safeParse(rawLabel);
  if (!parsed.success) {
    throw new InvalidRequestError(
      parsed.error.issues[0]?.message ?? "Enter a valid replacement label",
    );
  }
  return parsed.data;
}

function toGuardrailDto(
  record: GatewayGuardrailRecord,
  flaggedCounts: Map<string, number> | null,
  viewer: { canManageGateway: boolean; userId: string },
) {
  const isBedrock = record.type === "BEDROCK";
  const parsedRegex =
    record.type !== "REGEX"
      ? null
      : GatewayRegexGuardrailConfigSchema.safeParse(record.config);
  const presets = parsedRegex?.success
    ? parsedRegex.data.presets.filter(isKnownGuardrailPreset)
    : [];
  const secretPrefixes = parsedRegex?.success
    ? parsedRegex.data.secretPrefixes
    : [];
  const containsWords = parsedRegex?.success
    ? parsedRegex.data.containsWords
    : [];
  const customRegex = parsedRegex?.success
    ? (parsedRegex.data.customRegex ?? null)
    : null;
  const parsedBedrock = isBedrock
    ? GatewayBedrockGuardrailConfigSchema.safeParse(record.config)
    : null;
  const bedrock = parsedBedrock?.success ? parsedBedrock.data : null;
  const parsedOpenAiModeration =
    record.type === "OPENAI_MODERATION"
      ? GatewayOpenAiModerationGuardrailConfigSchema.safeParse(record.config)
      : null;
  const openAiModeration = parsedOpenAiModeration?.success
    ? parsedOpenAiModeration.data
    : null;

  const action = resolveSupportedGuardrailAction(record.type, record.action);

  return {
    id: record.id,
    name: record.name,
    type: record.type,
    action,
    scope: resolveSupportedGuardrailScope(action, record.scope),
    redactionLabel: record.redactionLabel,
    presets,
    secretPrefixes,
    containsWords,
    customRegex,
    bedrock,
    openAiModeration,
    assignments: record.assignments.map((assignment) => {
      switch (assignment.scope) {
        case "ORGANIZATION":
          return {
            id: assignment.id,
            scope: "ORGANIZATION" as const,
            label: "Everyone",
          };
        case "API_KEY": {
          const canSeeKey =
            viewer.canManageGateway ||
            assignment.apiKey?.userId === viewer.userId;
          if (!canSeeKey) {
            return {
              id: assignment.id,
              scope: "API_KEY" as const,
              apiKeyId: null,
              label: null,
            };
          }
          return {
            id: assignment.id,
            scope: "API_KEY" as const,
            apiKeyId: assignment.apiKeyId!,
            label:
              assignment.apiKey?.note ??
              assignment.apiKey?.displaySecretKey ??
              assignment.apiKeyId!,
          };
        }
        case "USER": {
          const canSeeUser =
            viewer.canManageGateway || assignment.userId === viewer.userId;
          if (!canSeeUser) {
            return {
              id: assignment.id,
              scope: "USER" as const,
              userId: null,
              label: null,
              secondaryLabel: undefined,
            };
          }
          return {
            id: assignment.id,
            scope: "USER" as const,
            userId: assignment.userId!,
            label:
              assignment.user?.name ||
              assignment.user?.email ||
              assignment.userId!,
            secondaryLabel:
              assignment.user?.name && assignment.user.email
                ? assignment.user.email
                : undefined,
          };
        }
        default:
          return assertUnreachable(assignment.scope);
      }
    }),
    flaggedCount7d: flaggedCounts ? (flaggedCounts.get(record.id) ?? 0) : null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function audit(
  tx: Prisma.TransactionClient,
  params: {
    session: OrgAuthedContext["session"];
    action: "create" | "update" | "delete";
    before?: GatewayGuardrailRecord;
    after?: GatewayGuardrailRecord;
  },
) {
  const guardrail = params.after ?? params.before!;
  return auditLog(
    {
      session: params.session,
      resourceType: "gatewayGuardrail",
      resourceId: guardrail.id,
      action: params.action,
      before: params.before,
      after: params.after,
    },
    tx,
  );
}
