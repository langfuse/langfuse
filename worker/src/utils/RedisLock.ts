import { randomUUID } from "crypto";
import { logger, redis } from "@langfuse/shared/src/server";

export type LockAcquireResult = "acquired" | "held_by_other" | "skipped";

/**
 * Behavior when Redis is unavailable or errors occur during lock acquisition.
 * - "proceed": Allow processing without the lock (optimistic, for non-critical locks)
 * - "fail": Treat as failure to acquire (pessimistic, for critical locks)
 */
export type OnUnavailableBehavior = "proceed" | "fail";

/**
 * Distributed lock implementation using Redis.
 *
 * Features:
 * - Unique lock ownership via UUID to prevent accidental release of another worker's lock
 * - Atomic release using Lua script for check-and-delete
 * - Configurable behavior when Redis is unavailable
 * - TTL-based expiration as safety net
 *
 * Usage:
 * ```typescript
 * // Optimistic: proceed without lock if Redis unavailable
 * const lock = new RedisLock("my-lock-key", {
 *   ttlSeconds: 300,
 *   onUnavailable: "proceed",
 * });
 *
 * // Pessimistic: fail if Redis unavailable
 * const lock = new RedisLock("critical-lock", {
 *   ttlSeconds: 300,
 *   onUnavailable: "fail",
 * });
 *
 * const result = await lock.withLock(async () => {
 *   // Critical section
 *   return someValue;
 * });
 *
 * if (result === null) {
 *   // Lock was not acquired
 * }
 * ```
 */
export class RedisLock {
  private readonly lockKey: string;
  private readonly lockValue: string;
  private readonly ttlSeconds: number;
  private readonly name: string;
  private readonly onUnavailable: OnUnavailableBehavior;

  // Lua script for atomic check-and-delete (only delete if we own the lock)
  private static readonly RELEASE_LOCK_SCRIPT = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  public get key(): string {
    return this.lockKey;
  }

  constructor(
    lockKey: string,
    options: {
      ttlSeconds: number;
      /** Optional name for logging */
      name?: string;
      /** Behavior when Redis is unavailable. Default: "proceed" */
      onUnavailable?: OnUnavailableBehavior;
    },
  ) {
    this.lockKey = lockKey;
    this.lockValue = randomUUID();
    this.ttlSeconds = options.ttlSeconds;
    this.name = options.name ?? lockKey;
    this.onUnavailable = options.onUnavailable ?? "proceed";
  }

  /**
   * Execute a callback under the distributed lock.
   * Returns null if lock could not be acquired, otherwise returns the callback result.
   */
  public async withLock<T>(fn: () => Promise<T>): Promise<T | null> {
    const lockResult = await this.acquire();

    // Determine if we should proceed based on result and configuration
    const shouldProceed =
      lockResult === "acquired" ||
      (lockResult === "skipped" && this.onUnavailable === "proceed");

    if (!shouldProceed) {
      return null;
    }

    try {
      return await fn();
    } finally {
      // Only release if we actually acquired the lock (not if Redis was unavailable)
      if (lockResult === "acquired") {
        await this.release();
      }
    }
  }

  /**
   * Attempt to acquire the distributed lock.
   *
   * Returns:
   * - "acquired": lock acquired successfully
   * - "held_by_other": lock is held by another worker
   * - "skipped": Redis unavailable, proceeding without lock
   */
  public async acquire(): Promise<LockAcquireResult> {
    if (!redis) {
      logger.warn(`[${this.name}] Redis unavailable, allowing processing`);
      return "skipped";
    }

    // Random jitter (0-10ms) to prevent lock contention when multiple workers start simultaneously
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));

    try {
      const result = await redis.set(
        this.lockKey,
        this.lockValue,
        "EX",
        this.ttlSeconds,
        "NX",
      );
      const acquired = result === "OK";

      if (acquired) {
        logger.debug(
          `[${this.name}] Acquired lock with TTL ${this.ttlSeconds}s`,
        );
        return "acquired";
      }

      return "held_by_other";
    } catch (error) {
      logger.error(
        `[${this.name}] Failed to acquire lock due to an error`,
        error,
      );
      // On error, allow processing but don't claim to hold the lock
      return "skipped";
    }
  }

  /**
   * Release the distributed lock if we own it.
   * Uses a Lua script for atomic check-and-delete to prevent accidentally
   * releasing a lock owned by another worker.
   */
  public async release(): Promise<boolean> {
    if (!redis) {
      return false;
    }

    try {
      const result = await redis.eval(
        RedisLock.RELEASE_LOCK_SCRIPT,
        1,
        this.lockKey,
        this.lockValue,
      );
      if (result === 1) {
        logger.debug(`[${this.name}] Released lock`);
        return true;
      } else {
        logger.warn(
          `[${this.name}] Lock was not released (not owned or already expired)`,
        );
        return false;
      }
    } catch (error) {
      // Log but don't throw - lock will expire via TTL anyway
      logger.error(`[${this.name}] Failed to release lock`, error);
      return false;
    }
  }
}
