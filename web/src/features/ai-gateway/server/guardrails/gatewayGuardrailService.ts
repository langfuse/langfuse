import {
  InvalidRequestError,
  LangfuseConflictError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
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
  GATEWAY_GUARDRAIL_FLAGGED_WINDOW_DAYS,
  GATEWAY_GUARDRAIL_LIMIT_ERROR_MESSAGE,
  GATEWAY_GUARDRAIL_MAX_BULK_DELETE,
  GATEWAY_GUARDRAIL_MAX_ORG_BYTES,
  GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION,
  GATEWAY_GUARDRAIL_MAX_RULE_BYTES,
} from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import { GatewayConfigService } from "@/src/features/ai-gateway/server/config/gatewayConfigService";
import {
  GatewayGuardrailRepository,
  type GatewayGuardrailRecord,
} from "@/src/features/ai-gateway/server/guardrails/gatewayGuardrailRepository";
import type { GatewayResolveGuardrails } from "@/src/features/ai-gateway/server/provider/registry";
import { invalidateGatewayResolveCacheForOrganization } from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import { GATEWAY_USER_SCOPE } from "@/src/features/ai-gateway/server/team/gatewayTeamService";
import {
  compileGuardrailConfigPatterns,
  deduplicateContainsWords,
  estimateCompiledPatternsBytes,
  GatewayRegexGuardrailConfigSchema,
  isKnownGuardrailPreset,
  type GatewayGuardrailAssignmentInput,
  type GatewayGuardrailPreset,
  type GatewayGuardrailUiAction,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";
import { assertUnreachable } from "@/src/utils/types";
import type { OrgAuthedContext } from "@/src/server/api/trpc";

const GATEWAY_MEMBER_ROLES = Object.values(Role).filter((role) =>
  organizationRoleAccessRights[role].includes(GATEWAY_USER_SCOPE),
);

const DAY_MS = 24 * 60 * 60 * 1000;
const DUPLICATE_NAME_MESSAGE = "A guardrail with this name already exists";

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

  /** The guardrails the gateway checks for a key, in the resolve response's shape. */
  async resolveForKey(params: {
    organizationId: string;
    apiKeyId: string;
    userId: string | null;
  }): Promise<GatewayResolveGuardrails> {
    const guardrails = await this.repository.findAssigned(params);
    return guardrails.flatMap((guardrail) => {
      // The gateway does not redact yet; shipping these would turn them into another action.
      if (guardrail.action === "REDACT") return [];
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
          action: guardrail.action === "BLOCK" ? "block" : "log",
          patterns,
        },
      ];
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

  async create(params: {
    organizationId: string;
    name: string;
    action: GatewayGuardrailUiAction;
    presets: GatewayGuardrailPreset[];
    secretPrefixes?: string[];
    containsWords?: string[];
    assignments: GatewayGuardrailAssignmentInput[];
    session: OrgAuthedContext["session"];
  }) {
    const config = normalizeGuardrailConfig({
      presets: params.presets,
      secretPrefixes: params.secretPrefixes ?? [],
      containsWords: params.containsWords ?? [],
    });
    const ruleBytes = assertRuleSizeLimit(config);
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
      await assertOrgSizeLimit(repo, params.organizationId, ruleBytes);
      const record = await repo.create({
        organizationId: params.organizationId,
        name: params.name,
        action: params.action,
        config,
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

  async update(params: {
    organizationId: string;
    id: string;
    name: string;
    action: GatewayGuardrailUiAction;
    presets: GatewayGuardrailPreset[];
    secretPrefixes?: string[];
    containsWords?: string[];
    assignments: GatewayGuardrailAssignmentInput[];
    session: OrgAuthedContext["session"];
  }) {
    const updated = await this.writeGuardrail(async (tx) => {
      const repo = new GatewayGuardrailRepository(tx);
      const existing = await repo.findById({
        organizationId: params.organizationId,
        id: params.id,
      });
      if (!existing) throw new LangfuseNotFoundError("Guardrail not found");

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

      // Preserve stored preset IDs unknown to this build (e.g. from a newer pod during rollout).
      const existingConfig = GatewayRegexGuardrailConfigSchema.safeParse(
        existing.config,
      );
      const preservedUnknownPresets = existingConfig.success
        ? existingConfig.data.presets.filter(
            (preset) => !isKnownGuardrailPreset(preset),
          )
        : [];
      const config = normalizeGuardrailConfig({
        presets: [...params.presets, ...preservedUnknownPresets],
        secretPrefixes: params.secretPrefixes ?? [],
        containsWords: params.containsWords ?? [],
      });
      const ruleBytes = assertRuleSizeLimit(config);
      await assertOrgSizeLimit(
        repo,
        params.organizationId,
        ruleBytes,
        existing.id,
      );

      const record = await repo.update({
        organizationId: params.organizationId,
        id: existing.id,
        name: params.name,
        action: params.action,
        config,
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
}) {
  const presets = [...new Set(input.presets)];
  const secretPrefixes = [...new Set(input.secretPrefixes)];
  const containsWords = deduplicateContainsWords(input.containsWords);
  if (
    presets.length === 0 &&
    secretPrefixes.length === 0 &&
    containsWords.length === 0
  ) {
    throw new InvalidRequestError(
      "Configure at least one pattern, prefix, or keyword to detect",
    );
  }
  return {
    presets,
    ...(secretPrefixes.length > 0 ? { secretPrefixes } : {}),
    ...(containsWords.length > 0 ? { containsWords } : {}),
  };
}

function assertRuleSizeLimit(config: {
  presets: string[];
  secretPrefixes?: string[];
  containsWords?: string[];
}) {
  const patterns = compileGuardrailConfigPatterns(config);
  const bytes = estimateCompiledPatternsBytes(patterns);
  if (bytes > GATEWAY_GUARDRAIL_MAX_RULE_BYTES) {
    throw new InvalidRequestError(
      "This guardrail exceeds the 128 KiB compiled size limit. Remove some entries or patterns and try again.",
    );
  }
  return bytes;
}

async function assertOrgSizeLimit(
  repo: GatewayGuardrailRepository,
  organizationId: string,
  newRuleBytes: number,
  excludeId?: string,
) {
  const existing = await repo.listConfigsByOrganization({
    organizationId,
    excludeId,
  });
  let totalBytes = newRuleBytes;
  for (const row of existing) {
    const parsed = GatewayRegexGuardrailConfigSchema.safeParse(row.config);
    if (!parsed.success) continue;
    totalBytes += estimateCompiledPatternsBytes(
      compileGuardrailConfigPatterns(parsed.data),
    );
  }
  if (totalBytes > GATEWAY_GUARDRAIL_MAX_ORG_BYTES) {
    throw new InvalidRequestError(
      "Your organization's guardrails exceed the 512 KiB combined size limit. Simplify or remove an existing guardrail and try again.",
    );
  }
}

function toGuardrailDto(
  record: GatewayGuardrailRecord,
  flaggedCounts: Map<string, number> | null,
  viewer: { canManageGateway: boolean; userId: string },
) {
  const parsed = GatewayRegexGuardrailConfigSchema.safeParse(record.config);
  const presets = parsed.success
    ? parsed.data.presets.filter(isKnownGuardrailPreset)
    : [];
  const secretPrefixes = parsed.success ? parsed.data.secretPrefixes : [];
  const containsWords = parsed.success ? parsed.data.containsWords : [];

  return {
    id: record.id,
    name: record.name,
    type: record.type,
    action: record.action,
    presets,
    secretPrefixes,
    containsWords,
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
