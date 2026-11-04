import { type IncomingHttpHeaders } from "node:http";
import {
  type TRPC_ERROR_CODE_KEY,
  type TRPCProcedureBuilder,
  type TRPCQueryProcedure,
  type TRPCUnsetMarker,
} from "@trpc/server";
import { type Session } from "next-auth";
import * as z from "zod";

import {
  toAuditLogResourceRef,
  type AuditLogResourceRef,
  type AuditLogResourceRefType,
} from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";

import { recordTrpcAccess } from "@/src/features/audit-logs/server/recordAccessEvent";

/** The read a tRPC query performs, recorded as an audit access event. */
export type AccessAuditMeta = {
  resourceType: AuditLogResourceRefType | "experiment";
  /** `read` returns resources the request names, `list` the rows a filter matches. */
  action: "read" | "list";
  /** The input field that names the one resource a `read` opens. */
  idKey?: string;
};

export type TrpcMeta = { accessAudit?: AccessAuditMeta };

/** Collects what a response contains beyond the resource `idKey` names. */
export type AccessAuditRecorder = {
  refs(refs: AuditLogResourceRef[]): void;
  count(resultCount: number): void;
};

type QueryBuilder = TRPCProcedureBuilder<
  any,
  TrpcMeta,
  any,
  any,
  any,
  TRPCUnsetMarker,
  TRPCUnsetMarker,
  false
>;

type QueryOptions<TBuilder extends QueryBuilder> = Parameters<
  Parameters<TBuilder["query"]>[0]
>[0];

type RequiredStringKeys<T> = {
  [K in keyof T]-?: T[K] extends string ? K : never;
}[keyof T] &
  string;

type AuditedRead<TInput> = TInput extends { projectId: string }
  ? Omit<AccessAuditMeta, "idKey"> & { idKey?: RequiredStringKeys<TInput> }
  : never;

type AuditedQueryProcedure<TBuilder, TOutput> =
  TBuilder extends TRPCProcedureBuilder<
    any,
    infer TMeta,
    any,
    infer TInputIn,
    any,
    any,
    any,
    false
  >
    ? TRPCQueryProcedure<{ input: TInputIn; output: TOutput; meta: TMeta }>
    : never;

export const ref = toAuditLogResourceRef;

export const refsIf = (
  type: AuditLogResourceRefType,
  id: string | null | undefined,
): AuditLogResourceRef[] => (id ? [ref(type, id)] : []);

/** Observations with their trace and, where the row carries it, their session. */
export const observationRefs = (
  rows: {
    id: string;
    traceId?: string | null;
    sessionId?: string | null;
  }[],
): AuditLogResourceRef[] =>
  rows.flatMap((row) => [
    ref("observation", row.id),
    ...refsIf("trace", row.traceId),
    ...refsIf("session", row.sessionId),
  ]);

/** Scores with the trace, observation and session they are attached to. */
export const scoreRefs = (
  rows: {
    id: string;
    traceId?: string | null;
    observationId?: string | null;
    sessionId?: string | null;
  }[],
): AuditLogResourceRef[] =>
  rows.flatMap((row) => [
    ref("score", row.id),
    ...refsIf("trace", row.traceId),
    ...refsIf("observation", row.observationId),
    ...refsIf("session", row.sessionId),
  ]);

const primaryRefs = (
  resourceType: AccessAuditMeta["resourceType"],
  resourceId: string | undefined,
): AuditLogResourceRef[] =>
  resourceType === "experiment" ? [] : refsIf(resourceType, resourceId);

// Ingestion rejects longer trace, observation and score ids, so only a request
// can carry one. Ids past this length are left out of the event, as are empty
// ones. Session ids have no ingestion cap: a longer one is left out too and is
// kept only in `params`.
const MAX_ID_LENGTH = 800;
const ResourceIdSchema = z.string().min(1).max(MAX_ID_LENGTH);

/** The id `idKey` names in the request, if a resource can have it. */
const requestedId = (
  meta: AccessAuditMeta,
  input: Record<string, unknown>,
): string | undefined =>
  meta.idKey ? ResourceIdSchema.safeParse(input[meta.idKey]).data : undefined;

const namesPossibleId = (ref: AuditLogResourceRef): boolean =>
  ResourceIdSchema.safeParse(ref.slice(ref.indexOf(":") + 1)).success;

/**
 * A query whose reads are recorded as audit access events: the resource
 * `idKey` names, plus what the resolver passes to `audit.refs`. The event is
 * recorded before the data is returned, so a failed write fails the read.
 * Refused calls are recorded by the access-check middleware, from the meta
 * this sets.
 */
export function auditedQuery<TBuilder extends QueryBuilder, TOutput>(
  builder: TBuilder,
  read: AuditedRead<QueryOptions<TBuilder>["input"]>,
  resolver: (
    opts: QueryOptions<TBuilder> & { audit: AccessAuditRecorder },
  ) => Promise<TOutput>,
): AuditedQueryProcedure<TBuilder, TOutput> {
  const meta: AccessAuditMeta = read;
  return builder.meta({ accessAudit: meta }).query(async (opts) => {
    const collected: AuditLogResourceRef[][] = [];
    let resultCount: number | undefined;
    const output = await resolver({
      ...opts,
      audit: {
        refs: (refs) => {
          collected.push(refs);
        },
        count: (count) => {
          resultCount = count;
        },
      },
    } as QueryOptions<TBuilder> & { audit: AccessAuditRecorder });

    const input = opts.input as { projectId: string } & Record<string, unknown>;
    const resourceId = requestedId(meta, input);
    await recordTrpcAccess(opts.ctx, input.projectId, {
      route: opts.path,
      resourceType: meta.resourceType,
      resourceId,
      action: meta.action,
      resourceRefs: [
        ...primaryRefs(meta.resourceType, resourceId),
        ...collected.flat().filter(namesPossibleId),
      ],
      params: input,
      resultCount,
    });
    return output;
  }) as unknown as AuditedQueryProcedure<TBuilder, TOutput>;
}

const DENIED_CODES = new Set<TRPC_ERROR_CODE_KEY>([
  "UNAUTHORIZED",
  "FORBIDDEN",
]);

const ProjectInputSchema = z.object({ projectId: z.string().min(1) });

/**
 * Records a refused call to an audited query with `outcome = denied`. Its
 * input was never validated, so only the resource `idKey` names is taken
 * from it. Other failures are not recorded.
 */
export async function recordRefusedRead({
  path,
  ctx,
  meta,
  getRawInput,
  code,
}: {
  path: string;
  ctx: {
    session: { user?: Session["user"] } | null;
    headers: IncomingHttpHeaders;
  };
  meta: AccessAuditMeta;
  getRawInput: () => Promise<unknown>;
  code: TRPC_ERROR_CODE_KEY;
}): Promise<void> {
  if (!DENIED_CODES.has(code)) return;
  const input = await getRawInput();
  const project = ProjectInputSchema.safeParse(input);
  if (!project.success) return;
  const resourceId = requestedId(meta, input as Record<string, unknown>);

  // The caller was refused and receives no data, so a failed write keeps the
  // refusal instead of turning it into a server error.
  try {
    await recordTrpcAccess(ctx, project.data.projectId, {
      route: path,
      resourceType: meta.resourceType,
      resourceId,
      action: meta.action,
      resourceRefs: primaryRefs(meta.resourceType, resourceId),
      outcome: "denied",
      outcomeReason: code,
    });
  } catch (error) {
    logger.warn("Failed to record a refused read", { error, route: path });
  }
}
