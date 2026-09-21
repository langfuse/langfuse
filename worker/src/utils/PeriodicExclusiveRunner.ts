import { logger, getCurrentSpan } from "@langfuse/shared/src/server";
import { PeriodicRunner } from "./PeriodicRunner";
import { OnUnavailableBehavior, RedisLock } from "./RedisLock";

export class PeriodicExclusiveRunnerLeaseLostError extends Error {
  constructor(runnerName: string) {
    super(`${runnerName} lost its lease`);
    this.name = "PeriodicExclusiveRunnerLeaseLostError";
  }
}

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
  private readonly lockExtensionMinIntervalMs: number;
  private lastLockExtensionAt = 0;
  private lockExtensionInFlight: Promise<void> | null = null;

  constructor(params: {
    name: string;
    metricName: string;
    metricScope?: string;
    lockKey: string;
    lockTtlSeconds: number;
    onUnavailable?: OnUnavailableBehavior;
  }) {
    super(params.metricName, params.metricScope);
    this.instanceName = params.name;
    this.lock = new RedisLock(params.lockKey, {
      ttlSeconds: params.lockTtlSeconds,
      name: params.name,
      onUnavailable: params.onUnavailable || "proceed",
      onError: (error) => this.markRunFailed(error),
    });
    this.lockExtensionMinIntervalMs = Math.floor(
      (params.lockTtlSeconds * 1000) / 3,
    );
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
   * Renew the lease when work advances, without issuing one Redis command per
   * progress event. Concurrent callers share the same renewal.
   */
  protected async extendLockOnProgress(force = false): Promise<void> {
    if (
      !force &&
      Date.now() - this.lastLockExtensionAt < this.lockExtensionMinIntervalMs
    ) {
      return;
    }

    if (this.lockExtensionInFlight) {
      return this.lockExtensionInFlight;
    }

    const extension = (async () => {
      if (!(await this.lock.extend())) {
        throw new PeriodicExclusiveRunnerLeaseLostError(this.instanceName);
      }
      this.lastLockExtensionAt = Date.now();
    })();
    this.lockExtensionInFlight = extension;

    try {
      await extension;
    } finally {
      if (this.lockExtensionInFlight === extension) {
        this.lockExtensionInFlight = null;
      }
    }
  }

  /**
   * Execute operation under distributed lock.
   * Returns operation result, onFailure result, or undefined if lock not acquired.
   */
  protected async withLock<T>(
    operation: () => Promise<T>,
    onFailure?: (error: unknown) => T | Promise<T | void> | void,
    onLockNotAcquired?: () => void,
  ): Promise<T | undefined> {
    const result = await this.lock.withLock(async () => {
      this.lastLockExtensionAt = 0;
      try {
        return await operation();
      } catch (error) {
        logger.error(`${this.instanceName}: Operation failed`, { error });
        // This error is intentionally handled below, so instrumentAsync will not see it.
        this.markRunFailed(error);
        return await onFailure?.(error);
      }
    });

    // Add lock status to current span
    const span = getCurrentSpan();
    span?.setAttribute("lock.acquired", result !== null);
    span?.setAttribute("lock.key", this.lock.key);

    if (result === null) {
      this.markRunSkipped();
      onLockNotAcquired?.();
      logger.debug(
        `${this.instanceName}: Lock not acquired, another worker is processing`,
      );
    }

    return result ?? undefined;
  }
}
