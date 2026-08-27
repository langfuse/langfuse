import { logger } from "../../logger";
import type { ManagedAccessToken, ManagedCredentialProvider } from "./types";

export interface RefreshingTokenManagerOptions {
  expirationRefreshRatio?: number;
}

type RefreshListener = (token: ManagedAccessToken) => void;

const DEFAULT_EXPIRATION_REFRESH_RATIO = 0.8;
const MIN_REFRESH_DELAY_MS = 1_000;
const RETRY_DELAY_MS = 5_000;

// Fetches a token, then refreshes it ahead of expiry and notifies subscribers so
// a live connection can re-authenticate before the token rotates.
export class RefreshingTokenManager {
  private readonly provider: ManagedCredentialProvider;
  private readonly expirationRefreshRatio: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private readonly listeners = new Set<RefreshListener>();

  constructor(
    provider: ManagedCredentialProvider,
    options: RefreshingTokenManagerOptions = {},
  ) {
    this.provider = provider;
    const ratio =
      options.expirationRefreshRatio ?? DEFAULT_EXPIRATION_REFRESH_RATIO;
    if (ratio <= 0 || ratio >= 1) {
      throw new RangeError(
        `expirationRefreshRatio must be in the range (0, 1), got ${ratio}`,
      );
    }
    this.expirationRefreshRatio = ratio;
  }

  // Fetch the first token and arm the refresh-ahead timer.
  public async start(): Promise<ManagedAccessToken> {
    this.stopped = false;
    const token = await this.provider.fetchToken();
    this.scheduleRefresh(token);
    return token;
  }

  public onRefresh(listener: RefreshListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleRefresh(token: ManagedAccessToken): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);

    const remainingMs = token.expiresOnTimestamp - Date.now();
    const delay = Math.max(
      MIN_REFRESH_DELAY_MS,
      Math.floor(remainingMs * this.expirationRefreshRatio),
    );

    this.timer = setTimeout(() => {
      this.refreshFromTimer();
    }, delay);
    this.timer.unref?.(); // don't keep the process alive for the refresh timer
  }

  private async refreshFromTimer(): Promise<void> {
    if (this.stopped) return;
    try {
      const token = await this.provider.fetchToken();
      this.notify(token);
      this.scheduleRefresh(token);
    } catch (error) {
      logger.warn(
        `Failed to refresh ${this.provider.name} credentials, retrying in ${RETRY_DELAY_MS}ms`,
        error,
      );
      if (this.stopped) return;
      this.timer = setTimeout(() => {
        this.refreshFromTimer();
      }, RETRY_DELAY_MS);
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
