import { randomUUID } from "crypto";
import { IBackgroundMigration } from "./IBackgroundMigration";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import { instrumentAsync, logger } from "@langfuse/shared/src/server";

export class BackgroundMigrationManager {
  private static workerId = randomUUID();
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

  public static async run(): Promise<void> {
    await instrumentAsync({ name: "background-migration-run" }, async () => {
      let migrationToRun = true;

      while (migrationToRun) {
        await prisma.$transaction(
          async (tx) => {
            // Read background migrations from database
            const migration = await tx.backgroundMigration.findFirst({
              where: {
                finishedAt: null,
                failedAt: null,
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
              logger.info(
                "[Background Migration] No background migrations to run",
              );
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
              migration: new (require(`./${migration.script}`).default)(),
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

        const { migration, args } = BackgroundMigrationManager.activeMigration;
        const { valid, invalidReason } = await migration.validate(args);
        if (!valid) {
          logger.error(
            `[Background Migration] Validation failed for background migration ${BackgroundMigrationManager.activeMigration.name}: ${invalidReason}`,
          );
          await prisma.backgroundMigration.update({
            where: {
              id: BackgroundMigrationManager.activeMigration.id,
              workerId: BackgroundMigrationManager.workerId,
            },
            data: {
              lockedAt: null,
              failedAt: new Date(),
              failedReason: invalidReason,
            },
          });
          continue;
        }

        try {
          await migration.run(args);

          if (BackgroundMigrationManager.activeMigration !== undefined) {
            // Only mark as complete if still active. Otherwise, it was aborted.
            await prisma.backgroundMigration.update({
              where: {
                id: BackgroundMigrationManager.activeMigration.id,
                workerId: BackgroundMigrationManager.workerId,
              },
              data: {
                finishedAt: new Date(),
                lockedAt: null,
              },
            });
            logger.info(
              `[Background Migration] Finished background migration ${BackgroundMigrationManager.activeMigration.name}`,
            );
          }
        } catch (err) {
          logger.error(
            `[Background Migration] Failed to run background migration ${BackgroundMigrationManager.activeMigration.name}: ${err}`,
          );
          await prisma.backgroundMigration.update({
            where: {
              id: BackgroundMigrationManager.activeMigration.id,
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
    });
  }

  public static async close(): Promise<void> {
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
