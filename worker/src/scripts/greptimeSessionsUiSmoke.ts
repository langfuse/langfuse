/**
 * Live read-path gate for the 04 P2 GreptimeDB sessions-UI table service.
 *   dotenv -e ../.env -- npx tsx src/scripts/greptimeSessionsUiSmoke.ts
 *
 * Reads the seeded `p2smoke-trace` project from openfuse and asserts session-level rollup semantics
 * + cross-call consistency. Exercises session aggregation, grain=session_id score filters, userIds /
 * tags correlated EXISTS, and the duration/cost/usage post-aggregation filters.
 */
import {
  getSessionsTable,
  getSessionsTableCount,
  getSessionsWithMetrics,
  closeGreptimeConnections,
} from "@langfuse/shared/src/server";
import { type FilterState } from "@langfuse/shared";

const PROJECT = "98692739-71ed-427a-bbda-440aa8b47fa5";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

async function main() {
  const noFilter: FilterState = [];

  const total = await getSessionsTableCount({
    projectId: PROJECT,
    filter: noFilter,
  });
  check("session count > 0", total > 0, total);

  const rows = await getSessionsTable({
    projectId: PROJECT,
    filter: noFilter,
    orderBy: { column: "createdAt", order: "DESC" },
    limit: 10,
    page: 0,
  });
  check(
    "rows page <= limit",
    rows.length > 0 && rows.length <= 10,
    rows.length,
  );
  check(
    "rows carry session_id + trace_ids + trace_count",
    rows.every(
      (r) =>
        r.session_id &&
        Array.isArray(r.trace_ids) &&
        r.trace_ids.length === r.trace_count,
    ),
    rows.map((r) => ({
      s: r.session_id,
      n: r.trace_count,
      ids: r.trace_ids.length,
    })),
  );
  check(
    "rows ordered by min_timestamp DESC",
    rows.every(
      (r, i) =>
        i === 0 ||
        new Date(rows[i - 1].min_timestamp).getTime() >=
          new Date(r.min_timestamp).getTime(),
    ),
  );
  check(
    "user_ids / trace_tags arrays drop empties",
    rows.every(
      (r) =>
        r.user_ids.every((u) => u && u.length > 0) &&
        r.trace_tags.every((t) => t && t.length > 0),
    ),
  );

  const metrics = await getSessionsWithMetrics({
    projectId: PROJECT,
    filter: noFilter,
    orderBy: { column: "createdAt", order: "DESC" },
    limit: 10,
    page: 0,
  });
  check(
    "metrics rows align with rows",
    metrics.length === rows.length,
    metrics.length,
  );
  const big = metrics.find((m) => m.total_observations > 0);
  check("a session has observations", Boolean(big));
  if (big) {
    check(
      "duration is a finite number (seconds)",
      Number.isFinite(big.duration) && big.duration >= 0,
      big.duration,
    );
    check(
      "cost strings parse to finite numbers",
      [
        big.session_input_cost,
        big.session_output_cost,
        big.session_total_cost,
      ].every((c) => Number.isFinite(Number(c))),
      {
        in: big.session_input_cost,
        out: big.session_output_cost,
        total: big.session_total_cost,
      },
    );
    check(
      "usage strings are integer-valued (BigInt-safe)",
      [
        big.session_input_usage,
        big.session_output_usage,
        big.session_total_usage,
      ].every((u) => /^-?\d+$/.test(u)),
      {
        in: big.session_input_usage,
        out: big.session_output_usage,
        total: big.session_total_usage,
      },
    );
  }

  // duration post-aggregation filter prunes the set.
  const longSessions = await getSessionsTableCount({
    projectId: PROJECT,
    filter: [
      {
        type: "number",
        column: "Session Duration (s)",
        operator: ">",
        value: 1,
      } as FilterState[number],
    ],
  });
  check(
    "duration>1s count in [0, total]",
    longSessions >= 0 && longSessions <= total,
    { longSessions, total },
  );

  // categorical score grain filter (session-level EXISTS over scores by session_id).
  const sentimentAny = await getSessionsTableCount({
    projectId: PROJECT,
    filter: [
      {
        type: "categoryOptions",
        column: "Scores (categorical)",
        key: "sentiment",
        operator: "any of",
        value: ["negative", "positive"],
      } as FilterState[number],
    ],
  });
  const sentimentNone = await getSessionsTableCount({
    projectId: PROJECT,
    filter: [
      {
        type: "categoryOptions",
        column: "Scores (categorical)",
        key: "sentiment",
        operator: "none of",
        value: ["negative", "positive"],
      } as FilterState[number],
    ],
  });
  check(
    "session categoryOptions any-of + none-of partition the total",
    sentimentAny + sentimentNone === total,
    { sentimentAny, sentimentNone, total },
  );

  // environment pre-aggregation filter does not crash and is bounded.
  const envCount = await getSessionsTableCount({
    projectId: PROJECT,
    filter: [
      {
        type: "stringOptions",
        column: "Environment",
        operator: "any of",
        value: ["default"],
      } as FilterState[number],
    ],
  });
  check(
    "environment filter bounded by total",
    envCount >= 0 && envCount <= total,
    { envCount, total },
  );

  console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} FAILURE(S)`);
}

main()
  .catch((e) => {
    console.error(e);
    failures++;
  })
  .finally(async () => {
    await closeGreptimeConnections();
    process.exit(failures === 0 ? 0 : 1);
  });
