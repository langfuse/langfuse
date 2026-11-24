import { TRPCError } from "@trpc/server";
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
  GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION,
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
  GatewayRegexGuardrailConfigSchema,
  isKnownGuardrailPreset,
  presetPatterns,
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
        ? config.data.presets.flatMap((preset) => [...presetPatterns(preset)])
        : [];
      // A guardrail with nothing to match is skipped rather than failing every request of the key.
      if (patterns.length === 0) {
        logger.error("Skipping gateway guardrail without known presets", {
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
      rows: rows.map((row) => toGuardrailDto(row, flaggedCounts)),
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
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Gateway requests are not recorded",
      });
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
    assignments: GatewayGuardrailAssignmentInput[];
    session: OrgAuthedContext["session"];
  }) {
    const presets = [...new Set(params.presets)];
    const assignments = await this.normalizeAndValidateAssignments(
      params.organizationId,
      params.assignments,
    );

    const created = await this.writeGuardrail(async (tx) => {
      // Serialize concurrent creates per organization so the cap cannot be exceeded.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`gateway_guardrail:${params.organizationId}`}))`;
      const repo = new GatewayGuardrailRepository(tx);
      const existingCount = await repo.countByOrganization(
        params.organizationId,
      );
      if (existingCount >= GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION) {
        throw new InvalidRequestError(GATEWAY_GUARDRAIL_LIMIT_ERROR_MESSAGE);
      }
      const record = await repo.create({
        organizationId: params.organizationId,
        name: params.name,
        action: params.action,
        presets,
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
    return toGuardrailDto(created, null);
  }

  async update(params: {
    organizationId: string;
    id: string;
    name: string;
    action: GatewayGuardrailUiAction;
    presets: GatewayGuardrailPreset[];
    assignments: GatewayGuardrailAssignmentInput[];
    session: OrgAuthedContext["session"];
  }) {
    const presets = [...new Set(params.presets)];
    const assignments = await this.normalizeAndValidateAssignments(
      params.organizationId,
      params.assignments,
    );

    const updated = await this.writeGuardrail(async (tx) => {
      const repo = new GatewayGuardrailRepository(tx);
      // Lock the guardrail row before replacing assignments so concurrent saves cannot interleave.
      const locked = await repo.lockById({
        organizationId: params.organizationId,
        id: params.id,
      });
      if (!locked) throw new LangfuseNotFoundError("Guardrail not found");
      const existing = await repo.findById({
        organizationId: params.organizationId,
        id: params.id,
      });
      if (!existing) throw new LangfuseNotFoundError("Guardrail not found");
      const record = await repo.update({
        organizationId: params.organizationId,
        id: existing.id,
        name: params.name,
        action: params.action,
        presets,
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
    return toGuardrailDto(updated, null);
  }

  async deleteMany(params: {
    organizationId: string;
    target: GatewayGuardrailDeleteTarget;
    session: OrgAuthedContext["session"];
  }) {
    const ids =
      params.target.type === "ids"
        ? [...new Set(params.target.ids)]
        : (
            await this.repository.listMatching({
              organizationId: params.organizationId,
              searchQuery: params.target.searchQuery,
            })
          ).map(({ id }) => id);

    if (ids.length > GATEWAY_GUARDRAIL_MAX_BULK_DELETE) {
      throw new InvalidRequestError(
        `At most ${GATEWAY_GUARDRAIL_MAX_BULK_DELETE} guardrails can be deleted at once. Narrow the search filter.`,
      );
    }
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

  private async normalizeAndValidateAssignments(
    organizationId: string,
    assignments: GatewayGuardrailAssignmentInput[],
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

    const apiKeyIds = deduped.flatMap((assignment) =>
      assignment.scope === "API_KEY" ? [assignment.apiKeyId] : [],
    );
    const userIds = deduped.flatMap((assignment) =>
      assignment.scope === "USER" ? [assignment.userId] : [],
    );
    const valid = await this.repository.findValidTargetIds({
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

function toGuardrailDto(
  record: GatewayGuardrailRecord,
  flaggedCounts: Map<string, number> | null,
) {
  const parsed = GatewayRegexGuardrailConfigSchema.safeParse(record.config);
  const presets = parsed.success
    ? parsed.data.presets.filter(isKnownGuardrailPreset)
    : [];

  return {
    id: record.id,
    name: record.name,
    type: record.type,
    action: record.action,
    presets,
    assignments: record.assignments.map((assignment) => {
      switch (assignment.scope) {
        case "ORGANIZATION":
          return {
            id: assignment.id,
            scope: "ORGANIZATION" as const,
            label: "Everyone",
          };
        case "API_KEY":
          return {
            id: assignment.id,
            scope: "API_KEY" as const,
            apiKeyId: assignment.apiKeyId!,
            label:
              assignment.apiKey?.note ??
              assignment.apiKey?.displaySecretKey ??
              assignment.apiKeyId!,
          };
        case "USER":
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
