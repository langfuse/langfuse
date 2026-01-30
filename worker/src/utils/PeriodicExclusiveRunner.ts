import { logger, getCurrentSpan } from "@langfuse/shared/src/server";
import { PeriodicRunner } from "./PeriodicRunner";
import { OnUnavailableBehavior, RedisLock } from "./RedisLock";

/**
 * Abstract base class for periodic tasks that require distributed locking.
 *
 * Extends PeriodicRunner with:
 * - Redis distributed locking (via RedisLock)
 * - Common stop() logging
 * - processBatch() public wrapper for testing
 * - withLock() helper for lock + error handling
 */
export abstract class PeriodicExclusiveRunner extends PeriodicRunner {
  protected readonly instanceName: string;
  protected readonly lock: RedisLock;

  constructor(params: {
    name: string;
    lockKey: string;
    lockTtlSeconds: number;
    onUnavailable?: OnUnavailableBehavior;
  }) {
    super();
    this.instanceName = params.name;
    this.lock = new RedisLock(params.lockKey, {
      ttlSeconds: params.lockTtlSeconds,
      name: params.name,
      onUnavailable: params.onUnavailable || "proceed",
    });
  }

  protected get name(): string {
    return this.instanceName;
  }

  public override stop(): void {
    super.stop();
    logger.info(`${this.instanceName} stopped`);
  }

  /**
   * Public wrapper for execute(), used by tests.
   */
  public async processBatch(): Promise<number | void> {
    return this.execute();
  }

  /**
   * Execute operation under distributed lock.
   * Returns operation result, onFailure result, or undefined if lock not acquired.
   */
  protected async withLock<T>(
    operation: () => Promise<T>,
    onFailure?: (error: unknown) => T | Promise<T | void> | void,
  ): Promise<T | undefined> {
    const result = await this.lock.withLock(async () => {
      try {
        return await operation();
      } catch (error) {
        logger.error(`${this.instanceName}: Operation failed`, { error });
        // Error will be traced by parent instrumentAsync in PeriodicRunner
        return await onFailure?.(error);
      }
    });

    // Add lock status to current span
    const span = getCurrentSpan();
    span?.setAttribute("lock.acquired", result !== null);
    span?.setAttribute("lock.key", this.lock.key);

    if (result === null) {
      logger.debug(
        `${this.instanceName}: Lock not acquired, another worker is processing`,
      );
    }

    return result ?? undefined;
  }
}
