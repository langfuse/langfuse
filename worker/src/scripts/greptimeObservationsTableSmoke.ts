/**
 * Live read-path gate for the 04 P2 GreptimeDB observations-UI table reads.
 *   dotenv -e ../.env -- npx tsx src/scripts/greptimeObservationsTableSmoke.ts
 *
 * Reads the seeded `p2smoke-trace` project. Asserts the leaf-list semantics: per-row latency / tool
 * counts, grain=observation_id score filters, per-row cost/level filters, and trace enrichment.
 */
import {
  getObservationsTableCount,
  getObservationsTableWithModelData,
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

  const total = await getObservationsTableCount({
    projectId: PROJECT,
    filter: noFilter,
  });
  check("observation count > 0", total > 0, total);

  const rows = await getObservationsTableWithModelData({
    projectId: PROJECT,
    filter: noFilter,
    orderBy: { column: "startTime", order: "DESC" },
    limit: 20,
    offset: 0,
    selectIOAndMetadata: false,
  });
  check(
    "rows page <= limit",
    rows.length > 0 && rows.length <= 20,
    rows.length,
  );
  check(
    "rows carry id/projectId/type",
    rows.every((r) => r.id && r.projectId === PROJECT && r.type),
  );
  check(
    "rows ordered by startTime DESC",
    rows.every(
      (r, i) =>
        i === 0 || rows[i - 1].startTime.getTime() >= r.startTime.getTime(),
    ),
  );
  check(
    "tool counts derived (numbers or null)",
    rows.every(
      (r) =>
        (r.toolDefinitionsCount === null ||
          typeof r.toolDefinitionsCount === "number") &&
        (r.toolCallsCount === null || typeof r.toolCallsCount === "number"),
    ),
  );
  const gen = rows.find((r) => r.type === "GENERATION");
  if (gen) {
    check(
      "generation latency is seconds (>=0 or null)",
      gen.latency === null || gen.latency >= 0,
      gen.latency,
    );
    check("generation trace enrichment present", "traceName" in gen);
  }

  // level filter (per-row plain column)
  const errorCount = await getObservationsTableCount({
    projectId: PROJECT,
    filter: [
      {
        type: "stringOptions",
        column: "Level",
        operator: "any of",
        value: ["ERROR"],
      } as FilterState[number],
    ],
  });
  check(
    "level=ERROR count in [0, total]",
    errorCount >= 0 && errorCount <= total,
    { errorCount, total },
  );

  // type filter
  const genCount = await getObservationsTableCount({
    projectId: PROJECT,
    filter: [
      {
        type: "stringOptions",
        column: "Type",
        operator: "any of",
        value: ["GENERATION"],
      } as FilterState[number],
    ],
  });
  check(
    "type=GENERATION count in (0, total]",
    genCount > 0 && genCount <= total,
    { genCount, total },
  );

  // per-row total cost filter (json/flattened metric expression)
  const costlyCount = await getObservationsTableCount({
    projectId: PROJECT,
    filter: [
      {
        type: "number",
        column: "Total Cost ($)",
        operator: ">",
        value: 0,
      } as FilterState[number],
    ],
  });
  check(
    "totalCost>0 count in (0, total]",
    costlyCount > 0 && costlyCount <= total,
    { costlyCount, total },
  );

  // score-grain filter by observation_id (numeric)
  const scoredObs = await getObservationsTableCount({
    projectId: PROJECT,
    filter: [
      {
        type: "numberObject",
        column: "Scores (numeric)",
        key: "quality",
        operator: ">=",
        value: 0,
      } as FilterState[number],
    ],
  });
  check(
    "numberObject(quality>=0) count in [0, total]",
    scoredObs >= 0 && scoredObs <= total,
    { scoredObs, total },
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
