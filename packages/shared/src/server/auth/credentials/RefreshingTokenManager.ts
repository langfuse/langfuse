import { logger } from "../../logger";
import type { ManagedAccessToken, ManagedCredentialProvider } from "./types";

/**
 * Provider-agnostic token cache with refresh-ahead scheduling.
 *
 * It owns three responsibilities so individual providers and consumers don't
 * have to: (1) cache the current token, (2) refresh it *before* it expires and
 * notify subscribers so a live connection can re-authenticate without dropping,
 * and (3) single-flight concurrent fetches.
 *
 * The refresh-ahead strategy matches the prior art: schedule the next refresh
 * after `expirationRefreshRatio` of the token's remaining lifetime has elapsed
 * (Redis `@redis/entraid` uses 0.8; Grafana keeps a ~2-minute window). The AWS
 * JDBC wrapper achieves the same with a fixed sub-lifetime TTL (870s for a 900s
 * token); a ratio generalises across providers with different lifetimes.
 */
export interface RefreshingTokenManagerOptions {
  /**
   * Refresh once this fraction (0..1) of the token lifetime has elapsed.
   * Defaults to 0.8 (refresh with 20% of the lifetime still remaining).
   */
  expirationRefreshRatio?: number;
  /** Never schedule a refresh sooner than this many ms from now. Default 1s. */
  minRefreshDelayMs?: number;
  /** Delay before retrying a failed background refresh. Default 5s. */
  retryDelayMs?: number;
}

type RefreshListener = (token: ManagedAccessToken) => void;

const DEFAULT_EXPIRATION_REFRESH_RATIO = 0.8;
const DEFAULT_MIN_REFRESH_DELAY_MS = 1_000;
const DEFAULT_RETRY_DELAY_MS = 5_000;

export class RefreshingTokenManager {
  private readonly provider: ManagedCredentialProvider;
  private readonly expirationRefreshRatio: number;
  private readonly minRefreshDelayMs: number;
  private readonly retryDelayMs: number;

  private current: ManagedAccessToken | null = null;
  private inflight: Promise<ManagedAccessToken> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private readonly listeners = new Set<RefreshListener>();

  constructor(
    provider: ManagedCredentialProvider,
    options: RefreshingTokenManagerOptions = {},
  ) {
    this.provider = provider;
    this.expirationRefreshRatio =
      options.expirationRefreshRatio ?? DEFAULT_EXPIRATION_REFRESH_RATIO;
    this.minRefreshDelayMs =
      options.minRefreshDelayMs ?? DEFAULT_MIN_REFRESH_DELAY_MS;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  /** Fetch the first token and arm the background refresh timer. */
  public async start(): Promise<ManagedAccessToken> {
    return this.getToken();
  }

  /**
   * Return a currently-valid token, fetching one if the cache is empty or
   * expired. Concurrent callers share a single in-flight fetch. Safe to call on
   * a hot path (e.g. node-postgres' per-connection async `password` callback).
   */
  public async getToken(): Promise<ManagedAccessToken> {
    if (this.current && Date.now() < this.current.expiresOnTimestamp) {
      return this.current;
    }
    return this.forceRefresh();
  }

  /** Subscribe to background refreshes. Returns an unsubscribe function. */
  public onRefresh(listener: RefreshListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Stop background refreshes and release the timer. */
  public stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private forceRefresh(): Promise<ManagedAccessToken> {
    if (!this.inflight) {
      this.inflight = this.provider
        .fetchToken()
        .then((token) => {
          this.current = token;
          this.inflight = null;
          this.scheduleRefresh(token);
          return token;
        })
        .catch((error) => {
          this.inflight = null;
          throw error;
        });
    }
    return this.inflight;
  }

  private scheduleRefresh(token: ManagedAccessToken): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);

    const remainingMs = token.expiresOnTimestamp - Date.now();
    const delay = Math.max(
      this.minRefreshDelayMs,
      Math.floor(remainingMs * this.expirationRefreshRatio),
    );

    this.timer = setTimeout(() => {
      this.refreshFromTimer();
    }, delay);
    // Don't keep the Node process alive solely for the refresh timer.
    this.timer.unref?.();
  }

  private async refreshFromTimer(): Promise<void> {
    if (this.stopped) return;
    try {
      const token = await this.provider.fetchToken();
      this.current = token;
      this.notify(token);
      this.scheduleRefresh(token);
    } catch (error) {
      logger.warn(
        `Failed to refresh ${this.provider.name} credentials, retrying in ${this.retryDelayMs}ms`,
        error,
      );
      if (this.stopped) return;
      this.timer = setTimeout(() => {
        this.refreshFromTimer();
      }, this.retryDelayMs);
      this.timer.unref?.();
    }
  }

  private notify(token: ManagedAccessToken): void {
    for (const listener of this.listeners) {
      try {
        listener(token);
      } catch (error) {
        logger.warn(
          `Managed credential refresh listener threw for ${this.provider.name}`,
          error,
        );
      }
    }
  }
}
