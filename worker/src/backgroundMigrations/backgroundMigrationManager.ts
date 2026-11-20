import { randomUUID } from "crypto";
import { IBackgroundMigration } from "./IBackgroundMigration";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import { instrumentAsync, logger } from "@langfuse/shared/src/server";
import { env } from "../env";
import { PeriodicRunner } from "../utils/PeriodicRunner";

const ENV_GATE_PREFIX = "LANGFUSE_BACKGROUND_MIGRATION_";

// Rows are inserted by Prisma migrations that the web container applies, which
// can finish after this worker started, and a row stays locked for 60s after
// its worker dies. Rescanning picks up both without a restart. Five minutes
// keeps the idle cost at one small query per worker and is short compared to
// the runtime of a background migration.
export const BACKGROUND_MIGRATION_RESCAN_INTERVAL_MS = 5 * 60 * 1000;

export class BackgroundMigrationManager {
  private static workerId = randomUUID();
  private static scanner: BackgroundMigrationScanner | undefined;
  private static closing = false;
  private static hasScanned = false;
  private static activeMigration:
    | {
        id: string;
        name: string;
        args: Record<string, unknown>;
        migration: IBackgroundMigration;
      }
    | undefined;

  private static async heartBeat(): Promise<void> {
    if (!BackgroundMigrationManager.activeMigration) {
      return;
    }

    await prisma.backgroundMigration.updateMany({
      where: {
        id: BackgroundMigrationManager.activeMigration.id,
        workerId: BackgroundMigrationManager.workerId,
        finishedAt: null,
        failedAt: null,
      },
      data: {
        lockedAt: new Date(),
      },
    });

    // Schedule next heartbeat in 15s
    setTimeout(BackgroundMigrationManager.heartBeat, 15 * 1000);
  }

  private static loadMigration(script: string): IBackgroundMigration {
    return new (require(`./${script}`).default)();
  }

  /**
   * Runs pending background migrations now and scans again
   * BACKGROUND_MIGRATION_RESCAN_INTERVAL_MS after each scan completes, so scans
   * within a process never overlap. Stopped by close().
   */
  public static start(): void {
    BackgroundMigrationManager.closing = false;
    if (!BackgroundMigrationManager.scanner) {
      BackgroundMigrationManager.scanner = new BackgroundMigrationScanner();
    }
    BackgroundMigrationManager.scanner.start();
  }

  public static async run(): Promise<void> {
    await instrumentAsync({ name: "background-migration-run" }, async () => {
      // A migration row may declare `args.envGate = "<ENV_VAR>"` to remain dormant
      // until the operator sets that env var to "true" (e.g. ship dormant on v3,
      // activate on v4). We push the gate check into the findFirst predicate so
      // dormant rows never get picked — otherwise the first dormant row in name
      // order would head-of-line block every unrelated later migration.
      //
      // Gate names share the LANGFUSE_BACKGROUND_MIGRATION_ prefix so we can
      // discover them via the validated env without scanning all of process.env.
      const activeGates = Object.entries(env)
        .filter(
          ([key, value]) => key.startsWith(ENV_GATE_PREFIX) && value === "true",
        )
        .map(([key]) => key);

      let migrationToRun = true;

      while (migrationToRun && !BackgroundMigrationManager.closing) {
        await prisma.$transaction(
          async (tx) => {
            // Read background migrations from database, ignoring any row whose
            // envGate is set to an env var that is not currently "true".
            const migration = await tx.backgroundMigration.findFirst({
              where: {
                finishedAt: null,
                failedAt: null,
                OR: [
                  { args: { path: ["envGate"], equals: Prisma.AnyNull } },
                  ...activeGates.map((gate) => ({
                    args: { path: ["envGate"], equals: gate },
                  })),
                ],
              },
              orderBy: { name: "asc" },
            });

            // Abort if there is no migration to run or migration was locked less than 60s ago
            // We do not check lockedAt in the DB query, because findFirst might return other uncompleted migrations
            // which would lead to concurrent execution.
            if (
              !migration ||
              (migration.lockedAt &&
                migration.lockedAt > new Date(Date.now() - 60 * 1000))
            ) {
              // Only the first scan of a process logs at info; idle rescans
              // would otherwise log every interval on every worker.
              const message =
                "[Background Migration] No background migrations to run";
              if (BackgroundMigrationManager.hasScanned) {
                logger.debug(message);
              } else {
                logger.info(message);
              }
              migrationToRun = false;
              return;
            }

            logger.info(
              `[Background Migration] Found background migrations ${migration.name} to run`,
            );

            // Acquire lock
            await tx.backgroundMigration.update({
              where: {
                id: migration.id,
              },
              data: {
                workerId: BackgroundMigrationManager.workerId,
                lockedAt: new Date(),
              },
            });
            logger.info(
              `[Background Migration] Acquired lock for background migration ${migration.name}`,
            );
            BackgroundMigrationManager.activeMigration = {
              id: migration.id,
              name: migration.name,
              args: migration.args as any,
              migration: BackgroundMigrationManager.loadMigration(
                migration.script,
              ),
            };
          },
          {
            maxWait: 5000,
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );

        if (!BackgroundMigrationManager.activeMigration) {
          continue;
        }

        // Initiate heartbeats every couple seconds
        await BackgroundMigrationManager.heartBeat();

        // Capture a local reference so the catch handler stays type-safe even if
        // close() concurrently nulls activeMigration during shutdown.
        const active = BackgroundMigrationManager.activeMigration;
        const { migration, args } = active;
        const { valid, invalidReason } = await migration.validate(args);
        if (!valid) {
          logger.error(
            `[Background Migration] Validation failed for background migration ${active.name}: ${invalidReason}`,
          );
          await prisma.backgroundMigration.update({
            where: {
              id: active.id,
              workerId: BackgroundMigrationManager.workerId,
            },
            data: {
              lockedAt: null,
              failedAt: new Date(),
              failedReason: invalidReason,
            },
          });
          BackgroundMigrationManager.activeMigration = undefined;
          continue;
        }

        try {
          await migration.run(args);

          if (BackgroundMigrationManager.activeMigration !== undefined) {
            // Only mark as complete if still active. Otherwise, it was aborted.
            await prisma.backgroundMigration.update({
              where: {
                id: active.id,
                workerId: BackgroundMigrationManager.workerId,
              },
              data: {
                finishedAt: new Date(),
                lockedAt: null,
              },
            });
            logger.info(
              `[Background Migration] Finished background migration ${active.name}`,
            );
          }
        } catch (err) {
          logger.error(
            `[Background Migration] Failed to run background migration ${active.name}: ${err}`,
          );
          await prisma.backgroundMigration.update({
            where: {
              id: active.id,
              workerId: BackgroundMigrationManager.workerId,
            },
            data: {
              lockedAt: null,
              failedAt: new Date(),
              failedReason:
                err instanceof Error ? err.message : "Unknown error",
            },
          });
        }
        BackgroundMigrationManager.activeMigration = undefined;
      }
      BackgroundMigrationManager.hasScanned = true;
    });
  }

  public static async close(): Promise<void> {
    BackgroundMigrationManager.closing = true;
    BackgroundMigrationManager.scanner?.stop();
    if (BackgroundMigrationManager.activeMigration) {
      await BackgroundMigrationManager.activeMigration.migration.abort();
      await prisma.backgroundMigration.update({
        where: {
          id: BackgroundMigrationManager.activeMigration.id,
          workerId: BackgroundMigrationManager.workerId,
        },
        data: {
          lockedAt: null,
        },
      });
      logger.info(
        `[Background Migration] Aborted active migration ${BackgroundMigrationManager.activeMigration.name}`,
      );
      BackgroundMigrationManager.activeMigration = undefined;
    }
  }
}

class BackgroundMigrationScanner extends PeriodicRunner {
  constructor() {
    super("background_migrations");
  }

  protected get name(): string {
    return "BackgroundMigrationScanner";
  }

  protected get defaultIntervalMs(): number {
    return BACKGROUND_MIGRATION_RESCAN_INTERVAL_MS;
  }

  protected execute(): Promise<void> {
    return BackgroundMigrationManager.run();
  }
}
