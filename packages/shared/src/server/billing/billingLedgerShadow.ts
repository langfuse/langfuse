import { recordIncrement } from "../instrumentation";
import { logger } from "../logger";
import {
  BILLING_WINDOW_MS,
  type BillableEventType,
  getBillableUnitCountsByProjectInRange,
} from "../repositories/billable-events";

/** Billing consumer whose legacy counts the ledger is compared against. */
export type BillingLedgerShadowSource = "stripe_metering" | "chb_metrics_api";

type ProjectCount = { projectId: string; count: number };
type Units = Record<BillableEventType, number>;

// Stripe meters one hour and CHB polls 15 minutes. Longer ranges would take one
// ledger query per 15-minute window, so they are not compared.
const MAX_COMPARED_RANGE_MS = 60 * 60 * 1000;

// A project only counts as diverging when the gap is large both in units and
// relative to its usage. Small projects and the created_at vs ingested_at
// boundary drift of busy projects would otherwise fill the log.
const DIVERGENCE_MIN_UNITS = 100;
const DIVERGENCE_MIN_RATIO = 0.05;
const LOGGED_PROJECTS = 10;

const UNIT_TYPES: readonly BillableEventType[] = [
  "trace",
  "observation",
  "score",
];

const zeroUnits = (): Units => ({ trace: 0, observation: 0, score: 0 });
const totalUnits = (units: Units) =>
  units.trace + units.observation + units.score;

/**
 * Compares the legacy billing counts of `[from, to)` with the billable_events
 * ledger per project and reports the result. Metrics carry unit totals per
 * side and type, and the number of compared, diverging and one-sided projects.
 * One log line lists the projects with the largest gaps.
 *
 * Shadow only: it never changes what is billed and never throws. The legacy
 * score count leaves CORRECTION scores out and the ledger does not, so a
 * project with CORRECTION scores shows a score gap of that size.
 */
export const compareWithBillingLedger = async ({
  source,
  from,
  to,
  projectId,
  legacy,
  orgIdByProjectId,
}: {
  source: BillingLedgerShadowSource;
  from: Date;
  to: Date;
  /** Restricts the ledger read to one project, as the legacy counts are. */
  projectId?: string;
  legacy: {
    traces: ProjectCount[];
    observations: ProjectCount[];
    scores: ProjectCount[];
  };
  orgIdByProjectId?: Map<string, string>;
}): Promise<void> => {
  if (
    from.getTime() % BILLING_WINDOW_MS !== 0 ||
    to.getTime() % BILLING_WINDOW_MS !== 0 ||
    to.getTime() <= from.getTime() ||
    to.getTime() - from.getTime() > MAX_COMPARED_RANGE_MS
  ) {
    recordIncrement("langfuse.billing.ledger_shadow.skipped_comparisons", 1, {
      source,
      reason: "unsupported_range",
    });
    return;
  }

  try {
    const ledger = await getBillableUnitCountsByProjectInRange({
      from,
      to,
      projectId,
    });

    const projects = new Map<string, { legacy: Units; ledger: Units }>();
    const unitsOf = (id: string) => {
      let units = projects.get(id);
      if (!units) {
        units = { legacy: zeroUnits(), ledger: zeroUnits() };
        projects.set(id, units);
      }
      return units;
    };
    const legacyByType: Array<[BillableEventType, ProjectCount[]]> = [
      ["trace", legacy.traces],
      ["observation", legacy.observations],
      ["score", legacy.scores],
    ];
    for (const [eventType, rows] of legacyByType) {
      for (const row of rows)
        unitsOf(row.projectId).legacy[eventType] += row.count;
    }
    for (const row of ledger) {
      unitsOf(row.projectId).ledger[row.eventType] += row.count;
    }

    const comparisons = [...projects].map(([id, units]) => ({
      projectId: id,
      orgId: orgIdByProjectId?.get(id),
      legacy: units.legacy,
      ledger: units.ledger,
      delta: totalUnits(units.ledger) - totalUnits(units.legacy),
    }));
    const diverging = comparisons
      .filter(
        (comparison) =>
          Math.abs(comparison.delta) >= DIVERGENCE_MIN_UNITS &&
          Math.abs(comparison.delta) >=
            DIVERGENCE_MIN_RATIO * Math.max(totalUnits(comparison.legacy), 1),
      )
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    const totals = { legacy: zeroUnits(), ledger: zeroUnits() };
    for (const comparison of comparisons) {
      for (const unitType of UNIT_TYPES) {
        totals.legacy[unitType] += comparison.legacy[unitType];
        totals.ledger[unitType] += comparison.ledger[unitType];
      }
    }
    for (const unitType of UNIT_TYPES) {
      for (const side of ["legacy", "ledger"] as const) {
        recordIncrement(
          "langfuse.billing.ledger_shadow.units",
          totals[side][unitType],
          { source, side, unit_type: unitType },
        );
      }
    }
    recordIncrement(
      "langfuse.billing.ledger_shadow.compared_projects",
      comparisons.length,
      { source },
    );
    recordIncrement(
      "langfuse.billing.ledger_shadow.diverging_projects",
      diverging.length,
      { source },
    );
    // A project with usage on only one side points at a broken write path,
    // such as a materialized view that stopped filling the ledger.
    for (const side of ["ledger", "legacy"] as const) {
      const other = side === "ledger" ? "legacy" : "ledger";
      recordIncrement(
        "langfuse.billing.ledger_shadow.one_sided_projects",
        comparisons.filter(
          (comparison) =>
            totalUnits(comparison[side]) === 0 &&
            totalUnits(comparison[other]) > 0,
        ).length,
        { source, missing_from: side },
      );
    }

    if (diverging.length > 0) {
      logger.info(
        `[BILLING LEDGER SHADOW] ${diverging.length} of ${comparisons.length} projects diverge for ${source} in ${from.toISOString()} - ${to.toISOString()}`,
        {
          source,
          from: from.toISOString(),
          to: to.toISOString(),
          totals,
          projects: diverging.slice(0, LOGGED_PROJECTS),
        },
      );
    }
  } catch (error) {
    logger.warn(
      `[BILLING LEDGER SHADOW] Comparison for ${source} in ${from.toISOString()} - ${to.toISOString()} failed`,
      { error },
    );
    recordIncrement("langfuse.billing.ledger_shadow.failed_comparisons", 1, {
      source,
    });
  }
};
